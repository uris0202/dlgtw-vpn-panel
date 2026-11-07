"""Prepare and run an isolated, time-limited VPN entry on a new server."""

import argparse
from datetime import datetime, timezone
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
from threading import Thread
import time


def ipv4(value):
    return str(ipaddress.IPv4Address(value))


def port_number(value):
    value = int(value)
    if not 1024 <= value <= 65535:
        raise ValueError("Test ports must be in 1024..65535")
    return value


def make_manifest(configuration, entry_ip, web_port=18080):
    routes = []
    seen = set()
    keys = set()
    for raw in configuration["routes"]:
        port = port_number(raw["listen_port"])
        key = (int(raw["server_id"]), int(raw["inbound_id"]))
        upstream_port = int(raw["upstream_port"])
        if key in keys or port in seen or not 1 <= upstream_port <= 65535:
            raise ValueError("Invalid or duplicate route")
        routes.append({
            "server_id": key[0], "inbound_id": key[1], "listen_port": port,
            "upstream_ip": str(ipaddress.ip_address(raw["upstream_ip"])),
            "upstream_port": upstream_port,
        })
        keys.add(key)
        seen.add(port)
    if not routes or len(routes) > 20:
        raise ValueError("Expected 1..20 existing relay routes")
    web_port = port_number(web_port)
    if web_port in seen:
        raise ValueError("Web test port conflicts with a VPN port")
    return {"version": 1, "entry_ip": ipv4(entry_ip), "web_port": web_port, "routes": routes}


def validate_manifest(manifest):
    if manifest["version"] != 1:
        raise ValueError("Unsupported test manifest")
    return make_manifest(manifest, manifest["entry_ip"], manifest["web_port"])


def render_config(manifest):
    manifest = validate_manifest(manifest)
    lines = [
        "global", "    maxconn 128", "    user haproxy", "    group haproxy", "", "defaults", "    mode tcp",
        "    timeout connect 5s", "    timeout client 2m", "    timeout server 2m",
        "    timeout tunnel 2m", "    option clitcpka", "    option srvtcpka", "",
    ]
    for index, route in enumerate(manifest["routes"]):
        upstream = route["upstream_ip"]
        if ":" in upstream:
            upstream = f"[{upstream}]"
        lines.extend([
            f"listen test_{index}",
            f"    bind {manifest['entry_ip']}:{route['listen_port']}",
            f"    server destination {upstream}:{route['upstream_port']}", "",
        ])
    return "\n".join(lines)


def prepare(source, entry_ip, output, web_port=18080):
    source = Path(source).resolve(strict=True)
    manifest = make_manifest(json.loads(source.read_text(encoding="utf-8")), entry_ip, web_port)
    output = Path(output).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (output / "haproxy-test.cfg").write_text(render_config(manifest), encoding="ascii")
    shutil.copyfile(Path(__file__), output / "vpn-entry-test.py")
    shutil.copyfile(Path(__file__).with_name("vpn-entry-speed.html"), output / "vpn-entry-speed.html")
    print(json.dumps({"bundle": str(output), "entry_ip": manifest["entry_ip"],
                      "ports": [route["listen_port"] for route in manifest["routes"]],
                      "web_port": manifest["web_port"], "production_changed": False}))
    return manifest


def local_ipv4_addresses():
    completed = subprocess.run(["ip", "-j", "-4", "addr", "show", "scope", "global"],
                               check=True, capture_output=True, text=True, timeout=10)
    return {ipv4(address["local"]) for interface in json.loads(completed.stdout)
            for address in interface.get("addr_info", []) if address.get("family") == "inet"}


def check_machine(manifest):
    if manifest["entry_ip"] not in local_ipv4_addresses():
        raise ValueError(f"Wrong machine: {manifest['entry_ip']} is not assigned here. Do not run this on the production server.")
    sockets = []
    try:
        ports = [manifest["web_port"]] + [route["listen_port"] for route in manifest["routes"]]
        for port in ports:
            connection = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sockets.append(connection)
            connection.bind((manifest["entry_ip"], port))
            connection.listen(1)
    finally:
        for connection in sockets:
            connection.close()


def probe_routes(manifest):
    for route in manifest["routes"]:
        started = time.monotonic()
        result = {"server_id": route["server_id"], "listen_port": route["listen_port"]}
        try:
            with socket.create_connection((route["upstream_ip"], route["upstream_port"]), timeout=3):
                result.update(connected=True, connect_ms=round((time.monotonic() - started) * 1000, 2))
        except OSError as error:
            result.update(connected=False, error_type=type(error).__name__)
        print(json.dumps({"stage": "upstream_tcp_only", **result}), flush=True)


class TestHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, manifest, html, expires_at, **kwargs):
        self.manifest = manifest
        self.html = html
        self.expires_at = expires_at
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path == "/":
            body, kind = self.html, "text/html; charset=utf-8"
        elif self.path == "/status":
            body = json.dumps({"entry_ip": self.manifest["entry_ip"],
                               "ports": [route["listen_port"] for route in self.manifest["routes"]],
                               "upstream_ips": sorted({route["upstream_ip"] for route in self.manifest["routes"]}),
                               "expires_at": self.expires_at}).encode()
            kind = "application/json"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' https://speed.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class TestHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address


def stop_process(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=7)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def run(bundle, seconds=600):
    if not 30 <= seconds <= 900:
        raise ValueError("Duration must be 30..900 seconds")
    bundle = Path(bundle).resolve(strict=True)
    manifest = validate_manifest(json.loads((bundle / "manifest.json").read_text(encoding="utf-8")))
    check_machine(manifest)
    haproxy = shutil.which("haproxy")
    if not haproxy:
        raise ValueError("Install haproxy on the NEW server first: apt-get update && apt-get install -y --no-install-recommends haproxy")
    timeout = shutil.which("timeout")
    if not timeout:
        raise ValueError("GNU timeout from coreutils is required to enforce the independent test deadline")
    config = bundle / "haproxy-test.cfg"
    config.write_text(render_config(manifest), encoding="ascii")
    subprocess.run([haproxy, "-c", "-f", str(config)], check=True, timeout=10)
    html = (bundle / "vpn-entry-speed.html").read_bytes()
    probe_routes(manifest)
    expires_at = datetime.fromtimestamp(time.time() + seconds, timezone.utc).isoformat()
    handler = partial(TestHandler, manifest=manifest, html=html, expires_at=expires_at)
    httpd = TestHTTPServer((manifest["entry_ip"], manifest["web_port"]), handler)
    process = None
    thread = None
    try:
        process = subprocess.Popen([timeout, "--signal=TERM", "--kill-after=5s", f"{seconds}s", haproxy, "-db", "-f", str(config)], start_new_session=True)
        thread = Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        print(f"Temporary entry: {manifest['entry_ip']}; speed page: http://{manifest['entry_ip']}:{manifest['web_port']}/", flush=True)
        print(f"Stops after {seconds} seconds or Ctrl+C. Do not change production DNS or subscriptions.", flush=True)
        try:
            code = process.wait(timeout=seconds + 10)
            if code == 124:
                print("Test time limit reached.", flush=True)
            elif code:
                raise ValueError(f"Test HAProxy exited with code {code}; check for occupied ports")
        except subprocess.TimeoutExpired:
            print("Test time limit reached.", flush=True)
        except KeyboardInterrupt:
            print("Test interrupted.", flush=True)
    finally:
        stop_process(process)
        if thread is not None:
            httpd.shutdown()
        httpd.server_close()
        if thread is not None:
            thread.join(timeout=5)
        print("Temporary test listeners stopped. Production configuration was not changed.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("prepare")
    command.add_argument("--source", default="relay/routes.json")
    command.add_argument("--entry-ip", required=True)
    command.add_argument("--output", required=True)
    command.add_argument("--web-port", type=int, default=18080)
    command = commands.add_parser("run")
    command.add_argument("--bundle", default=str(Path(__file__).resolve().parent))
    command.add_argument("--seconds", type=int, default=600)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare(args.source, args.entry_ip, args.output, args.web_port)
    else:
        run(args.bundle, args.seconds)


if __name__ == "__main__":
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, interrupted)
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f"Test stopped: {error}", file=sys.stderr)
        sys.exit(1)
