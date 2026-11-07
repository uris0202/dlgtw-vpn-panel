"""Opt-in VLESS HTTPS probes using an isolated, short-lived Xray process."""

import asyncio
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
from urllib.parse import parse_qs, unquote, urlsplit
from uuid import UUID

import httpx

from app.services.vless_service import build_vless_url, load_json
from app.services.xui_service import XUIService


PROFILE_NAME = "dlgtw-monitor"
PROFILE_GROUP = "DLGTW Monitor"
PROFILE_COMMENT = "DLGTW health probe (service profile)"
TARGETS = ("https://www.gstatic.com/generate_204", "https://cp.cloudflare.com/generate_204")


class CanaryConfigurationError(ValueError):
    pass


def config_path():
    return Path(os.getenv("VPN_MONITOR_STATE_DIR", "/var/lib/vpnpanel-monitor")) / "canary.json"


def valid_name(name):
    return isinstance(name, str) and re.fullmatch(r"dlgtw-monitor[A-Za-z0-9_.-]{0,60}", name) is not None


def load_config():
    try:
        with config_path().open("rb") as stream:
            body = stream.read(4097)
        if len(body) > 4096:
            raise CanaryConfigurationError("INVALID_CONFIG")
        value = json.loads(body)
        if not isinstance(value, dict) or type(value.get("version")) is not int or value["version"] != 1 or type(value.get("enabled")) is not bool or not valid_name(value.get("client_email")):
            raise CanaryConfigurationError("INVALID_CONFIG")
        return value
    except FileNotFoundError:
        return {"version": 1, "enabled": False, "client_email": PROFILE_NAME}
    except (OSError, ValueError, TypeError) as error:
        raise CanaryConfigurationError("INVALID_CONFIG") from error


def owned_profile(client):
    return client.get("group") == PROFILE_GROUP and client.get("comment") == PROFILE_COMMENT


def validate_profile(client, name):
    if client.get("email") != name or not owned_profile(client):
        raise CanaryConfigurationError("NOT_A_SERVICE_PROFILE")
    if not client.get("enable", client.get("enabled", False)):
        raise CanaryConfigurationError("SERVICE_PROFILE_DISABLED")
    if any(int(client.get(key) or 0) != 0 for key in ("expiryTime", "totalGB", "limitIp")):
        raise CanaryConfigurationError("SERVICE_PROFILE_LIMITS_CHANGED")


def eligible_inbound(inbound):
    stream = load_json(inbound.get("streamSettings"))
    return (inbound.get("enable", True) and inbound.get("protocol") == "vless"
            and stream.get("network", "tcp") in {"tcp", "raw"} and stream.get("security") in {"reality", "tls"})


def profile_links(server, xui, name):
    client = xui.get(name).get("client") or {}
    validate_profile(client, name)
    identifier = client.get("uuid") or client.get("id")
    result = []
    for inbound in xui.get_inbounds():
        if not eligible_inbound(inbound):
            continue
        matches = [item for item in load_json(inbound.get("settings")).get("clients", [])
                   if item.get("email") == name and (item.get("uuid") or item.get("id")) == identifier]
        for item in matches:
            if not item.get("enable", True):
                continue
            url = build_vless_url(server, inbound, item, load_json(inbound.get("streamSettings")))
            build_xray_config(url, 12345)
            result.append({"inbound_id": int(inbound["id"]), "url": url})
    if not result or len(result) > 8:
        raise CanaryConfigurationError("NO_SUPPORTED_SERVICE_INBOUND")
    return result


def build_xray_config(url, port):
    try:
        if type(port) is not int or not 1024 <= port <= 65535:
            raise ValueError()
        parsed = urlsplit(url)
        query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=30)
        if parsed.scheme != "vless" or parsed.password or not parsed.hostname or not parsed.port or not 1 <= parsed.port <= 65535:
            raise ValueError()
        identifier = str(UUID(unquote(parsed.username or "")))
        if any(len(values) != 1 for values in query.values()):
            raise ValueError()
        value = lambda key, default="": query.get(key, [default])[0]
        if value("type", "tcp") not in {"tcp", "raw"} or value("encryption", "none") != "none" or value("headerType", "none") != "none":
            raise ValueError()
        security = value("security")
        flow = value("flow")
        if security not in {"reality", "tls"} or flow not in {"", "xtls-rprx-vision"} or not value("sni"):
            raise ValueError()
        stream = {"network": "tcp", "security": security}
        if security == "reality":
            if not re.fullmatch(r"[A-Za-z0-9_-]{43}=?", value("pbk")) or not re.fullmatch(r"(?:[0-9a-fA-F]{2}){0,8}", value("sid")):
                raise ValueError()
            stream["realitySettings"] = {"serverName": value("sni"), "fingerprint": value("fp", "chrome"),
                                         "password": value("pbk"), "shortId": value("sid"), "spiderX": value("spx", "/")}
        else:
            stream["tlsSettings"] = {"serverName": value("sni"), "allowInsecure": False}
            if value("alpn"):
                stream["tlsSettings"]["alpn"] = value("alpn").split(",")
        return {"log": {"loglevel": "none", "access": "none", "error": "none"},
                "inbounds": [{"listen": "127.0.0.1", "port": port, "protocol": "http", "tag": "probe", "settings": {}}],
                "outbounds": [{"protocol": "vless", "tag": "vpn", "settings": {"vnext": [{"address": parsed.hostname, "port": parsed.port,
                               "users": [{"id": identifier, "encryption": "none", "flow": flow}]}]}, "streamSettings": stream}],
                "routing": {"rules": [{"type": "field", "inboundTag": ["probe"], "outboundTag": "vpn"}]}}
    except (ValueError, TypeError, AttributeError) as error:
        raise CanaryConfigurationError("UNSUPPORTED_VLESS_PROFILE") from error


@contextmanager
def xray_proxy(url, stop, heartbeat, binary=None):
    binary = binary or os.getenv("VPN_CANARY_XRAY_BINARY", "/usr/local/bin/xray")
    if not Path(binary).is_file():
        raise CanaryConfigurationError("XRAY_BINARY_MISSING")
    process = None
    with tempfile.TemporaryDirectory(prefix="dlgtw-probe-") as directory:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        path = Path(directory) / "probe.json"
        path.write_text(json.dumps(build_xray_config(url, port)), encoding="utf-8")
        path.chmod(0o600)
        environment = {key: os.environ[key] for key in ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TZ") if key in os.environ}
        try:
            process = subprocess.Popen([str(binary), "run", "-config", str(path)], cwd=directory, env=environment,
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline and not stop.is_set() and process.poll() is None:
                heartbeat()
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    stop.wait(0.05)
            else:
                raise CanaryConfigurationError("XRAY_START_FAILED")
            yield f"http://127.0.0.1:{port}", process
        finally:
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


async def https_check(proxy, targets, stop, heartbeat, target_context=None):
    async with httpx.AsyncClient(proxy=proxy, timeout=httpx.Timeout(5, connect=3), trust_env=False, verify=target_context or True, follow_redirects=False) as client:
        for target in targets:
            if stop.is_set():
                return False
            async def request():
                async with client.stream("GET", target) as response:
                    return response.status_code == 204
            try:
                if await asyncio.wait_for(request(), timeout=7):
                    heartbeat()
                    return True
            except (httpx.HTTPError, asyncio.TimeoutError, OSError):
                pass
            heartbeat()
    return False


def probe_vless(url, stop, heartbeat, targets=TARGETS, binary=None, target_context=None):
    if stop.is_set():
        return "unknown"
    with xray_proxy(url, stop, heartbeat, binary) as (proxy, process):
        if asyncio.run(https_check(proxy, targets, stop, heartbeat, target_context)):
            return "up"
        if stop.is_set() or process.poll() is not None:
            return "unknown"
        # A direct control result is never counted as a successful VPN request.
        control = asyncio.run(https_check(None, targets, stop, heartbeat, target_context))
        return "down" if control and not stop.is_set() else "unknown"


def canary_observations(server, stop, heartbeat):
    def observation(suffix, state, label):
        return {f"{server.id}:vpn_session:{suffix}": {"server_id": server.id, "name": " ".join(server.name.split())[:100], "state": state, "label": label}}
    try:
        config = load_config()
        if not config["enabled"]:
            return observation("disabled", "unknown", "Проверочный HTTPS-запрос через VPN отключён")
    except CanaryConfigurationError:
        return observation("config", "unknown", "Настройка полного VPN-запроса требует проверки")
    if stop.is_set():
        return {}
    xui = None
    try:
        xui = XUIService.connect(server, request_timeout=5)
        profiles = profile_links(server, xui, config["client_email"])
        result = {}
        for profile in profiles:
            if stop.is_set():
                break
            heartbeat()
            state = probe_vless(profile["url"], stop, heartbeat)
            result.update(observation(profile["inbound_id"], state, f"Проверочный HTTPS-запрос через VPN, inbound #{profile['inbound_id']} (из сервера панели)"))
        return result
    except Exception:
        # Never expose a VLESS URL, API error, UUID, key, or expired service identity.
        return observation("config", "unknown", "Полный VPN-запрос не выполнен: проверьте служебный профиль и движок")
    finally:
        if xui is not None:
            try:
                xui.client.close()
            except Exception:
                pass
