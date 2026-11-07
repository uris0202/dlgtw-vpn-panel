#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$#" -ne 2 ]; then
    echo "Usage: sh scripts/install-relay-domain.sh vpn.dlgtw.ru EXPECTED_ENTRY_IP" >&2
    exit 2
fi
public_host=$1
expected_ip=$2
umask 077
test -s relay/routes.json
test -s relay/haproxy.cfg
backup="$HOME/vpnpanel-backups/relay-domain-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp relay/routes.json relay/haproxy.cfg "$backup/"
docker compose config --quiet
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
printf 'Backup: %s\n' "$backup"

docker compose build backend
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v

# Check DNS with the new image while the running backend and relay remain untouched.
docker compose run --rm --no-deps -T backend python -m app.scripts.set_relay_public_host \
    --public-host "$public_host" --expected-ip "$expected_ip" --check

docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend
docker compose restart caddy
sh scripts/wait-panel-health.sh

# Publish the DNS name only after a domain-capable backend is running.
docker compose exec -T backend python -m app.scripts.set_relay_public_host \
    --public-host "$public_host" --expected-ip "$expected_ip"
printf '\nVPN entry address updated. HAProxy and VPN servers were not restarted.\n'
printf 'Customers must update their existing subscription once to import the DNS hostname.\n'
