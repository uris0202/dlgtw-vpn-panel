#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RESUME=0
if [ "${1:-}" = "--resume" ]; then
    RESUME=1
    shift
fi
PUBLIC_HOST=${1:-139.100.235.247}
if [ "$(id -u)" -ne 0 ]; then
    echo "Run this script as root on the website server." >&2
    exit 1
fi
command -v ss >/dev/null
command -v curl >/dev/null
docker compose config --quiet
BACKUP_DIR="$HOME/vpnpanel-backups/cascade-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR" relay
chmod 700 "$BACKUP_DIR"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BACKUP_DIR/database.sql"
test -s "$BACKUP_DIR/database.sql"
if [ -f relay/routes.json ]; then
    cp relay/routes.json "$BACKUP_DIR/routes.json"
    cp relay/haproxy.cfg "$BACKUP_DIR/haproxy.cfg"
fi
echo "Backup: $BACKUP_DIR"
RELAY_TOUCHED=0
rollback_on_error() {
    result=$?
    trap - EXIT
    if [ "$result" -ne 0 ] && [ "$RELAY_TOUCHED" -eq 1 ]; then
        echo "Setup failed; restoring the previous relay configuration." >&2
        if [ -f "$BACKUP_DIR/routes.json" ]; then
            cp "$BACKUP_DIR/haproxy.cfg" relay/haproxy.cfg
            cp "$BACKUP_DIR/routes.json" relay/routes.json
            docker compose --profile relay up -d --no-deps --force-recreate vpn-relay || true
        else
            docker compose --profile relay stop vpn-relay || true
            if [ -f relay/routes.json ]; then
                mv relay/routes.json relay/routes.failed.json
            fi
        fi
    fi
    exit "$result"
}
trap rollback_on_error EXIT

if [ "$RESUME" -eq 1 ]; then
    if [ ! -s relay/routes.next.json ]; then
        if [ ! -s relay/routes.failed.json ]; then
            echo "No saved setup found. Run the installer without --resume." >&2
            exit 1
        fi
        cp relay/routes.failed.json relay/routes.next.json
    fi
    if [ ! -s relay/haproxy.next.cfg ] || [ ! -s relay/ports.next.txt ]; then
        echo "Prepared relay files are missing. Run the installer without --resume." >&2
        exit 1
    fi
    echo "Resuming the prepared relay setup without rebuilding images."
else
    docker compose build backend frontend
    docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
    docker compose run --rm --no-deps -T frontend npm test
    docker compose run --rm --no-deps -T --user "$(id -u):$(id -g)" \
        -v "$PWD/relay:/relay" backend python -m app.scripts.prepare_relay \
        --public-host "$PUBLIC_HOST" --output-dir /relay
fi
sh scripts/prepare-relay-permissions.sh
chmod 644 relay/haproxy.next.cfg relay/routes.next.json relay/ports.next.txt relay/ports.previous.txt

while IFS= read -r port; do
    listeners=$(ss -H -ltnp "sport = :$port")
    if [ -n "$listeners" ]; then
        if ! printf '%s\n' "$listeners" | grep -q 'haproxy' \
            || ! grep -qx "$port" relay/ports.previous.txt \
            || [ -z "$(docker compose --profile relay ps --status running -q vpn-relay)" ]; then
            echo "Port $port is already occupied. Relay configuration was not activated." >&2
            exit 1
        fi
    fi
done < relay/ports.next.txt

if [ "$RESUME" -eq 0 ]; then
    docker compose --profile relay pull vpn-relay
fi
docker run --rm --network none --cap-drop ALL --read-only \
    -v "$PWD/relay/haproxy.next.cfg:/tmp/haproxy.cfg:ro" \
    haproxy:3.0-alpine haproxy -c -f /tmp/haproxy.cfg

# Start forwarding before publishing the new client addresses.
RELAY_TOUCHED=1
cp relay/haproxy.next.cfg relay/haproxy.cfg
chmod 644 relay/haproxy.cfg
docker compose --profile relay up -d --no-deps --force-recreate vpn-relay
sleep 3
if [ -z "$(docker compose --profile relay ps --status running -q vpn-relay)" ]; then
    echo "Relay did not start. New subscription routes were not activated." >&2
    exit 1
fi
while IFS= read -r port; do
    if [ -z "$(ss -H -ltn "sport = :$port")" ]; then
        echo "Relay port $port is not listening. New routes were not activated." >&2
        exit 1
    fi
    if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
        ufw allow "$port/tcp" comment 'DLGTW VPN relay'
    fi
done < relay/ports.next.txt
mv relay/routes.next.json relay/routes.json
if [ "$RESUME" -eq 1 ]; then
    docker compose up -d --no-deps --wait --wait-timeout 180 backend frontend
    docker compose up -d --no-deps caddy
else
    docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend frontend
    docker compose restart caddy
fi
sh scripts/wait-panel-health.sh
echo "Relay installed. Allow these TCP ports in your hosting firewall:"
cat relay/ports.next.txt
echo "Clients must replace their old subscription with the unified URL from their account at https://dlgtw.ru/account"
docker compose --profile relay ps
