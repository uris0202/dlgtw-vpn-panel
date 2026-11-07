"""Allowlisted infrastructure observations, never raw diagnostic reports."""

from datetime import datetime
import json
import math
import os
from pathlib import Path
import time


STATES = {"up", "down", "unknown"}
LAYERS = ("route", "node", "management", "checks")
PUBLIC_KINDS = (*LAYERS, "session")
MAX_BYTES = 512 * 1024


def number(value):
    try:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    except OverflowError:
        return False


def combine(states):
    return "down" if "down" in states else "up" if states and all(state == "up" for state in states) else "unknown"


def observation_state(value):
    return value if isinstance(value, str) and value in STATES else "unknown"


def kind(key):
    suffix = key.split(":", 1)[-1]
    if suffix.startswith("vpn_session:"):
        return "session"
    if suffix == "api":
        return "management"
    if suffix == "xray":
        return "node"
    if suffix.startswith(("vpn:", "entry:", "relay_backend:")) or suffix == "relay_config":
        return "route"
    return "checks"


def public_snapshot(current, incidents, server_ids, interval, now=None):
    now = time.time() if now is None else now
    nodes = []
    for server_id in sorted(server_ids):
        values = {key: observation_state(item.get("state"))
                  for key, item in current.items() if item.get("server_id") == server_id}
        route = combine([value for key, value in values.items() if kind(key) == "route"])
        entries = [key.split(":entry:", 1)[1] for key in values if key.startswith(f"{server_id}:entry:")]
        if route == "up" and (not any(key.startswith(f"{server_id}:vpn:") for key in values)
                              or (entries
                                  and (values.get(f"{server_id}:relay_probe") != "up"
                                       or any(f"{server_id}:relay_backend:{inbound}" not in values for inbound in entries)))):
            route = "unknown"
        active = {}
        for key, item in incidents.items():
            if item.get("server_id") != server_id or item.get("active") is not True:
                continue
            try:
                since = datetime.fromisoformat(item["since"]).timestamp()
            except (ValueError, TypeError, KeyError):
                since = None
            category = kind(key)
            since = since if number(since) and 0 <= since <= now + 30 else None
            previous = active.get(category)
            if category not in active or since is not None and (previous is None or since < previous):
                active[category] = since
        sessions = [value for key, value in values.items() if kind(key) == "session"]
        session = "not_configured" if not sessions or f"{server_id}:vpn_session:disabled" in values else combine(sessions)
        nodes.append({"id": server_id, "route": route, "session": session, "node": values.get(f"{server_id}:xray", "unknown"),
                      "management": values.get(f"{server_id}:api", "unknown"),
                      "checks": combine([value for key, value in values.items() if kind(key) == "checks"]),
                      "incidents": [{"kind": category, "since": since} for category, since in active.items()]})
    return {"version": 1, "checked_at": now, "interval_seconds": interval, "servers": nodes}


def read_json(path):
    with Path(path).open("rb") as stream:
        body = stream.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("Status document is too large")
    value = json.loads(body)
    if not isinstance(value, dict):
        raise ValueError("Invalid status document")
    return value


def public_status(servers, now=None, directory=None):
    now = time.time() if now is None else now
    directory = Path(directory or os.getenv("PUBLIC_STATUS_STATE_DIR", "/var/lib/vpnpanel-monitor"))
    checked_at, interval, fresh, nodes = None, 3600, False, {}
    try:
        snapshot = read_json(directory / "public-status.json")
        health = read_json(directory / "health.json")
        if type(snapshot.get("version")) is not int or snapshot["version"] != 1 or not isinstance(snapshot.get("servers"), list):
            raise ValueError("Unsupported status")
        checked_at, interval = snapshot.get("checked_at"), snapshot.get("interval_seconds")
        heartbeat = health.get("heartbeat")
        if not number(checked_at) or not number(interval) or not 60 <= interval <= 86400:
            raise ValueError("Invalid timestamps")
        fresh = (0 <= now - checked_at < interval + 900 and number(heartbeat)
                 and 0 <= now - heartbeat < 300 and health.get("cycle_error") is not True)
        nodes = {item["id"]: item for item in snapshot["servers"] if isinstance(item, dict) and type(item.get("id")) is int}
    except (OSError, ValueError, KeyError, TypeError):
        checked_at, interval, fresh, nodes = None, 3600, False, {}
    result = []
    for server in servers:
        if not server.enabled:
            continue
        raw = nodes.get(server.id, {}) if fresh else {}
        layers = {key: observation_state(raw.get(key)) for key in LAYERS}
        session = raw.get("session", "not_configured")
        session = session if isinstance(session, str) and session in STATES | {"not_configured"} else "unknown"
        incidents = []
        for item in (raw.get("incidents") or []) if isinstance(raw.get("incidents"), list) else []:
            if not isinstance(item, dict) or not isinstance(item.get("kind"), str) or item["kind"] not in PUBLIC_KINDS:
                continue
            since = item.get("since")
            incidents.append({"kind": item["kind"], "since": since if number(since) and 0 <= since <= now + 30 else None})
        unresolved = {item["kind"] for item in incidents}
        state = "issue" if layers["route"] == "down" or layers["node"] == "down" or session == "down" or unresolved & {"route", "node", "session"} else "ok" if all(value == "up" for value in layers.values()) and session in {"up", "not_configured"} and not incidents else "partial" if layers["route"] == "up" else "unknown"
        result.append({"id": server.id, "name": server.name, "country": server.country,
                       "state": state, **layers, "session": session, "incidents": incidents})
    overall = "issue" if any(item["state"] == "issue" for item in result) else "ok" if result and all(item["state"] == "ok" for item in result) else "partial" if any(item["state"] in {"ok", "partial"} for item in result) else "unknown"
    return {"state": overall, "fresh": fresh, "checked_at": checked_at if number(checked_at) and checked_at <= now else None,
            "interval_seconds": interval, "scope": "vpn_session_and_infrastructure" if any(item["session"] in {"up", "down"} for item in result) else "server_infrastructure",
            "vpn_session_checked": bool(result) and all(item["session"] in {"up", "down"} for item in result),
            "servers": result}
