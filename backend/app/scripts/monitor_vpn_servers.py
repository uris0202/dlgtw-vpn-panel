"""Hourly server-side monitoring, independent of the web API process."""

import argparse
from contextlib import contextmanager
import json
import logging
import os
from pathlib import Path
import signal
import sys
from threading import Event
import time
from types import SimpleNamespace

from app.db.database import SessionLocal
from app.models.settings import PanelSettings
from app.services.server_service import ServerService
from app.services.server_diagnostics_service import diagnose_server
from app.services.telegram_service import TelegramNotificationService
from app.services.vpn_canary_service import canary_observations
from app.services.vpn_monitor_service import IncidentStore, atomic_json, confirm_observations, observations, relay_observations


logger = logging.getLogger(__name__)
RETRY_SECONDS = 300


def options():
    interval = int(os.getenv("VPN_MONITOR_INTERVAL_SECONDS", "3600"))
    confirmation = int(os.getenv("VPN_MONITOR_CONFIRM_SECONDS", "60"))
    if not 60 <= interval <= 86400 or not 1 <= confirmation <= 300:
        raise ValueError("Invalid monitor interval")
    directory = Path(os.getenv("VPN_MONITOR_STATE_DIR", "/var/lib/vpnpanel-monitor"))
    return interval, confirmation, directory


def load_snapshot():
    with SessionLocal() as db:
        settings = db.get(PanelSettings, 1)
        credentials = SimpleNamespace(
            telegram_notifications_enabled=bool(settings and settings.telegram_notifications_enabled),
            telegram_bot_token=settings.telegram_bot_token if settings else "",
            telegram_chat_id=settings.telegram_chat_id if settings else "",
        )
        servers = [SimpleNamespace(**{key: getattr(server, key) for key in
                   ("id", "name", "host", "username", "password", "base_path", "enabled")})
                   for server in ServerService(db).get_all() if server.enabled]
    return servers, credentials


def collect(servers, stop, heartbeat):
    result = {}
    for server in servers:
        if stop.is_set():
            break
        heartbeat()
        try:
            report = diagnose_server(server)
            result.update(observations(report))
            result.update(relay_observations(report))
        except Exception as error:
            logger.error("Monitor check failed for server_id=%s (%s)", server.id, type(error).__name__)
            result[f"{server.id}:probe"] = {
                "server_id": server.id, "name": " ".join(server.name.split())[:100],
                "label": "Диагностика не выполнена; состояние VPN неизвестно", "state": "down",
            }
        if not stop.is_set():
            result.update(canary_observations(server, stop, heartbeat))
        heartbeat()
    return result


def cycle(store, stop, confirmation, heartbeat, interval=3600):
    servers, credentials = load_snapshot()
    first = collect(servers, stop, heartbeat)
    failed_ids = {item["server_id"] for item in first.values() if item["state"] == "down"}
    if failed_ids:
        logger.info("Confirming failed checks for %s servers in %ss", len(failed_ids), confirmation)
        if stop.wait(confirmation):
            return None
        # Reload to respect an admin changing/disabling a server during confirmation.
        servers, credentials = load_snapshot()
        second = collect([server for server in servers if server.id in failed_ids], stop, heartbeat)
        first = confirm_observations(first, second)
    if stop.is_set():
        return None
    store.apply(first, {server.id for server in servers})
    store.save()
    try:
        store.publish(first, servers, interval)
    except (OSError, ValueError, TypeError) as error:
        # Public reporting must not interrupt incident delivery to the administrator.
        logger.warning("Public status snapshot failed (%s)", type(error).__name__)
    counts = {state: sum(item["state"] == state for item in first.values()) for state in ("up", "down", "unknown")}
    logger.info("Monitor cycle completed: servers=%s checks=%s", len(servers), counts)
    return credentials


@contextmanager
def singleton(directory):
    import fcntl
    with (directory / "worker.lock").open("a") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def healthy(directory, interval, now=None):
    try:
        status = json.loads((directory / "health.json").read_text(encoding="utf-8"))
        now = time.time() if now is None else now
        return (0 <= now - status["heartbeat"] < 300
                and status.get("telegram_configured") is True
                and status.get("last_cycle") is not None
                and 0 <= now - status["last_cycle"] < interval + 900
                and status.get("cycle_error") is not True
                and status.get("delivery_error") is not True)
    except (OSError, ValueError, KeyError, TypeError):
        return False


def run(directory, interval, confirmation, once=False, stop=None):
    stop = stop or Event()
    store = IncidentStore(directory / "incidents.json")
    status = {"last_cycle": None, "telegram_configured": False, "cycle_error": False}

    def heartbeat():
        atomic_json(directory / "health.json", {**status, "heartbeat": time.time()})

    next_cycle = next_delivery = 0.0
    while not stop.is_set():
        started = time.monotonic()
        heartbeat()
        if started >= next_cycle:
            try:
                credentials = cycle(store, stop, confirmation, heartbeat, interval=interval)
                if credentials is None:
                    break
                status.update(last_cycle=time.time(), cycle_error=False,
                              telegram_configured=TelegramNotificationService.is_enabled(credentials))
                next_cycle = max(started + interval, time.monotonic() + 1)
                next_delivery = 0.0
            except Exception as error:
                logger.error("Monitor cycle failed (%s); retry in %ss", type(error).__name__, RETRY_SECONDS)
                status["cycle_error"] = True
                next_cycle = time.monotonic() + RETRY_SECONDS
        if time.monotonic() >= next_delivery and not stop.is_set():
            try:
                _, credentials = load_snapshot()
                status["telegram_configured"] = TelegramNotificationService.is_enabled(credentials)
                if not status["telegram_configured"]:
                    logger.warning("Monitor Telegram notifications disabled or not configured")
                else:
                    store.deliver(credentials)
                    status["delivery_error"] = any(not item["active"] or not item["notified"] for item in store.data["incidents"].values())
            except Exception as error:
                status["delivery_error"] = True
                logger.error("Monitor notification pass failed (%s)", type(error).__name__)
            next_delivery = time.monotonic() + RETRY_SECONDS
        heartbeat()
        if once:
            return 0 if healthy(directory, interval) else 1
        stop.wait(min(30, max(0.1, next_cycle - time.monotonic()), max(0.1, next_delivery - time.monotonic())))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--health", action="store_true")
    action.add_argument("--check-config", action="store_true")
    action.add_argument("--once", action="store_true")
    args = parser.parse_args()
    interval, confirmation, directory = options()
    if args.health:
        return 0 if healthy(directory, interval) else 1
    if args.check_config:
        servers, credentials = load_snapshot()
        configured = TelegramNotificationService.is_enabled(credentials)
        print(json.dumps({"enabled_servers": len(servers), "telegram_configured": configured, "interval_seconds": interval}))
        return 0 if configured and servers else 1
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    stop = Event()
    for event in (signal.SIGINT, signal.SIGTERM):
        signal.signal(event, lambda *_: stop.set())
    with singleton(directory):
        logger.info("VPN monitor started: interval=%ss confirmation=%ss", interval, confirmation)
        return run(directory, interval, confirmation, args.once, stop)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # HTTPX logs complete request URLs, which contain Telegram bot tokens.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    try:
        sys.exit(main())
    except Exception as error:
        logger.error("VPN monitor stopped (%s); check state storage and configuration", type(error).__name__)
        sys.exit(1)
