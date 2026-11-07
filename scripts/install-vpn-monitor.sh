#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
backup="$HOME/vpnpanel-backups/vpn-monitor-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose config --quiet
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
printf 'Database backup: %s\n' "$backup/database.dump"

docker compose build vpn-monitor
docker compose run --rm --no-deps -T vpn-monitor python -m unittest discover -s tests -v
if ! docker compose run --rm --no-deps -T vpn-monitor python -m app.scripts.monitor_vpn_servers --check-config; then
    echo 'Monitor not started. Enable Telegram notifications and set bot token + Chat ID in panel Settings.' >&2
    exit 1
fi
docker compose up -d --no-deps --wait --wait-timeout 300 vpn-monitor
docker compose ps vpn-monitor
docker compose logs --tail=30 vpn-monitor
printf '\nMonitor started. First check runs now, then every hour by default.\n'
printf 'Existing backend/frontend/Caddy/HAProxy and VPN servers were not restarted.\n'
