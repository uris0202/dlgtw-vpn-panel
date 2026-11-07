#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
backup="$HOME/vpnpanel-backups/xui-tls-warning-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose config --quiet
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
printf 'Database backup: %s\n' "$backup/database.dump"

# Preserve whether the optional monitor was running; never start it implicitly.
monitor_running=false
monitor_configured=false
docker compose --profile monitor config --services > "$backup/services.txt"
if grep -qx vpn-monitor "$backup/services.txt"; then
    monitor_configured=true
    docker compose --profile monitor ps --status running --services > "$backup/running-services.txt"
    if grep -qx vpn-monitor "$backup/running-services.txt"; then
        monitor_running=true
    fi
fi

docker compose build backend
if [ "$monitor_configured" = true ]; then
    docker compose --profile monitor build vpn-monitor
fi
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v

# API/network/authentication failures stop deployment; certificate warnings do not.
docker compose run --rm --no-deps -T backend python -m app.scripts.verify_xui_connections

docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend
docker compose restart caddy
sh scripts/wait-panel-health.sh
docker compose exec -T backend python -m app.scripts.verify_xui_connections
if [ "$monitor_running" = true ]; then
    docker compose --profile monitor up -d --no-deps --force-recreate --wait --wait-timeout 300 vpn-monitor
fi
docker compose exec -T backend python -m app.scripts.audit_vpn_readiness --all > "$backup/diagnostics.jsonl"
cat "$backup/diagnostics.jsonl"
printf '\nCertificate warning-only mode enabled. Report: %s/diagnostics.jsonl\n' "$backup"
printf 'Frontend, HAProxy, Xray and VPN clients were not changed.\n'
