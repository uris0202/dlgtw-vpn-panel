from concurrent.futures import ThreadPoolExecutor
import math
import os
from threading import Lock
import time
from types import SimpleNamespace

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.deps import get_db

from app.models.user import User

from app.services.server_service import ServerService
from app.services.xui_service import XUIService


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)

MILLISECONDS_IN_DAY = 86400 * 1000
EXPIRING_SOON_DAYS = 7
DASHBOARD_CACHE_TTL = int(os.getenv("DASHBOARD_CACHE_TTL", "15"))

_dashboard_cache = {
    "expires_at": 0,
    "data": None,
}
_dashboard_cache_lock = Lock()


@router.get("")
def dashboard(
    refresh: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    if not refresh:
        cached = _get_cached_dashboard()

        if cached is not None:
            return cached

    servers = [
        _server_ref(server)
        for server in ServerService(db).get_all()
    ]

    now_ms = int(time.time() * 1000)
    expiring_limit_ms = now_ms + EXPIRING_SOON_DAYS * MILLISECONDS_IN_DAY

    with ThreadPoolExecutor(max_workers=_worker_count(servers)) as executor:
        result = list(executor.map(
            lambda server: _build_server_dashboard(
                server,
                now_ms,
                expiring_limit_ms,
            ),
            servers,
        ))

    _set_cached_dashboard(result)

    return result


def _build_server_dashboard(
    server,
    now_ms,
    expiring_limit_ms,
):

    xui = None

    try:
        xui = XUIService.connect(server)
        clients = xui.get_all()

        items = clients.get("items") or []
        summary = clients.get("summary", {})
        online_list = summary.get("online") or []
        online_clients = {
            str(item).lower()
            for item in online_list
        }

        formatted_clients = [
            _format_dashboard_client(
                item=item,
                server=server,
                now_ms=now_ms,
                expiring_limit_ms=expiring_limit_ms,
                online_clients=online_clients,
            )
            for item in items
        ]

        expiring_clients = [
            client for client in formatted_clients
            if client["status"] == "expiring"
        ]

        expired_clients = [
            client for client in formatted_clients
            if client["status"] == "expired"
        ]

        recent_clients = [
            client for client in formatted_clients
            if client["created"] > 0
        ]

        return {
            "id": server.id,
            "name": server.name,
            "country": server.country,
            "status": "online",
            "clients": clients.get("total", len(items)),
            "online": len(online_list),
            "enabled": sum(
                1 for client in formatted_clients
                if client["enabled"]
            ),
            "disabled": sum(
                1 for client in formatted_clients
                if not client["enabled"]
            ),
            "expired": len(expired_clients),
            "expiring_soon": len(expiring_clients),
            "unlimited": sum(
                1 for client in formatted_clients
                if client["expiry"] <= 0
            ),
            "traffic_used": sum(
                client["traffic"]
                for client in formatted_clients
            ),
            "traffic_limit": sum(
                client["traffic_limit"]
                for client in formatted_clients
            ),
            "expiring_clients": sorted(
                expiring_clients,
                key=lambda client: client["expiry"],
            )[:10],
            "expired_clients": sorted(
                expired_clients,
                key=lambda client: client["expiry"],
            )[:10],
            "recent_clients": sorted(
                recent_clients,
                key=lambda client: client["created"],
                reverse=True,
            )[:5],
        }

    except Exception as error:
        return _offline_server(server, str(error))
    finally:
        _close_xui(xui)


def _offline_server(server, error):

    return {
        "id": server.id,
        "name": server.name,
        "country": server.country,
        "status": "offline",
        "error": error,
        "clients": 0,
        "online": 0,
        "enabled": 0,
        "disabled": 0,
        "expired": 0,
        "expiring_soon": 0,
        "unlimited": 0,
        "traffic_used": 0,
        "traffic_limit": 0,
        "expiring_clients": [],
        "expired_clients": [],
        "recent_clients": [],
    }


def _get_cached_dashboard():

    if DASHBOARD_CACHE_TTL <= 0:
        return None

    with _dashboard_cache_lock:
        if _dashboard_cache["data"] is None:
            return None

        if _dashboard_cache["expires_at"] < time.time():
            return None

        return _dashboard_cache["data"]


def _set_cached_dashboard(data):

    if DASHBOARD_CACHE_TTL <= 0:
        return

    with _dashboard_cache_lock:
        _dashboard_cache["data"] = data
        _dashboard_cache["expires_at"] = time.time() + DASHBOARD_CACHE_TTL


def _server_ref(server):

    return SimpleNamespace(
        id=server.id,
        name=server.name,
        country=server.country,
        host=server.host,
        username=server.username,
        password=server.password,
        base_path=server.base_path,
    )


def _worker_count(items):

    return max(1, min(6, len(items) or 1))


def _close_xui(xui):

    if xui is None:
        return

    try:
        xui.client.close()
    except Exception:
        pass


def _format_dashboard_client(
    item,
    server,
    now_ms: int,
    expiring_limit_ms: int,
    online_clients,
):

    traffic = item.get("traffic") or {}

    up = _to_int(traffic.get("up", item.get("up", 0)))
    down = _to_int(traffic.get("down", item.get("down", 0)))
    traffic_limit = _to_int(item.get("totalGB", 0))
    expiry = _to_int(item.get("expiryTime", item.get("expiry", 0)))
    created = _to_int(item.get("createdAt", item.get("created", 0)))
    updated = _to_int(item.get("updatedAt", item.get("updated", 0)))

    email = item.get("email") or ""
    enabled = item.get("enable", item.get("enabled", False))
    days_left = _days_left(expiry, now_ms)

    status = "active"

    if not enabled:
        status = "disabled"
    elif expiry > 0 and expiry < now_ms:
        status = "expired"
    elif expiry > 0 and expiry <= expiring_limit_ms:
        status = "expiring"

    return {
        "server_id": server.id,
        "server": server.name,
        "country": server.country,
        "email": email,
        "group": item.get("group", ""),
        "comment": item.get("comment", ""),
        "enabled": bool(enabled),
        "online": str(email).lower() in online_clients,
        "status": status,
        "traffic": up + down,
        "traffic_limit": traffic_limit,
        "up": up,
        "down": down,
        "expiry": expiry,
        "days_left": days_left,
        "created": created,
        "updated": updated,
    }


def _to_int(value):

    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _days_left(expiry: int, now_ms: int):

    if expiry <= 0:
        return None

    diff = expiry - now_ms

    if diff >= 0:
        return math.ceil(diff / MILLISECONDS_IN_DAY)

    return -math.ceil(abs(diff) / MILLISECONDS_IN_DAY)
