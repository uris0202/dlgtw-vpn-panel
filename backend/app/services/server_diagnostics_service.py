"""Read-only, separately scoped checks. No full VPN handshake is claimed here."""

import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import re
import socket
import statistics
import time
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.core.config import settings
from app.services.relay_admin_service import relay_status
from app.services.relay_service import load_relay_routes, normalize_public_host
from app.services.xui_service import XUIService, is_certificate_error
from app.services.xui_tls_service import probe_certificate


MAX_INBOUNDS = 12
NETWORKS = {"tcp", "raw", "ws", "grpc", "xhttp", "splithttp", "httpupgrade", "http", "h2"}


def check(state, summary, **values):
    return {"state": state, "summary": summary, **values}


def object_value(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, dict) else {}


def safe_version(value):
    return value if isinstance(value, str) and re.fullmatch(r"v?\d{1,4}(?:\.\d{1,4}){1,3}(?:[-+][A-Za-z0-9_.-]{1,40})?", value) else None


def network_error(error):
    if is_certificate_error(error):
        return "Сертификат HTTPS 3X-UI не прошёл проверку. Проверьте срок, доверие и соответствие адресу."
    if isinstance(error, (httpx.TimeoutException, TimeoutError)):
        return "Истекло время ожидания. Это не доказывает блокировку."
    if isinstance(error, httpx.HTTPStatusError):
        return f"HTTP {error.response.status_code}. Проверьте адрес и доступ к API."
    return "Проверка не выполнена. Проверьте сеть, адрес и учётные данные."


def panel_checks():
    result = {}
    with httpx.Client(timeout=httpx.Timeout(3, connect=2), follow_redirects=False, trust_env=False) as client:
        for key, path in (("website", "/buy"), ("panel_api", "/api/health")):
            started = time.monotonic()
            try:
                with client.stream("GET", settings.PUBLIC_BASE_URL + path) as response:
                    response.raise_for_status()
                    if response.status_code != 200:
                        raise ValueError("Unexpected status")
                    if key == "panel_api":
                        body = b""
                        for chunk in response.iter_bytes(2048):
                            body += chunk
                            if len(body) > 4096:
                                raise ValueError("Unexpected health body")
                        if json.loads(body).get("status") != "ok":
                            raise ValueError("Unhealthy API")
                    elif "text/html" not in response.headers.get("content-type", ""):
                        raise ValueError("Unexpected website content")
                    result[key] = check("ok", "HTTP 200", latency_ms=round((time.monotonic() - started) * 1000, 1))
            except Exception as error:
                result[key] = check("error", network_error(error))
    return result


def tcp_probe(host, port):
    timings = []
    for _ in range(2):
        started = time.monotonic()
        try:
            addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)[:4]
            connected = False
            for family, socktype, protocol, _, address in addresses:
                try:
                    with socket.socket(family, socktype, protocol) as connection:
                        connection.settimeout(1.5)
                        connection.connect(address)
                    connected = True
                    break
                except OSError:
                    continue
            if connected:
                timings.append(round((time.monotonic() - started) * 1000, 1))
        except (OSError, ValueError):
            pass
    state = "ok" if len(timings) == 2 else "warning" if timings else "error"
    return check(state, f"TCP: {len(timings)} из 2 соединений", attempts=2, connected=len(timings),
                 latency_ms=statistics.median(timings) if timings else None)



def edge_reality_sni(inbound):
    import json

    stream = inbound.get("streamSettings") or {}

    if isinstance(stream, str):
        try:
            stream = json.loads(stream)
        except (TypeError, ValueError):
            return None

    if not isinstance(stream, dict) or stream.get("security") != "reality":
        return None

    reality = stream.get("realitySettings") or {}
    if not isinstance(reality, dict):
        return None

    names = reality.get("serverNames") or []
    settings = reality.get("settings") or {}

    if not isinstance(names, list):
        return None

    selected = (
        settings.get("serverName")
        if isinstance(settings, dict)
        else None
    ) or (names[0] if names else None)

    if isinstance(selected, str) and selected in names:
        return selected

    return None


def edge_sni_probe(host, sni):
    import ssl

    if not sni:
        return check(
            "not_checked",
            "Нет согласованного REALITY SNI для проверки публичного входа.",
        )

    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_3

    timings = []
    last_error = ""

    for _ in range(2):
        started = time.monotonic()

        try:
            with socket.create_connection((host, 443), timeout=5) as raw:
                raw.settimeout(5)
                with context.wrap_socket(raw, server_hostname=sni) as tls:
                    if tls.version() != "TLSv1.3":
                        raise ssl.SSLError("Expected TLS 1.3")

            timings.append(round((time.monotonic() - started) * 1000, 1))

        except (OSError, ValueError) as error:
            last_error = type(error).__name__

    state = "ok" if len(timings) == 2 else "warning" if timings else "error"

    return check(
        state,
        f"TLS/SNI: {len(timings)} из 2 рукопожатий · {sni}",
        attempts=2,
        connected=len(timings),
        latency_ms=statistics.median(timings) if timings else None,
        tls_version="TLSv1.3",
        error_type=last_error or None,
    )


def decode_key(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}=?", value):
        raise ValueError("Invalid key format")
    data = base64.urlsafe_b64decode(value.rstrip("=") + "=")
    if len(data) != 32:
        raise ValueError("Invalid key size")
    return data


def reality_audit(inbound):
    stream = object_value(inbound.get("streamSettings"))
    config = object_value(inbound.get("settings"))
    network = stream.get("network", "tcp")
    security = stream.get("security", "none")
    result = {"network": network if network in NETWORKS else "other",
              "security": security if security in {"reality", "tls", "none"} else "other", "findings": []}
    findings = result["findings"]
    if security != "reality":
        return {**result, "state": "not_checked", "summary": "Этот inbound не использует REALITY."}
    reality = object_value(stream.get("realitySettings"))
    client_settings = object_value(reality.get("settings"))
    findings.append(check("ok" if network in {"tcp", "raw", "xhttp", "grpc"} else "warning",
                          "Транспорт поддерживает REALITY." if network in {"tcp", "raw", "xhttp", "grpc"} else "Совместимость транспорта с REALITY требует проверки версии Xray."))
    private_bytes = None
    try:
        private_bytes = decode_key(reality.get("privateKey"))
        X25519PrivateKey.from_private_bytes(private_bytes)
        findings.append(check("ok", "Закрытый ключ задан в ожидаемом формате; значение скрыто."))
    except (ValueError, TypeError):
        findings.append(check("error", "Закрытый ключ REALITY отсутствует или имеет неверный формат."))
    public_value = reality.get("publicKey") or client_settings.get("publicKey") or client_settings.get("password")
    try:
        public_bytes = decode_key(public_value)
        if private_bytes is not None:
            derived = X25519PrivateKey.from_private_bytes(private_bytes).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
            if derived != public_bytes:
                raise ValueError("Mismatched keys")
        findings.append(check("ok", "Клиентский ключ соответствует закрытому ключу; значения скрыты." if private_bytes is not None else "Клиентский ключ задан; соответствие не проверено."))
    except (ValueError, TypeError):
        findings.append(check("warning", "Клиентский ключ в данных 3X-UI отсутствует, некорректен или не соответствует закрытому. Проверьте экспорт профиля."))
    names = reality.get("serverNames")
    try:
        if not isinstance(names, list) or not names or len(names) > 100:
            raise ValueError("Missing names")
        normalized_names = [normalize_public_host(name) for name in names]
        if client_settings.get("serverName") and normalize_public_host(client_settings["serverName"]) not in normalized_names:
            raise ValueError("Mismatched SNI")
        findings.append(check("ok", "serverNames заданы; сохранённый SNI не противоречит списку."))
    except (ValueError, TypeError):
        findings.append(check("error", "Проверьте serverNames и соответствие сохранённого клиентского SNI."))
    target = reality.get("target") or reality.get("dest")
    try:
        parsed = urlsplit("//" + target)
        if not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or not 1 <= parsed.port <= 65535:
            raise ValueError("Invalid target")
        normalize_public_host(parsed.hostname)
        findings.append(check("ok", "target/dest задан как адрес и порт. Его доступность с зарубежного узла не проверялась."))
    except (ValueError, TypeError):
        findings.append(check("warning", "Формат target/dest требует ручной проверки; значение не выводится."))
    short_ids = reality.get("shortIds")
    valid_ids = isinstance(short_ids, list) and 0 < len(short_ids) <= 100 and all(
        isinstance(value, str) and len(value) % 2 == 0 and re.fullmatch(r"[0-9a-fA-F]{0,16}", value) is not None for value in short_ids
    )
    saved_id = client_settings.get("shortId")
    if valid_ids and saved_id is not None and saved_id not in short_ids:
        valid_ids = False
    findings.append(check("ok" if valid_ids else "error", "shortIds имеют допустимый формат; пустая строка разрешена протоколом." if valid_ids else "Проверьте формат shortIds и сохранённый клиентский shortId."))
    clients = config.get("clients")
    if network in {"tcp", "raw"} and isinstance(clients, list):
        active = [item for item in clients[:10000] if isinstance(item, dict) and item.get("enable", True)]
        other = sum(item.get("flow") != "xtls-rprx-vision" for item in active)
        findings.append(check("warning" if other else "ok", f"Клиентов без flow Vision: {other}. Это не всегда ошибка; нужна проверка совместимости." if other else "У проверенных включённых клиентов задан flow Vision."))
    if reality.get("show"):
        findings.append(check("warning", "Для REALITY включён отладочный вывод show. Проверьте необходимость и доступ к журналам."))
    fingerprint = client_settings.get("fingerprint")
    if not isinstance(fingerprint, str) or fingerprint in {"unsafe", ""}:
        findings.append(check("warning", "Клиентский fingerprint не задан в данных 3X-UI или требует проверки. Настройки приложения могут отличаться."))
    state = "error" if any(item["state"] == "error" for item in findings) else "warning" if any(item["state"] == "warning" for item in findings) else "ok"
    return {**result, "state": state, "summary": "Статический аудит настроек, не проверка VPN и не прогноз блокировок."}


def read_runtime(xui):
    try:
        response = xui.client.get("/panel/api/server/status")
        response.raise_for_status()
        data = response.json()
        if data.get("success") is not True:
            raise ValueError("Unsuccessful status")
        status = object_value(object_value(data.get("obj")).get("xray"))
        version = safe_version(status.get("version"))
        if status.get("state") == "running":
            return check("ok", "3X-UI сообщает: Xray запущен.", version=version)
        if status.get("state") in {"stopped", "error", "failed"}:
            return check("error", "3X-UI сообщает: Xray остановлен или завершился с ошибкой.", version=version)
        return check("not_checked", "3X-UI не вернул распознаваемое состояние Xray.", version=version)
    except Exception:
        return check("not_checked", "Версия 3X-UI не предоставила статус Xray или запрос завершился ошибкой.", version=None)



def edge_sni_sync_check(routes, selected_snis):
    import json
    from pathlib import Path

    status_path = Path("/app/relay/sni-sync-status.json")

    try:
        if status_path.stat().st_size > 131072:
            raise ValueError("SNI status is too large")

        status = json.loads(status_path.read_text())

        if not isinstance(status, dict):
            raise ValueError("Invalid SNI status")

        checked_at = status.get("checked_at")
        checked = datetime.fromisoformat(checked_at)

        if checked.tzinfo is None:
            raise ValueError("Missing timezone")

        age = (
            datetime.now(timezone.utc)
            - checked.astimezone(timezone.utc)
        ).total_seconds()

        if status.get("state") != "ok":
            return check(
                "error",
                "Последняя синхронизация SNI завершилась ошибкой.",
                checked_at=checked_at,
            )

        if age > 180 or age < -60:
            return check(
                "warning",
                "Отчёт SNI устарел или имеет неверное время.",
                checked_at=checked_at,
            )

        mapped = status.get("routes")
        count = status.get("route_count")

        if not isinstance(mapped, dict) or count != len(mapped):
            raise ValueError("Invalid route list")

        if mapped.get("dlgtw.ru") != "website":
            return check("error", "Маршрут сайта отсутствует в SNI Map.")

        if not routes:
            return check(
                "not_checked",
                "Для сервера нет сохранённого маршрута Edge.",
            )

        port_backend = {
            24443: "germany",
            24444: "netherlands",
            24445: "poland",
        }

        verified = []

        for route in routes:
            inbound_id = int(route["inbound_id"])
            port = int(route["listen_port"])

            expected = port_backend.get(port)
            selected = selected_snis.get(inbound_id)

            if not expected or not selected:
                return check(
                    "warning",
                    "Не удалось определить маршрут или REALITY SNI.",
                    checked_at=checked_at,
                )

            actual = mapped.get(selected)

            if actual != expected:
                return check(
                    "error",
                    f"SNI {selected}: ожидается {expected}, "
                    f"в HAProxy Map найдено {actual or 'нет маршрута'}.",
                    checked_at=checked_at,
                )

            verified.append(selected)

        return check(
            "ok",
            f"Текущие SNI соответствуют маршрутам Edge: "
            f"{', '.join(verified)}. Всего записей: {count}.",
            checked_at=checked_at,
            route_count=count,
            sni_names=verified,
        )

    except (OSError, ValueError, TypeError, KeyError):
        return check(
            "warning",
            "Статус SNI недоступен или некорректен.",
        )


def diagnose_server(server):
    report = {
        "server_id": server.id, "server_name": server.name,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "vantage": "Контейнер backend панели; пользовательские сети и сеть host HAProxy отдельно не проверены.",
        "checks": {}, "inbounds": [],
        "limits": ["Это не проверка VLESS/REALITY-рукопожатия и передачи данных через VPN.",
                   "Неудачная проба не доказывает блокировку. Успешный TCP не доказывает работу VPN.",
                   "Публичный вход из контейнера может быть недоступен из-за ограничений hairpin/NAT."],
    }
    report["checks"]["vpn_session"] = check("not_checked", "Полноценное VPN-подключение не выполнялось. Нужна проверка из v2rayTun.")
    report["checks"]["subscription"] = check("not_checked", "Клиентская подписка не запрашивалась; её токены и UUID не используются.")
    if not server.enabled:
        report["checks"]["xui_api"] = check("disabled", "Сервер отключён в панели. Сетевые проверки не запускались.")
        return report
    parsed = urlsplit(str(server.host))
    host = parsed.hostname
    if not host:
        report["checks"]["xui_api"] = check("error", "Некорректный адрес 3X-UI.")
        return report
    configuration = None
    try:
        configuration = load_relay_routes()
        routes = [route for route in (configuration or {}).get("routes", []) if int(route["server_id"]) == server.id][:MAX_INBOUNDS]
        if any(not 1 <= int(route["upstream_port"]) <= 65535 for route in routes):
            raise ValueError("Invalid saved upstream port")
        relay = relay_status(server)
        report["checks"]["relay_config"] = check("ok" if relay.get("synchronized") else "warning", "Маршрут соответствует работающему HAProxy." if relay.get("synchronized") else "Маршрут отсутствует, не синхронизирован или runtime HAProxy недоступен.")
    except Exception:
        configuration = None
        routes = []
        report["checks"]["relay_config"] = check("error", "Конфигурация каскада не прочитана. Ничего не менялось.")
    probe_targets = {}
    edge_snis = {}
    for route in routes:
        port = int(route["upstream_port"])
        if 1 <= port <= 65535:
            probe_targets[int(route["inbound_id"])] = (host, port)
    xui = None
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=4) as executor:
        panel_future = executor.submit(panel_checks)
        tls_future = executor.submit(probe_certificate, str(server.host))
        try:
            xui = XUIService.connect(server, request_timeout=4.0)
            raw = xui.get_inbounds()
            if not isinstance(raw, list):
                raise ValueError("Invalid inbound list")
            report["checks"]["xui_api"] = check("ok", "Вход в 3X-UI и чтение inbounds успешны.", latency_ms=round((time.monotonic() - started) * 1000, 1))
            report["checks"]["xray_runtime"] = read_runtime(xui)
            selected = [item for item in raw if isinstance(item, dict) and item.get("protocol") == "vless"]
            if len(selected) > MAX_INBOUNDS:
                report["limits"].append(f"Аудит ограничен первыми {MAX_INBOUNDS} VLESS inbounds.")
            for inbound in selected[:MAX_INBOUNDS]:
                try:
                    inbound_id, port = int(inbound["id"]), int(inbound["port"])
                    if not 1 <= port <= 65535:
                        raise ValueError("Invalid port")
                except (KeyError, TypeError, ValueError):
                    report["limits"].append("Пропущен inbound с некорректным ID или портом.")
                    continue
                enabled = inbound.get("enable", True) is not False
                try:
                    audit = reality_audit(inbound)
                except Exception:
                    audit = {"state": "warning", "summary": "Формат настроек не распознан. Требуется ручная проверка.", "network": "other", "security": "other", "findings": []}
                report["inbounds"].append({"id": inbound_id, "port": port, "enabled": enabled, "audit": audit})
                edge_snis[inbound_id] = edge_reality_sni(inbound) if enabled else None
                matching_routes = [route for route in routes if int(route["inbound_id"]) == inbound_id]
                if enabled and configuration is not None and (not matching_routes or any(int(route["upstream_port"]) != port for route in matching_routes)):
                    report["checks"]["relay_config"] = check("warning", "Текущий inbound и сохранённый маршрут различаются. Автоматическое обновление не выполнялось.")
                if enabled:
                    probe_targets[inbound_id] = (host, port)
                else:
                    probe_targets.pop(inbound_id, None)
        except Exception as error:
            report["checks"]["xui_api"] = check("error", network_error(error))
            report["checks"]["xray_runtime"] = check("not_checked", "Статус Xray не получен.", version=None)
        finally:
            if xui is not None:
                try:
                    xui.client.close()
                except Exception:
                    pass
        futures = {key: executor.submit(tcp_probe, *target) for key, target in probe_targets.items()}
        entry_futures = {}
        for route in routes:
            entry_futures[int(route["inbound_id"])] = executor.submit(edge_sni_probe, configuration["public_host"], edge_snis.get(int(route["inbound_id"])))
        try:
            report["checks"].update(panel_future.result())
        except Exception:
            report["checks"].update({key: check("error", "HTTP-проверка не завершена.") for key in ("website", "panel_api")})
        try:
            report["checks"]["management_tls"] = tls_future.result()
        except Exception:
            report["checks"]["management_tls"] = check("not_checked", "Отдельная проверка сертификата не завершена. Рабочие запросы не блокируются.", policy="warning_only", verification_enforced=False)
        report["vpn_ports"] = [{"inbound_id": key, "port": probe_targets[key][1], **future.result()} for key, future in futures.items()]
        entry_ports = {int(route["inbound_id"]): 443 for route in routes}
        report["entry_ports"] = [{"inbound_id": key, "port": entry_ports[key], **future.result()} for key, future in entry_futures.items()]
    report["checks"]["edge_sni_sync"] = edge_sni_sync_check(routes, edge_snis)
    if not probe_targets:
        report["limits"].append("VPN-порты не определены: API не ответил и/или нет сохранённых маршрутов.")
    return report
