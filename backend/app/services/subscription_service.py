import base64
import hashlib
import hmac
import time


def subscription_signature(order, secret):
    message = f"vpn-subscription:v1:{order.id}:{order.account_token}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def subscription_url(order, base_url, secret):
    signature = subscription_signature(order, secret)
    return f"{base_url.rstrip('/')}/api/public/subscriptions/{order.id}/{signature}"


def entitled_server_ids(orders):
    result = []
    for order in orders:
        if order.status not in {"paid", "access"}:
            continue
        selected = order.server_ids or ([order.server_id] if order.server_id else [])
        if order.status == "paid":
            activated = order.activated_server_ids or []
            if activated or not order.activated_at or order.activation_error:
                selected = [server_id for server_id in selected if server_id in activated]
        for server_id in selected:
            server_id = int(server_id)
            if server_id not in result:
                result.append(server_id)
    return result


def active_subscription(item, now_ms=None):
    if item.get("error") or not item.get("enabled"):
        return False
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    expiry = int(item.get("expiry") or 0)
    # Negative expiry represents a first-connection duration in Xray.
    if expiry > 0 and expiry <= now_ms:
        return False
    limit = int(item.get("total_gb") or 0)
    return limit <= 0 or int(item.get("traffic") or 0) < limit


def encode_subscription(items):
    links = []
    for item in items:
        if not active_subscription(item):
            continue
        for link in item.get("vless_urls", [item.get("vless_url")]):
            if link and link not in links:
                links.append(link)
    return base64.b64encode("\n".join(links).encode()).decode()
