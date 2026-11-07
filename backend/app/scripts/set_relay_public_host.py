"""Change only the advertised VPN entry address, without restarting HAProxy."""

import argparse
import copy
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys

from app.scripts.prepare_relay import render_haproxy
from app.services.relay_admin_service import atomic_write, relay_directory, update_lock
from app.services.relay_service import load_relay_routes, normalize_public_host, relay_bind_address


def verify_dns(host, expected_ips):
    expected = {str(ipaddress.ip_address(value)) for value in expected_ips}
    if not expected:
        raise ValueError("At least one --expected-ip is required for a DNS hostname")
    try:
        addresses = {
            str(ipaddress.ip_address(result[4][0]))
            for result in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        }
    except OSError as error:
        raise ValueError(f"DNS lookup failed for {host}. Create its A record before switching.") from error
    if addresses != expected:
        raise ValueError(
            f"DNS mismatch for {host}: resolved {sorted(addresses)}, expected {sorted(expected)}. "
            "Check A/AAAA records, DNS cache and DNS-only mode. Nothing was changed."
        )
    return sorted(addresses)


def set_public_host(host, expected_ips=(), *, check_only=False):
    host = normalize_public_host(host)
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        addresses = verify_dns(host, expected_ips)
    else:
        addresses = [str(address)]
        if expected_ips and set(addresses) != {str(ipaddress.ip_address(value)) for value in expected_ips}:
            raise ValueError("The public IP does not match --expected-ip")
    with update_lock():
        configuration = load_relay_routes()
        if configuration is None:
            raise ValueError("Active relay/routes.json is missing. Configure the relay first.")
        family = 6 if relay_bind_address(configuration) == "::" else 4
        if any(ipaddress.ip_address(address).version != family for address in addresses):
            raise ValueError("DNS address family does not match the existing HAProxy listener. Check A/AAAA records.")
        updated = copy.deepcopy(configuration)
        updated["public_host"] = host
        updated["bind_address"] = relay_bind_address(configuration)
        if render_haproxy(updated) != render_haproxy(configuration):
            raise ValueError("Changing the advertised host must not change the HAProxy listeners or destinations")
        result = {
            "public_host": host,
            "previous_public_host": configuration["public_host"],
            "resolved_addresses": addresses,
            "ports": [int(route["listen_port"]) for route in configuration["routes"]],
            "check_only": check_only,
            "changed": False,
        }
        if check_only or configuration["public_host"] == host:
            return result
        directory = relay_directory()
        routes_path = Path(os.getenv("VPN_RELAY_CONFIG", "/app/relay/routes.json"))
        old_routes = routes_path.read_text()
        config_path = directory / "haproxy.cfg"
        old_config = config_path.read_text()
        backup = directory / "history" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-public-host")
        backup.mkdir(parents=True, mode=0o700)
        (backup / "routes.json").write_text(old_routes)
        (backup / "haproxy.cfg").write_text(old_config)
        written = False
        try:
            atomic_write(routes_path, json.dumps(updated, indent=2) + "\n")
            written = True
            if load_relay_routes() != updated:
                raise ValueError("Saved relay configuration did not pass verification")
        except Exception:
            if written:
                atomic_write(routes_path, old_routes)
            raise
        return {**result, "changed": True, "backup": str(backup)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-host", required=True)
    parser.add_argument("--expected-ip", action="append", default=[])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    print(json.dumps(set_public_host(args.public_host, args.expected_ip, check_only=args.check), sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Public VPN host update stopped: {error}", file=sys.stderr)
        sys.exit(1)
