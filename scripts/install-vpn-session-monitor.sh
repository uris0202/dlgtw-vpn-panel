#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
backup="$HOME/vpnpanel-backups/vpn-session-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose config --quiet
test -n "$(docker compose ps -q vpn-monitor)" || { echo 'Existing VPN monitor must be running.' >&2; exit 1; }
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
docker compose exec -T vpn-monitor python -c 'import json; from pathlib import Path; root=Path("/var/lib/vpnpanel-monitor"); print(json.dumps({name:json.loads((root/name).read_text()) for name in ("incidents.json","canary.json") if (root/name).exists()}))' > "$backup/monitor-state.json"
printf 'Database and monitor backup: %s\n' "$backup"
docker compose --profile monitor build backend frontend vpn-monitor
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
docker compose run --rm --no-deps -T frontend npm test
docker compose run --rm --no-deps -T vpn-monitor python -m unittest discover -s tests -p 'test_vpn_canary*.py' -v
docker compose run --rm --no-deps -T vpn-monitor python -m app.scripts.monitor_vpn_servers --check-config
docker compose --profile monitor up -d --no-deps --force-recreate --wait --wait-timeout 300 backend frontend vpn-monitor
docker compose restart caddy
sh scripts/wait-panel-health.sh
docker compose exec -T backend python -c 'import json, sys, urllib.request; opener=urllib.request.build_opener(urllib.request.ProxyHandler({})); data=json.load(opener.open("http://127.0.0.1:8000/public/status", timeout=10)); fresh=data.get("fresh") is True; print(json.dumps({"public_status_fresh":fresh,"directions":len(data.get("servers",[]))})); sys.exit(0 if fresh else 1)'
printf '\nVPN session monitor installed. No service profiles were created by this installer.\n'
printf 'Opt-in setup is documented in VPN_SESSION_MONITOR.md. HAProxy and foreign Xray were not restarted.\n'
