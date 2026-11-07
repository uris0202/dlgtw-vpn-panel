from __future__ import annotations

import copy
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time

from app.scripts.prepare_relay import reachable_address, relay_target_port, render_haproxy
from app.services.relay_admin_service import (
    RelayUpdateError,
    atomic_write,
    relay_directory,
    relay_status,
    route_name,
    runtime_destinations,
    update_lock,
    verify_relay_tls,
)
from app.services.relay_service import load_relay_routes
from app.services.vless_service import get_public_host


MASTER_SOCKET = "control/master.sock"


def _master_reload():
    path = relay_directory() / MASTER_SOCKET
    chunks = []
    size = 0
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(35)
            connection.connect(str(path))
            connection.sendall(b"reload\n")
            connection.shutdown(socket.SHUT_WR)
            while True:
                chunk = connection.recv(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > 2 * 1024 * 1024:
                    raise RelayUpdateError("HAProxy returned excessive reload output")
                chunks.append(chunk)
    except (OSError, TimeoutError) as error:
        raise RelayUpdateError("Master CLI недоступен или не ответил на reload") from error
    output = b"".join(chunks).decode("utf-8", "replace")
    if "Success=1" not in output:
        raise RelayUpdateError("HAProxy отклонил reload: " + output[-600:])
    return output



def _preflight_haproxy(config: str) -> None:
    path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".cfg",
            delete=False,
        ) as handle:
            handle.write(config)
            path = handle.name

        result = subprocess.run(
            ["haproxy", "-c", "-f", path],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

        if result.returncode != 0:
            detail = (result.stderr + result.stdout).strip()
            raise RelayUpdateError(
                "Конфигурация HAProxy не прошла проверку: "
                + detail[-800:]
            )

    except (OSError, subprocess.TimeoutExpired) as error:
        raise RelayUpdateError(
            "Не удалось проверить конфигурацию HAProxy"
        ) from error
    finally:
        if path:
            Path(path).unlink(missing_ok=True)


def _all_runtime_routes_match(configuration):
    expected = {
        route_name(route): (
            str(ipaddress.ip_address(route["upstream_ip"])),
            relay_target_port(route),
        )
        for route in configuration["routes"]
    }

    for attempt in range(12):
        try:
            live = runtime_destinations()
            if all(
                live.get(name) == target
                for name, target in expected.items()
            ):
                return True
        except RelayUpdateError:
            pass

        time.sleep(0.25)

    return False


def _new_runtime_state(name: str, address: str, port: int):
    for attempt in range(12):
        try:
            if runtime_destinations().get(name) == (address, port):
                return True
        except RelayUpdateError:
            pass
        time.sleep(0.25)
    return False


def update_relay_transport(server, payload):
    if not server.enabled:
        raise RelayUpdateError("VPN-сервер отключён в панели")
    master_socket = relay_directory() / MASTER_SOCKET
    if not master_socket.exists():
        raise RelayUpdateError(
            "Управление транспортом ещё не активировано: отсутствует Master CLI HAProxy. "
            "Нужна однократная настройка профиля relay."
        )

    inbound_id = int(payload["inbound_id"])
    mode = payload["mode"]
    if mode not in ("tcp", "tls"):
        raise RelayUpdateError("Недопустимый транспорт")

    with update_lock():
        configuration = load_relay_routes()
        if configuration is None:
            raise RelayUpdateError("Маршруты VPN не настроены")
        updated = copy.deepcopy(configuration)
        matches = [r for r in updated["routes"]
                   if int(r["server_id"]) == server.id and int(r["inbound_id"]) == inbound_id]
        if len(matches) != 1:
            raise RelayUpdateError("Маршрут указанного inbound не найден")
        route = matches[0]
        name = route_name(route)
        if route["upstream_host"] != get_public_host(server.host):
            raise RelayUpdateError("Адрес панели изменился. Сначала обновите маршрут VPN.")

        old_port = relay_target_port(route)
        old_ip = str(ipaddress.ip_address(route["upstream_ip"]))
        live = runtime_destinations()
        if live.get(name) != (old_ip, old_port):
            raise RelayUpdateError("Текущий HAProxy не совпадает с routes.json. Сначала восстановите маршрут.")

        if mode == "tls":
            port = payload.get("tls_port")
            sni = (payload.get("tls_server_name") or "").strip()
            if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
                raise RelayUpdateError("Укажите порт TLS от 1 до 65535")
            if not re.fullmatch(r"[A-Za-z0-9.-]{1,253}", sni) or ".." in sni or sni.startswith(".") or sni.endswith("."):
                raise RelayUpdateError("Некорректное TLS-имя сертификата")
            route.update(transport="tls", tls_port=port, tls_server_name=sni)
            try:
                reachable_address(old_ip, port)
                verify_relay_tls(old_ip, port, sni)
            except Exception as error:
                raise RelayUpdateError("mTLS-проверка нового транспорта не прошла; настройки не изменены") from error
        else:
            port = int(route["upstream_port"])
            route["transport"] = "tcp"
            route.pop("tls_port", None)
            route.pop("tls_server_name", None)
            try:
                reachable_address(old_ip, port)
            except Exception as error:
                raise RelayUpdateError("TCP-порт исходного Xray недоступен; настройки не изменены") from error

        route_dir = relay_directory()
        config_path = route_dir / "haproxy.cfg"
        routes_path = Path(os.getenv("VPN_RELAY_CONFIG", "/app/relay/routes.json"))
        old_conf = config_path.read_text()
        old_routes = routes_path.read_text()
        if old_conf.strip() != render_haproxy(configuration).strip():
            raise RelayUpdateError("Конфигурация HAProxy отличается от routes.json. Изменение отменено.")
        proposed = render_haproxy(updated)
        if old_conf.strip() == proposed.strip():
            return {"success": True, "relay": relay_status(server)}

        _preflight_haproxy(proposed)

        backup = route_dir / "history" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup.mkdir(parents=True, mode=0o700)
        (backup / "routes.json").write_text(old_routes)
        (backup / "haproxy.cfg").write_text(old_conf)

        try:
            atomic_write(config_path, proposed)
            atomic_write(routes_path, json.dumps(updated, indent=2) + "\n")
            _master_reload()
            if not _all_runtime_routes_match(updated):
                raise RelayUpdateError("Не все VPN-маршруты подтверждены после reload")
        except Exception as error:
            rollback_failed = False
            try:
                atomic_write(config_path, old_conf)
                atomic_write(routes_path, old_routes)
                _master_reload()
                if not _all_runtime_routes_match(configuration):
                    rollback_failed = True
            except Exception:
                rollback_failed = True
            if rollback_failed:
                raise RelayUpdateError(
                    "Ошибка применения и отката! Проверьте HAProxy; копия в relay/history."
                ) from error
            raise RelayUpdateError("Изменение транспорта отклонено. Старый маршрут восстановлен.") from error

        return {"success": True, "relay": relay_status(server)}
