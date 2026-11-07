#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
backend_gid=$(docker compose run --rm --no-deps -T backend id -g)
case "$backend_gid" in ''|*[!0-9]*) echo "Unable to determine backend group ID." >&2; exit 1 ;; esac
mkdir -p relay/control relay/history
chown "0:$backend_gid" relay relay/control relay/history
chmod 2770 relay relay/control relay/history
for file in relay/routes.json relay/haproxy.cfg; do
    if [ -f "$file" ]; then chmod 644 "$file"; fi
done
