from ipaddress import ip_address

from fastapi import Request


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")

    if forwarded_for:
        candidate = forwarded_for.rsplit(",", 1)[-1].strip()

        if is_ip_address(candidate):
            return candidate

    real_ip = request.headers.get("x-real-ip", "").strip()

    if is_ip_address(real_ip):
        return real_ip

    if request.client and is_ip_address(request.client.host):
        return request.client.host

    return "unknown"


def is_ip_address(value: str) -> bool:
    if not value:
        return False

    try:
        ip_address(value)
    except ValueError:
        return False

    return True
