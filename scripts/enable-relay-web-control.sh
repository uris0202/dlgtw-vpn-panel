#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(id -u)" -ne 0 ]; then echo "Run as root on the Petersburg website server." >&2; exit 1; fi
test -s relay/routes.json
test -s relay/haproxy.cfg
umask 077
backup="$HOME/vpnpanel-backups/web-relay-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.sql"
test -s "$backup/database.sql"
cp relay/routes.json relay/haproxy.cfg "$backup/"
printf 'Backup: %s\n' "$backup"
activated=0
on_exit() {
    result=$?
    trap - EXIT
    if [ "$result" -ne 0 ] && [ "$activated" -eq 1 ]; then
        cp "$backup/haproxy.cfg" relay/haproxy.cfg
        docker compose --profile relay up -d --no-deps --force-recreate vpn-relay || true
        echo "Previous HAProxy configuration restored. Backup: $backup" >&2
    fi
    exit "$result"
}
trap on_exit EXIT
docker compose config --quiet
docker compose build backend frontend
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
docker compose run --rm --no-deps -T frontend npm test
sh scripts/prepare-relay-permissions.sh
docker compose run --rm --no-deps -T --user 0:0 -v "$PWD/relay:/relay" backend \
    python -m app.scripts.prepare_relay --render-current --output-dir /relay
docker run --rm --network none --cap-drop ALL --read-only \
    -v "$PWD/relay/haproxy.control.next.cfg:/tmp/haproxy.cfg:ro" \
    haproxy:3.0-alpine haproxy -c -f /tmp/haproxy.cfg
activated=1
cp relay/haproxy.control.next.cfg relay/haproxy.cfg
chmod 644 relay/haproxy.cfg
docker compose --profile relay up -d --no-deps --force-recreate vpn-relay
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend frontend
docker compose restart caddy
sh scripts/wait-panel-health.sh
docker compose exec -T backend python -c 'from app.services.relay_admin_service import runtime_destinations; d=runtime_destinations(); assert d, "HAProxy returned no routes"; print("Relay web control ready:", len(d), "routes")'
docker compose --profile relay ps
