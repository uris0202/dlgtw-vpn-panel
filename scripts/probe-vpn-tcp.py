"""Print bounded IPv4 TCP probes with source ports for matching packet traces."""

import argparse
from datetime import datetime, timezone
import ipaddress
import json
import socket
import statistics
import time


def run_probes(host, port, attempts=8):
    timings = []
    for number in range(1, attempts + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(3)
            connection.bind(("0.0.0.0", 0))
            source_port = connection.getsockname()[1]
            print(json.dumps({
                "event": "probe_start", "attempt": number,
                "utc": datetime.now(timezone.utc).isoformat(),
                "source_port": source_port, "destination": f"{host}:{port}",
            }), flush=True)
            started = time.monotonic()
            result = {"event": "probe_result", "attempt": number, "source_port": source_port}
            try:
                connection.connect((host, port))
                elapsed = round((time.monotonic() - started) * 1000, 2)
                timings.append(elapsed)
                result.update({"connected": True, "connect_ms": elapsed})
            except OSError as error:
                result.update({"connected": False, "error_type": type(error).__name__,
                               "elapsed_ms": round((time.monotonic() - started) * 1000, 2)})
            print(json.dumps(result), flush=True)
        if number < attempts:
            time.sleep(0.5)
    print(json.dumps({"event": "summary", "attempts": attempts, "connected": len(timings),
                      "failed": attempts - len(timings),
                      "median_connect_ms": round(statistics.median(timings), 2) if timings else None}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", type=ipaddress.IPv4Address)
    parser.add_argument("port", type=int)
    parser.add_argument("--attempts", type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.attempts <= 10:
        parser.error("Port must be 1..65535 and attempts must be 1..10")
    run_probes(str(args.host), args.port, args.attempts)


if __name__ == "__main__":
    main()
