#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
stamp=$(date +%Y%m%d-%H%M%S)
backup="$HOME/vpnpanel-backups/subscription-connect-$stamp"
mkdir -p "$backup"
docker compose config --quiet
container=$(docker compose ps -q frontend)
test -n "$container" || { echo 'Existing frontend must be running.' >&2; exit 1; }
docker inspect --format '{{.Image}}' "$container" > "$backup/frontend-image-id"
docker inspect --format '{{.Config.Image}}' "$container" > "$backup/frontend-image-name"
test -s "$backup/frontend-image-id"
test -s "$backup/frontend-image-name"
docker image tag "$(cat "$backup/frontend-image-id")" "dlgtw-frontend-rollback:$stamp"
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
printf 'Backup and previous frontend image: %s\n' "$backup"

docker compose build frontend
docker compose run --rm --no-deps -T frontend npm test
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 frontend
sh scripts/wait-panel-health.sh
curl --fail --silent --show-error --retry 5 --retry-delay 2 \
    --connect-timeout 3 --max-time 10 --noproxy '*' \
    --resolve dlgtw.ru:443:127.0.0.1 --output /dev/null https://dlgtw.ru/account/dashboard
printf '\nUnified subscription import installed. Open the client account on Android.\n'
printf 'Only frontend was recreated. Backend, Caddy, VPN relay and monitor were not restarted.\n'
