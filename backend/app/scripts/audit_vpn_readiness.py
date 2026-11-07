"""Print a redacted, read-only audit. Never export customer profiles or keys."""

import argparse
import json
import sys

from app.db.database import SessionLocal
from app.services.server_diagnostics_service import diagnose_server
from app.services.server_service import ServerService


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--all", action="store_true")
    selection.add_argument("--server-id", type=int)
    args = parser.parse_args()
    with SessionLocal() as db:
        service = ServerService(db)
        servers = service.get_all() if args.all else [service.get(args.server_id)]
        if any(server is None for server in servers):
            raise ValueError("Server not found")
        for server in servers:
            print(json.dumps(diagnose_server(server), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"audit_error": type(error).__name__, "message": "Аудит не завершён. Секретные данные ошибки не выводятся."}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
