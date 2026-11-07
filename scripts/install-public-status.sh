#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
backup="$HOME/vpnpanel-backups/public-status-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose config --quiet
test -n "$(docker compose ps -q vpn-monitor)" || { echo 'The existing VPN monitor must be running before this update.' >&2; exit 1; }
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
docker compose exec -T vpn-monitor python -c 'import sys; from pathlib import Path; sys.stdout.buffer.write(Path("/var/lib/vpnpanel-monitor/incidents.json").read_bytes())' > "$backup/monitor-incidents.json"
test -s "$backup/monitor-incidents.json"
printf 'Database and monitor state backup: %s\n' "$backup"
docker compose --profile monitor build backend frontend vpn-monitor
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
docker compose run --rm --no-deps -T frontend npm test
docker compose run --rm --no-deps -T vpn-monitor python -m app.scripts.monitor_vpn_servers --check-config
docker compose --profile monitor up -d --no-deps --force-recreate --wait --wait-timeout 300 backend frontend vpn-monitor
docker compose restart caddy
sh scripts/wait-panel-health.sh
docker compose exec -T backend python -c 'import json, sys, urllib.request; opener=urllib.request.build_opener(urllib.request.ProxyHandler({})); data=json.load(opener.open("http://127.0.0.1:8000/public/status", timeout=10)); fresh=data.get("fresh") is True; print(json.dumps({"public_status_fresh":fresh,"directions":len(data.get("servers",[]))})); sys.exit(0 if fresh else 1)'
printf '\nPublic infrastructure status: https://dlgtw.ru/status\n'
printf 'Monitor incident state was preserved. HAProxy and foreign Xray were not restarted.\n'
