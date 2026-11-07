"""Persistent availability incidents. Static REALITY warnings are not outages."""

from collections import defaultdict
import csv
from datetime import datetime, timezone
import io
import json
import logging
import os
from pathlib import Path
import tempfile

from app.services.telegram_service import TelegramNotificationService
from app.services.relay_admin_service import runtime_command


logger = logging.getLogger(__name__)


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def atomic_json(path, data):
    path = Path(path)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def availability(state):
    return {"ok": "up", "error": "down"}.get(state, "unknown")


def observations(report):
    server_id = int(report["server_id"])
    name = " ".join(str(report["server_name"]).split())[:100]
    checks = report.get("checks", {})
    result = {}

    def add(key, label, state):
        result[f"{server_id}:{key}"] = {"server_id": server_id, "name": name, "label": label, "state": state}

    add("probe", "Диагностика сервера", "up")
    add("api", "API 3X-UI (канал управления)", availability(checks.get("xui_api", {}).get("state")))
    add("xray", "Процесс Xray (по данным 3X-UI)", availability(checks.get("xray_runtime", {}).get("state")))
    relay_state = checks.get("relay_config", {}).get("state")
    if report.get("entry_ports") or relay_state == "error":
        add("relay_config", "Соответствие маршрута каскада конфигурации HAProxy", "up" if relay_state == "ok" else "down")
    if any(int(item["port"]) == 443 for item in report.get("entry_ports", [])):
        sni_state = checks.get("edge_sni_sync", {}).get("state")
        if sni_state is not None:
            # A stale sync report is a monitoring incident, not proof of VPN failure.
            add("sni_sync", "Автосинхронизация SNI Edge (ошибка или устаревший статус)",
                "down" if sni_state in {"error", "warning"} else availability(sni_state))
    for field, prefix, title in (("vpn_ports", "vpn", "VPN-порт узла"), ("entry_ports", "entry", "Входной порт каскада")):
        for item in report.get(field, []):
            inbound_id, port = int(item["inbound_id"]), int(item["port"])
            add(f"{prefix}:{inbound_id}", f"{title} {port}, inbound #{inbound_id} (TCP)", availability(item.get("state")))
    return result


def relay_observations(report):
    """HAProxy accepting TCP does not imply its destination is reachable."""
    entries = report.get("entry_ports", [])
    if not entries:
        return {}
    server_id = int(report["server_id"])
    name = " ".join(str(report["server_name"]).split())[:100]
    result = {}

    def add(key, label, state):
        result[f"{server_id}:{key}"] = {"server_id": server_id, "name": name, "label": label, "state": state}

    try:
        body = runtime_command("show stat")
        rows = list(csv.DictReader(io.StringIO(body.removeprefix("# "))))
        if not rows or not {"pxname", "svname", "status"}.issubset(rows[0]):
            raise ValueError("Unsupported HAProxy statistics")
        statuses = {row["pxname"]: row["status"] for row in rows if row["svname"] == "destination"}
        add("relay_probe", "Чтение статуса HAProxy", "up")
        for entry in entries:
            inbound_id = int(entry["inbound_id"])
            value = statuses.get(f"vpn_{server_id}_{inbound_id}", "")
            state = "up" if value == "UP" else "down" if not value or value.startswith(("DOWN", "MAINT", "DRAIN")) else "unknown"
            add(f"relay_backend:{inbound_id}", f"HAProxy → VPN-узел, inbound #{inbound_id} (TCP health check)", state)
    except Exception:
        add("relay_probe", "Статус HAProxy не прочитан; работа каскада неизвестна", "down")
    return result


def confirm_observations(first, second):
    """Only a down result seen in both independent rounds opens an incident."""
    result = {key: dict(item) for key, item in first.items()}
    for key, item in result.items():
        if item["state"] == "down":
            confirmed = second.get(key)
            if confirmed is None:
                item["state"] = "unknown"
            else:
                item.update(confirmed)
        elif key in second and second[key]["state"] != "up":
            item["state"] = "unknown"
    return result


class IncidentStore:
    def __init__(self, path):
        self.path = Path(path)
        self.data = {"version": 1, "incidents": {}}
        if self.path.exists():
            if self.path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("Monitor state is too large")
            value = json.loads(self.path.read_text(encoding="utf-8"))
            if value.get("version") != 1 or not isinstance(value.get("incidents"), dict):
                raise ValueError("Invalid monitor state")
            for item in value["incidents"].values():
                if not isinstance(item, dict) or not all(key in item for key in ("server_id", "name", "label", "active", "notified", "since", "checked_at")):
                    raise ValueError("Invalid incident")
            self.data = value

    def save(self):
        atomic_json(self.path, self.data)

    def publish(self, current, servers, interval):
        from app.services.public_status_service import public_snapshot
        snapshot = public_snapshot(current, self.data["incidents"], {server.id for server in servers}, interval)
        atomic_json(self.path.parent / "public-status.json", snapshot)

    def apply(self, current, enabled_ids, now=None):
        now = now or utc_now()
        incidents = self.data["incidents"]
        disabled_canary_ids = {item["server_id"] for key, item in current.items() if key.endswith(":vpn_session:disabled")}
        # Disabling/removing a server is an admin action, not a verified recovery.
        for key in list(incidents):
            if incidents[key]["server_id"] not in enabled_ids or (
                ":vpn_session:" in key and incidents[key]["server_id"] in disabled_canary_ids
            ):
                del incidents[key]
        for key, item in current.items():
            if item["server_id"] not in enabled_ids:
                continue
            previous = incidents.get(key)
            if item["state"] == "down":
                incidents[key] = {
                    **item, "active": True, "notified": bool(previous and previous["notified"]),
                    "since": previous["since"] if previous else now, "checked_at": now,
                }
            elif item["state"] == "up" and previous:
                if previous["notified"]:
                    previous.update(name=item["name"], label=item["label"], active=False, checked_at=now)
                else:
                    del incidents[key]
            # Unknown/partial TCP results never close an existing incident.

    def deliver(self, credentials, sender=None):
        if not TelegramNotificationService.is_enabled(credentials):
            return 0
        sender = sender or TelegramNotificationService.send_message
        pending = defaultdict(list)
        for key, item in self.data["incidents"].items():
            if not item["active"] or not item["notified"]:
                pending[item["server_id"]].append((key, item))
        sent = 0
        batches = [items[start:start + 12] for items in pending.values() for start in range(0, len(items), 12)]
        for items in batches:
            down = [item for _, item in items if item["active"]]
            recovered = [item for _, item in items if not item["active"]]
            lines = ["DLGTW VPN: изменение доступности", f"Сервер: {items[0][1]['name']}", ""]
            if down:
                lines.append("Повторная проверка подтвердила проблемы:")
                lines.extend(f"- {item['label']}" for item in down)
            if recovered:
                lines.append("Восстановлена доступность:")
                lines.extend(f"- {item['label']}" for item in recovered)
            scope = ("Проверочный HTTPS-запрос через VPN выполнен с сервера панели, не из сети клиента."
                     if any(":vpn_session:" in key for key, _ in items)
                     else "API и TCP проверяются отдельно. Это не проверка VPN-рукопожатия.")
            lines.extend(["", f"Время проверки (UTC): {max(item['checked_at'] for _, item in items)}", scope,
                          "Проверьте раздел Серверы → Диагностика."])
            try:
                sender(credentials.telegram_bot_token, credentials.telegram_chat_id, "\n".join(lines))
            except Exception as error:
                # Do not log Telegram URLs or exception messages containing secrets.
                logger.warning("Monitor Telegram delivery failed (%s); will retry", type(error).__name__)
                continue
            for key, item in items:
                if item["active"]:
                    item["notified"] = True
                else:
                    del self.data["incidents"][key]
            self.save()
            sent += 1
        return sent
