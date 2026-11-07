#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
backup="$HOME/vpnpanel-backups/client-center-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose config --quiet
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
printf 'Database backup: %s\n' "$backup/database.dump"
docker compose build backend frontend
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
docker compose run --rm --no-deps -T frontend npm test
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend frontend
docker compose restart caddy
sh scripts/wait-panel-health.sh
printf '\nClient center installed. Open https://dlgtw.ru/clients/overview\n'
printf 'HAProxy, VPN monitor and foreign Xray servers were not restarted.\n'
