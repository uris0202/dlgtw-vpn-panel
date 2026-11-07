"""Explicit opt-in setup. Existing customer profiles are never repurposed."""

import argparse
import json
import os
from pathlib import Path

from app.services.vless_service import build_vless_url, load_json
from app.services.vpn_canary_service import (
    PROFILE_COMMENT, PROFILE_GROUP, PROFILE_NAME, CanaryConfigurationError,
    build_xray_config, config_path, eligible_inbound,
    load_config, owned_profile, profile_links, valid_name,
)
from app.services.vpn_monitor_service import atomic_json
from app.services.xui_service import XUIService


def find_profile(xui, name):
    seen = set()
    matches = []
    loaded = 0
    total = None
    all_names = set()
    for page in range(1, 101):
        data = xui.get_all(page=page, page_size=200)
        batch = data.get("items") or []
        total = int(data.get("total", len(batch))) if total is None else total
        for item in batch:
            email = item.get("email")
            if not isinstance(email, str) or email in all_names:
                raise CanaryConfigurationError("INCOMPLETE_CLIENT_LIST")
            all_names.add(email)
            if isinstance(email, str) and email.strip().lower() == name.lower() and email not in seen:
                matches.append(item)
                seen.add(email)
        loaded += len(batch)
        if loaded >= total:
            break
        if not batch:
            raise CanaryConfigurationError("INCOMPLETE_CLIENT_LIST")
    if loaded < (total or 0):
        raise CanaryConfigurationError("INCOMPLETE_CLIENT_LIST")
    if len(matches) > 1 or matches and (matches[0].get("email") != name or not owned_profile(matches[0])):
        raise CanaryConfigurationError("NAME_ALREADY_IN_USE")
    return matches[0] if matches else None


def prepare_profiles(servers, name, create=False):
    if not valid_name(name) or not servers or len(servers) > 20:
        raise CanaryConfigurationError("INVALID_SETUP_SCOPE")
    connections = []
    plans = []
    try:
        # Read every server before the first creation; name collisions stop the batch.
        for server in servers:
            xui = XUIService.connect(server, request_timeout=5)
            connections.append(xui)
            existing = find_profile(xui, name)
            if existing:
                profile_links(server, xui, name)
                plans.append((server, xui, None))
                continue
            inbound = next((item for item in xui.get_inbounds() if eligible_inbound(item)), None)
            if inbound is None:
                raise CanaryConfigurationError("NO_SUPPORTED_SERVICE_INBOUND")
            preview = {"id": "c73bb16b-1c16-48b0-9694-bfb657ca9ce8", "email": name, "flow": "xtls-rprx-vision"}
            build_xray_config(build_vless_url(server, inbound, preview, load_json(inbound.get("streamSettings"))), 12345)
            plans.append((server, xui, int(inbound["id"])))
        result = []
        for server, xui, inbound_id in plans:
            state = "existing" if inbound_id is None else "would_create"
            if create and inbound_id is not None:
                xui.add(inbound_id=inbound_id, email=name, days=0, total_gb=0, group=PROFILE_GROUP, comment=PROFILE_COMMENT)
                profile_links(server, xui, name)
                state = "created"
            result.append({"server_id": server.id, "name": server.name, "profile": state})
        return result
    finally:
        for xui in connections:
            try:
                xui.client.close()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--disable", action="store_true")
    action.add_argument("--show", action="store_true")
    parser.add_argument("--client-email", default=PROFILE_NAME)
    parser.add_argument("--create-profile", action="store_true", help="Create a new permanent service profile on enabled servers")
    parser.add_argument("--enable", action="store_true", help="Enable hourly probes after a successful service-profile preflight")
    args = parser.parse_args()
    if (args.disable or args.show) and (args.create_profile or args.enable):
        parser.error("Show/disable cannot be combined with creation or enabling.")
    if args.disable or args.show:
        try:
            config = load_config()
        except CanaryConfigurationError:
            if not args.disable:
                raise
            config = {"version": 1, "enabled": False, "client_email": PROFILE_NAME}
        if args.disable:
            atomic_json(config_path(), {**config, "enabled": False})
        print(json.dumps({"enabled": False if args.disable else config["enabled"], "client_email": config["client_email"]}))
        return 0
    if (args.create_profile or args.enable) and not Path(os.getenv("VPN_CANARY_XRAY_BINARY", "/usr/local/bin/xray")).is_file():
        raise CanaryConfigurationError("XRAY_BINARY_MISSING")
    from app.scripts.monitor_vpn_servers import load_snapshot
    servers, _ = load_snapshot()
    result = prepare_profiles(servers, args.client_email, create=args.create_profile)
    if args.enable and any(item["profile"] == "would_create" for item in result):
        raise CanaryConfigurationError("SERVICE_PROFILES_NOT_CREATED")
    if args.enable:
        # Configuration contains a service name only, never UUIDs or VLESS URLs.
        atomic_json(config_path(), {"version": 1, "enabled": True, "client_email": args.client_email})
    try:
        enabled = load_config()["enabled"]
    except CanaryConfigurationError:
        enabled = None
    print(json.dumps({"enabled": enabled, "created_profiles_only": args.create_profile, "servers": result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    import logging
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    try:
        raise SystemExit(main())
    except CanaryConfigurationError as error:
        print(json.dumps({"error": str(error), "enabled_configuration_not_changed": True}))
        raise SystemExit(1)
    except Exception as error:
        print(json.dumps({"error": type(error).__name__, "details_hidden": True}))
        raise SystemExit(1)
