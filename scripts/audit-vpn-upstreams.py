"""Measure TCP establishment from the relay host without VPN credentials."""

import ipaddress
import json
from pathlib import Path
import socket
import statistics
import sys
import time


def load_targets(path):
    configuration = json.loads(Path(path).read_text(encoding="utf-8"))
    targets = {}
    for route in configuration["routes"]:
        address = str(ipaddress.ip_address(route["upstream_ip"]))
        port = int(route["upstream_port"])
        if not 1 <= port <= 65535:
            raise ValueError("Invalid upstream port")
        key = (address, port)
        targets.setdefault(key, {"server_ids": [], "address": address, "port": port})
        server_id = int(route["server_id"])
        if server_id not in targets[key]["server_ids"]:
            targets[key]["server_ids"].append(server_id)
    if not targets or len(targets) > 20:
        raise ValueError("Expected between 1 and 20 VPN endpoints")
    return list(targets.values())


def measure(target, attempts=3):
    timings = []
    errors = []
    for attempt in range(attempts):
        started = time.monotonic()
        try:
            with socket.create_connection((target["address"], target["port"]), timeout=3):
                timings.append(round((time.monotonic() - started) * 1000, 2))
        except OSError as error:
            errors.append(type(error).__name__)
        if attempt + 1 < attempts:
            time.sleep(0.2)
    return {
        **target,
        "attempts": attempts,
        "connected": len(timings),
        "failed": len(errors),
        "connect_ms_min": min(timings) if timings else None,
        "connect_ms_median": round(statistics.median(timings), 2) if timings else None,
        "connect_ms_max": max(timings) if timings else None,
        "error_types": sorted(set(errors)),
    }


def main():
    targets = load_targets(sys.argv[1] if len(sys.argv) > 1 else "/relay/routes.json")
    print("TCP connection establishment only; this is not a bandwidth or full VLESS test.", flush=True)
    for target in targets:
        print(json.dumps(measure(target)), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"audit_error": type(error).__name__}), flush=True)
        sys.exit(1)
