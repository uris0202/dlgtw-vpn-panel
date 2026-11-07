import ipaddress
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse


class RelayConfigurationError(ValueError):
    pass


def normalize_public_host(value):
    if not isinstance(value, str) or not value or value != value.strip() or "%" in value:
        raise ValueError("Expected an IP address or DNS hostname without spaces")
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        pass
    hostname = value.removesuffix(".").lower()
    labels = hostname.split(".")
    if (
        len(hostname) > 253
        or len(labels) < 2
        or not re.search(r"[a-z]", labels[-1])
        or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
    ):
        raise ValueError("Expected an IP address or DNS hostname, without URL, port or path; use Punycode for IDNs")
    return hostname


def relay_bind_address(configuration):
    host = normalize_public_host(configuration["public_host"])
    address = configuration.get("bind_address")
    if address is None:
        try:
            address = "::" if ipaddress.ip_address(host).version == 6 else "0.0.0.0"
        except ValueError:
            address = "0.0.0.0"
    if address not in {"0.0.0.0", "::"}:
        raise ValueError("Relay bind_address must be 0.0.0.0 or ::")
    return address


def load_relay_routes():
    path = Path(os.getenv("VPN_RELAY_CONFIG", "/app/relay/routes.json"))
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["public_host"] = normalize_public_host(data["public_host"])
        relay_bind_address(data)
        if data["version"] != 1 or not data["routes"]:
            raise ValueError("Empty or unsupported routing configuration")
        ports = set()
        keys = set()
        for route in data["routes"]:
            key = (int(route["server_id"]), int(route["inbound_id"]))
            port = int(route["listen_port"])
            if key in keys or port in ports or not 1024 <= port <= 65535:
                raise ValueError("Duplicate or invalid relay route")
            keys.add(key)
            ports.add(port)
        return data
    except (OSError, KeyError, TypeError, ValueError) as error:
        raise RelayConfigurationError("Invalid VPN relay configuration") from error


def connection_endpoint(server, inbound):
    data = load_relay_routes()
    if data is None:
        return None
    for route in data["routes"]:
        if (
            int(route["server_id"]) == int(server.id)
            and int(route["inbound_id"]) == int(inbound["id"])
        ):
            upstream_host = urlparse(str(server.host)).hostname
            if int(route["upstream_port"]) != int(inbound["port"]) or route["upstream_host"] != upstream_host:
                raise RelayConfigurationError("VPN endpoint changed; regenerate relay routes")
            return data["public_host"], int(route["listen_port"])
    raise RelayConfigurationError("No relay route for this VPN inbound")


