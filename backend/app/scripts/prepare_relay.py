"""Discover existing VLESS endpoints without changing any 3X-UI configuration."""
import re
import argparse
import ipaddress
import json
from pathlib import Path
import socket
import sys

from app.services.vless_service import get_public_host, load_json
from app.services.relay_service import normalize_public_host, relay_bind_address


TCP_TRANSPORTS = {"tcp", "raw", "ws", "grpc", "httpupgrade", "xhttp", "splithttp", "http", "h2"}


def reachable_address(host, port):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    for family, socktype, protocol, _, address in addresses:
        try:
            with socket.socket(family, socktype, protocol) as connection:
                connection.settimeout(5)
                connection.connect(address)
                return str(ipaddress.ip_address(address[0]))
        except OSError:
            continue
    raise ValueError(f"VPN TCP port is unreachable: {host}:{port}")


def plan_routes(endpoints, public_host, previous=None, first_port=24443):
    public_host = normalize_public_host(public_host)
    previous_routes = (previous or {}).get("routes", [])
    previous_ports = {
        (int(route["server_id"]), int(route["inbound_id"])): int(route["listen_port"])
        for route in previous_routes
    }
    used_ports = set(previous_ports.values())
    routes = []
    for endpoint in sorted(endpoints, key=lambda item: (item["server_id"], item["inbound_id"])):
        key = (int(endpoint["server_id"]), int(endpoint["inbound_id"]))
        listen_port = previous_ports.get(key)
        if listen_port is None:
            while first_port in used_ports:
                first_port += 1
            listen_port = first_port
            used_ports.add(listen_port)
        if not 1024 <= listen_port <= 65535:
            raise ValueError("No free relay port in the selected range")
        route = {**endpoint, "listen_port": listen_port}
        previous_route = next(
            (
                item for item in previous_routes
                if int(item["server_id"]) == key[0]
                and int(item["inbound_id"]) == key[1]
            ),
            {},
        )

        for field in ("transport", "tls_port", "tls_server_name"):
            if field in previous_route:
                route[field] = previous_route[field]

        routes.append(route)
    if not routes:
        raise ValueError("No enabled VLESS inbounds found")
    try:
        ipaddress.ip_address(public_host)
        bind_address = relay_bind_address({"public_host": public_host})
    except ValueError:
        bind_address = relay_bind_address(previous or {"public_host": public_host})
    return {"version": 1, "public_host": public_host, "bind_address": bind_address, "routes": routes}


def relay_target_port(route):
    transport = route.get("transport", "tcp")

    if transport == "tls":
        port = int(route["tls_port"])
    elif transport == "tcp":
        port = int(route["upstream_port"])
    else:
        raise ValueError("Unsupported relay transport")

    if not 1 <= port <= 65535:
        raise ValueError("Invalid relay destination port")

    return port



def render_haproxy(configuration):
    bind_address = relay_bind_address(configuration)
    bind_host = f"[{bind_address}]" if ":" in bind_address else bind_address

    lines = [
        "global",
        "    log stdout format raw local0",
        "    maxconn 4096",
        "    stats socket /app/relay/control/admin.sock mode 660 level admin",
        "",
        "defaults",
        "    mode tcp",
        "    log global",
        "    timeout connect 5s",
        "    timeout client 1h",
        "    timeout server 1h",
        "    timeout tunnel 1h",
        "    option clitcpka",
        "    option srvtcpka",
        "",
    ]

    ports = set()

    for route in configuration["routes"]:
        server_id = int(route["server_id"])
        inbound_id = int(route["inbound_id"])
        listen_port = int(route["listen_port"])
        xray_port = int(route["upstream_port"])
        target_port = relay_target_port(route)

        if (
            not 1024 <= listen_port <= 65535
            or not 1 <= xray_port <= 65535
            or listen_port in ports
        ):
            raise ValueError("Invalid or duplicate relay port")

        ports.add(listen_port)

        ip = ipaddress.ip_address(route["upstream_ip"])
        upstream = f"[{ip}]" if ip.version == 6 else str(ip)

        tag = f"vpn_{server_id}_{inbound_id}"
        server_line = f"    server destination {upstream}:{target_port}"

        if route.get("transport", "tcp") == "tls":
            name = route.get(
                "tls_server_name", "germany.dlvpn.internal"
            )
            if not re.fullmatch(r"[A-Za-z0-9.-]{1,253}", name):
                raise ValueError("Invalid TLS server name")

            server_line += (
                " ssl verify required"
                " ca-file /app/relay/tls/ca.crt"
                " crt /app/relay/tls/client.pem"
                f" sni str({name})"
                f" check-sni {name}"
                f" verifyhost {name}"
            )

        server_line += " check inter 10s fall 3 rise 2"

        lines.extend([
            f"listen {tag}",
            f"    bind {bind_host}:{listen_port}",
            "    mode tcp",
            server_line,
            "",
        ])

    return "\n".join(lines)


def discover_endpoints(db):
    from app.services.server_service import ServerService
    from app.services.xui_service import XUIService

    endpoints = []
    for server in ServerService(db).get_all():
        if not server.enabled:
            continue
        xui = None
        try:
            xui = XUIService.connect(server)
            server_endpoints = []
            for inbound in xui.get_inbounds():
                if inbound.get("protocol") != "vless" or not inbound.get("enable", True):
                    continue
                network = load_json(inbound.get("streamSettings")).get("network", "tcp")
                if network not in TCP_TRANSPORTS:
                    raise ValueError(f"Server #{server.id} uses unsupported transport {network}")
                host = get_public_host(server.host)
                port = int(inbound["port"])
                if not 1 <= port <= 65535:
                    raise ValueError("Invalid upstream VPN port")
                upstream_ip = reachable_address(host, port)
                server_endpoints.append({
                    "server_id": server.id, "inbound_id": int(inbound["id"]),
                    "upstream_host": host, "upstream_ip": upstream_ip,
                    "upstream_port": port,
                })
            if not server_endpoints:
                raise ValueError(f"Server #{server.id} has no enabled VLESS inbound")
            endpoints.extend(server_endpoints)
            print(f"Server #{server.id}: {len(server_endpoints)} VPN TCP endpoint(s) reachable", file=sys.stderr)
        except Exception as error:
            # HTTP errors may contain management URLs or credentials.
            raise RuntimeError(f"Unable to prepare server #{server.id} ({type(error).__name__}); check its 3X-UI access and VPN port from this host") from None
        finally:
            if xui is not None:
                xui.client.close()
    return endpoints


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-host")
    parser.add_argument("--render-current", action="store_true")
    parser.add_argument("--output-dir", default="/relay")
    parser.add_argument("--first-port", type=int, default=24443)
    arguments = parser.parse_args()
    if arguments.render_current:
        from app.services.relay_service import load_relay_routes
        configuration = load_relay_routes()
        if configuration is None:
            raise ValueError("Active relay configuration is missing")
        path = Path(arguments.output_dir) / "haproxy.control.next.cfg"
        path.write_text(render_haproxy(configuration), encoding="utf-8")
        path.chmod(0o644)
        return
    if not arguments.public_host:
        parser.error("--public-host is required")
    normalize_public_host(arguments.public_host)
    output = Path(arguments.output_dir)
    previous_path = output / "routes.json"
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else None

    from app.db.database import SessionLocal
    with SessionLocal() as db:
        endpoints = discover_endpoints(db)
    configuration = plan_routes(endpoints, arguments.public_host, previous, arguments.first_port)
    output.mkdir(parents=True, exist_ok=True)
    (output / "haproxy.next.cfg").write_text(render_haproxy(configuration), encoding="utf-8")
    (output / "routes.next.json").write_text(json.dumps(configuration, indent=2) + "\n", encoding="utf-8")
    (output / "ports.next.txt").write_text("".join(f"{route['listen_port']}\n" for route in configuration["routes"]), encoding="ascii")
    (output / "ports.previous.txt").write_text("".join(f"{int(route['listen_port'])}\n" for route in (previous or {}).get("routes", [])), encoding="ascii")
    for route in configuration["routes"]:
        print(f"{configuration['public_host']}:{route['listen_port']} -> server #{route['server_id']}, inbound #{route['inbound_id']} ({route['upstream_ip']}:{route['upstream_port']})")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Relay setup stopped: {error}", file=sys.stderr)
        sys.exit(1)
