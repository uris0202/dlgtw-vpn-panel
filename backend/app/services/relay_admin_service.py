from contextlib import contextmanager
from datetime import datetime, timezone
import copy
import ipaddress
import json
import os
from pathlib import Path
import socket
import ssl
import tempfile
from threading import RLock

from app.scripts.prepare_relay import (
    reachable_address,
    render_haproxy,
    relay_target_port,
)
from app.services.relay_service import load_relay_routes
from app.services.vless_service import get_public_host
from app.services.xui_service import XUIService


_lock = RLock()


class RelayUpdateError(Exception):
    pass


def relay_directory():
    return Path(os.getenv("VPN_RELAY_CONFIG", "/app/relay/routes.json")).parent


def runtime_command(command):
    path = os.getenv("VPN_RELAY_SOCKET", str(relay_directory() / "control/admin.sock"))
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(3)
            connection.connect(path)
            connection.sendall((command + "\n").encode("ascii"))
            connection.shutdown(socket.SHUT_WR)
            parts = []
            size = 0
            while True:
                block = connection.recv(65536)
                if not block:
                    break
                size += len(block)
                if size > 1024 * 1024:
                    raise RelayUpdateError("Слишком большой ответ HAProxy.")
                parts.append(block)
        return b"".join(parts).decode("utf-8", errors="replace")
    except OSError as error:
        raise RelayUpdateError("Управление маршрутом недоступно. Выполните установку веб-управления переадресацией.") from error


def runtime_destinations():
    result = {}
    columns = []
    for line in runtime_command("show servers state").splitlines():
        if line.startswith("# "):
            columns = line[2:].split()
        elif columns and line.strip():
            row = dict(zip(columns, line.split()))
            if row.get("srv_name") == "destination":
                try:
                    result[row["be_name"]] = (str(ipaddress.ip_address(row["srv_addr"])), int(row["srv_port"]))
                except (KeyError, ValueError):
                    continue
    return result


def route_name(route):
    return f"vpn_{int(route['server_id'])}_{int(route['inbound_id'])}"


def relay_status(server):
    try:
        configuration = load_relay_routes()
        routes = [route for route in (configuration or {}).get("routes", []) if int(route["server_id"]) == server.id]
        if not routes:
            return {"configured": False, "controllable": False, "synchronized": False}
        controllable = (relay_directory() / "control/admin.sock").exists()
        destinations = runtime_destinations() if controllable else {}
        synchronized = controllable and all(
            route["upstream_host"] == get_public_host(server.host)
            and destinations.get(route_name(route)) == (route["upstream_ip"], relay_target_port(route))
            for route in routes
        )
        return {
            "configured": True, "controllable": controllable, "synchronized": synchronized,
            "endpoints": [f"{configuration['public_host']}:{route['listen_port']}" for route in routes],
            "destinations": [f"{route['upstream_ip']}:{relay_target_port(route)}" for route in routes],
            "transports": [
                {
                    "inbound_id": int(route["inbound_id"]),
                    "mode": route.get("transport", "tcp"),
                    "target_port": relay_target_port(route),
                    "tls_server_name": (
                        route.get("tls_server_name")
                        if route.get("transport") == "tls"
                        else None
                    ),
                }
                for route in routes
            ],
        }
    except Exception:
        return {"configured": True, "controllable": False, "synchronized": False,
                "error": "Не удалось проверить маршрут переадресации."}


@contextmanager
def update_lock():
    with _lock:
        with (relay_directory() / ".web-update.lock").open("a") as handle:
            try:
                import fcntl
            except ImportError:
                fcntl = None
            if fcntl:
                fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl:
                    fcntl.flock(handle, fcntl.LOCK_UN)


def atomic_write(path, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o644)
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)



def verify_relay_tls(address, port, server_name):
    cert_dir = relay_directory() / "tls"

    context = ssl.create_default_context(
        cafile=str(cert_dir / "ca.crt")
    )
    context.load_cert_chain(
        certfile=str(cert_dir / "client.pem")
    )

    with socket.create_connection(
        (str(ipaddress.ip_address(address)), int(port)),
        timeout=5
    ) as tcp:
        with context.wrap_socket(
            tcp, server_hostname=server_name
        ) as tls:
            return tls.version()


def sync_server_relay(server):
    if not server.enabled:
        raise RelayUpdateError("Сервер отключён в панели.")
    with update_lock():
        configuration = load_relay_routes()
        if configuration is None:
            raise RelayUpdateError("Каскад ещё не настроен на сервере сайта.")
        selected = [route for route in configuration["routes"] if int(route["server_id"]) == server.id]
        if not selected:
            raise RelayUpdateError("Для этого сервера ещё не создана переадресация. Нужна первоначальная настройка каскада.")
        live = runtime_destinations()
        for route in selected:
            if route_name(route) not in live:
                raise RelayUpdateError("Маршрут отсутствует в работающем HAProxy. Повторите первоначальную настройку каскада.")
        xui = None
        try:
            xui = XUIService.connect(server)
            inbounds = {int(item["id"]): item for item in xui.get_inbounds()}
        except Exception as error:
            raise RelayUpdateError("Не удалось подключиться к 3X-UI по сохранённому URL. Проверьте IP, порт панели, Base path и учётные данные.") from error
        finally:
            if xui is not None:
                xui.client.close()
        updated = copy.deepcopy(configuration)
        changes = []
        for route in updated["routes"]:
            if int(route["server_id"]) != server.id:
                continue
            inbound = inbounds.get(int(route["inbound_id"]))
            if not inbound or inbound.get("protocol") != "vless" or not inbound.get("enable", True):
                raise RelayUpdateError(f"VLESS inbound #{route['inbound_id']} отсутствует или выключен в 3X-UI.")
            host = get_public_host(server.host)
            try:
                port = int(inbound["port"])
                if not 1 <= port <= 65535:
                    raise ValueError
            except (KeyError, TypeError, ValueError) as error:
                raise RelayUpdateError("3X-UI вернул некорректный VPN-порт.") from error
            try:
                target_port = (
                    relay_target_port(route)
                    if route.get("transport", "tcp") == "tls"
                    else port
                )
                address = reachable_address(host, target_port)
                reachable_address(address, target_port)
                if route.get("transport", "tcp") == "tls":
                    verify_relay_tls(
                        address,
                        target_port,
                        route["tls_server_name"],
                    )
            except Exception as error:
                raise RelayUpdateError(f"Проверка подключения {host}:{target_port} (TCP/TLS) не пройдена.") from error
            route.update(upstream_host=host, upstream_ip=address, upstream_port=port)
            changes.append(route)
        try:
            rendered = render_haproxy(updated)
        except (KeyError, TypeError, ValueError) as error:
            raise RelayUpdateError("Некорректная конфигурация каскада. Проверьте relay/routes.json или восстановите резервную копию.") from error
        directory = relay_directory()
        routes_path = Path(os.getenv("VPN_RELAY_CONFIG", "/app/relay/routes.json"))
        config_path = directory / "haproxy.cfg"
        old_routes, old_config = routes_path.read_text(), config_path.read_text()
        backup = directory / "history" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup.mkdir(parents=True, mode=0o700)
        (backup / "routes.json").write_text(old_routes)
        (backup / "haproxy.cfg").write_text(old_config)
        applied = []
        try:
            for route in changes:
                name = route_name(route)
                target_port = relay_target_port(route)

                applied.append((name, live[name]))

                runtime_command(
                    f"set server {name}/destination addr "
                    f"{route['upstream_ip']} port {target_port}"
                )

                if runtime_destinations().get(name) != (
                    route["upstream_ip"],
                    target_port
                ):
                    raise RelayUpdateError(
                        "HAProxy не подтвердил новый адрес маршрута."
                    )

            atomic_write(config_path, rendered)
            atomic_write(
                routes_path,
                json.dumps(updated, indent=2) + "\n"
            )

        except Exception as error:
            rollback_failed = False

            for name, (address, port) in reversed(applied):
                try:
                    runtime_command(
                        f"set server {name}/destination "
                        f"addr {address} port {port}"
                    )

                    if runtime_destinations().get(name) != (
                        address, port
                    ):
                        rollback_failed = True

                except Exception:
                    rollback_failed = True

            try:
                atomic_write(config_path, old_config)
                atomic_write(routes_path, old_routes)
            except Exception:
                rollback_failed = True

            message = (
                "Не удалось обновить маршрут. "
                "Предыдущая настройка восстановлена."
            )

            if rollback_failed:
                message = (
                    "Ошибка обновления и отката маршрута. "
                    "Требуется проверка HAProxy; "
                    "резервная копия сохранена в relay/history."
                )

            raise RelayUpdateError(message) from error

        return {"success": True, "relay": relay_status(server)}
