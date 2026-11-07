"""Verify API reachability; certificate warnings never fail the preflight."""

import json
import logging

from app.db.database import SessionLocal
from app.services.server_service import ServerService
from app.services.xui_service import XUIService, is_certificate_error
from app.services.xui_tls_service import probe_certificate


def verify(server):
    result = {"server_id": server.id, "server_name": server.name}
    if not server.enabled:
        return {**result, "status": "disabled"}
    try:
        result["certificate"] = probe_certificate(server.host)
    except Exception:
        result["certificate"] = {"state": "not_checked", "policy": "warning_only", "verification_enforced": False}
    xui = None
    try:
        xui = XUIService.connect(server, request_timeout=5)
        inbounds = xui.get_inbounds()
        if not isinstance(inbounds, list):
            raise ValueError("Unexpected API data")
        return {**result, "status": "reachable", "inbounds": len(inbounds)}
    except Exception as error:
        return {**result, "status": "failed", "reason": "certificate_verification_failed" if is_certificate_error(error) else "api_or_connection_error", "error_type": type(error).__name__}
    finally:
        if xui is not None:
            xui.client.close()


def main():
    failed = False
    with SessionLocal() as db:
        for server in ServerService(db).get_all():
            result = verify(server)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            failed = failed or result["status"] not in {"reachable", "disabled"}
    return 1 if failed else 0


if __name__ == "__main__":
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"status": "preflight_failed", "error_type": type(error).__name__}))
        raise SystemExit(1)
