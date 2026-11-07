"""Read-only subscription diagnostics. Run inside the existing backend container."""

from datetime import datetime, timezone
import json
import sys
import time


def check_http_subscription(order_id):
    import base64
    import httpx
    from urllib.parse import urlsplit

    from app.core.config import settings
    from app.db.database import SessionLocal
    from app.services.order_service import OrderService
    from app.services.subscription_service import subscription_signature

    with SessionLocal() as db:
        anchor = OrderService(db).get(order_id)
        if anchor is None:
            print(json.dumps({"order_id": order_id, "error": "order_not_found"}))
            return 1
        signature = subscription_signature(anchor, settings.JWT_SECRET)
        path = f"http://127.0.0.1:8000/public/subscriptions/{order_id}/{signature}"
    started = time.monotonic()
    with httpx.Client(trust_env=False, timeout=25) as client:
        response = client.get(path)
    result = {"stage": "live_http_subscription", "status": response.status_code,
              "seconds": round(time.monotonic() - started, 2)}
    if response.status_code == 200:
        content = base64.b64decode(response.text.strip(), validate=True).decode()
        links = [line for line in content.splitlines() if line.startswith("vless://")]
        result["profiles"] = len(links)
        result["endpoints"] = [f"{urlsplit(link).hostname}:{urlsplit(link).port}" for link in links]
    print(json.dumps(result), flush=True)
    return 0 if response.status_code == 200 else 1


def probe(name, action, describe=None):
    started = time.monotonic()
    try:
        value = action()
        result = {"stage": name, "ok": True}
        if describe:
            result.update(describe(value))
        error = None
    except Exception as exception:
        value = None
        error = exception
        result = {"stage": name, "ok": False, "error_type": type(exception).__name__}
        response = getattr(exception, "response", None)
        if response is not None:
            result["http_status"] = response.status_code
    result["seconds"] = round(time.monotonic() - started, 2)
    print(json.dumps(result, ensure_ascii=True), flush=True)
    return value, error


def main():
    from app.api.public import format_client
    from app.db.database import SessionLocal
    from app.services.order_service import OrderService
    from app.services.relay_service import load_relay_routes
    from app.services.server_service import ServerService
    from app.services.subscription_service import active_subscription, entitled_server_ids
    from app.services.vless_service import attach_client_links, load_json
    from app.services.xui_service import XUIService

    order_id = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    with SessionLocal() as db:
        orders = OrderService(db)
        anchor = orders.get(order_id)
        if anchor is None:
            print(json.dumps({"order_id": order_id, "error": "order_not_found"}))
            return 1
        account_orders = orders.get_all_by_account_token(anchor.account_token)
        server_ids = entitled_server_ids(account_orders)
        print(json.dumps({"order_id": order_id, "status": anchor.status, "entitled_servers": server_ids}), flush=True)
        probe("relay_config", load_relay_routes, lambda routes: {
            "configured": routes is not None,
            "routes": len((routes or {}).get("routes", [])),
        })
        for server_id in server_ids:
            server = ServerService(db).get(server_id)
            print(json.dumps({"server_id": server_id, "exists": server is not None,
                              "enabled": bool(server and server.enabled)}), flush=True)
            if server is None or not server.enabled:
                continue
            xui, error = probe("xui_login", lambda: XUIService.connect(server))
            if error:
                continue
            try:
                data, page_error = probe("clients_page", xui.get_all, lambda result: {
                    "rows": len(result.get("items") or []), "total": result.get("total"),
                    "exact_matches": sum((item.get("email") or "").strip() == anchor.client_email.strip()
                                         for item in result.get("items") or []),
                    "case_insensitive_matches": sum((item.get("email") or "").strip().lower() == anchor.client_email.strip().lower()
                                                    for item in result.get("items") or []),
                })
                inbounds, inbound_error = probe("inbounds", xui.get_inbounds, lambda result: {"count": len(result)})
                if inbound_error:
                    continue
                matches = []
                for inbound in inbounds:
                    if inbound.get("protocol") != "vless":
                        continue
                    clients = load_json(inbound.get("settings")).get("clients", [])
                    found = [client for client in clients
                             if (client.get("email") or "").strip().lower() == anchor.client_email.strip().lower()]
                    for client in found:
                        matches.append({
                            "inbound_id": inbound.get("id"),
                            "inbound_enabled": inbound.get("enable", True),
                            "client_enabled": client.get("enable", True),
                            "expiry": client.get("expiryTime", 0),
                            "stats_present": any((item.get("email") or "").strip().lower() == anchor.client_email.strip().lower()
                                                 for item in inbound.get("clientStats") or []),
                        })
                print(json.dumps({"stage": "client_in_inbounds", "matches": matches}), flush=True)
                if page_error:
                    continue
                raw_clients = [item for item in data.get("items") or []
                               if (item.get("email") or "").strip() == anchor.client_email.strip()]
                if not raw_clients:
                    print(json.dumps({"stage": "client_lookup", "error": "not_in_first_page",
                                      "more_pages": int(data.get("total") or 0) > 200}), flush=True)
                    continue
                formatted, format_error = probe("format_client", lambda: [format_client(item) for item in raw_clients])
                if format_error:
                    continue
                linked, link_error = probe("client_links", lambda: attach_client_links(server, formatted, inbounds))
                if not link_error:
                    for item in linked:
                        print(json.dumps({
                            "stage": "subscription_profile", "enabled": item.get("enabled"),
                            "expiry": item.get("expiry"), "active": active_subscription(item),
                            "links": len(item.get("vless_urls") or []),
                        }), flush=True)
            finally:
                xui.client.close()
    return 0


if __name__ == "__main__":
    print(json.dumps({"diagnostic": "vpn-subscription", "utc": datetime.now(timezone.utc).isoformat()}), flush=True)
    try:
        if "--http-only" in sys.argv:
            sys.exit(check_http_subscription(int(sys.argv[1])))
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"stage": "diagnostic", "ok": False, "error_type": type(error).__name__}), flush=True)
        sys.exit(1)
