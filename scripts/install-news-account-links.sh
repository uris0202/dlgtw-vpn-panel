#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077
backup="$HOME/vpnpanel-backups/news-account-links-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
trap 'result=$?; if [ "$result" -ne 0 ]; then printf "Update stopped. Database backup: %s/database.dump\nDo not downgrade the database automatically.\n" "$backup" >&2; fi' EXIT

docker compose config --quiet
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup/database.dump"
test -s "$backup/database.dump"
docker compose exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.list"
printf 'Database backup: %s/database.dump\n' "$backup"

docker compose build backend frontend
docker compose run --rm --no-deps -T backend python -m unittest discover -s tests -v
docker compose run --rm --no-deps -T frontend npm test

# The additive migration runs before containers start using the new settings column.
docker compose run --rm --no-deps -T backend alembic upgrade head
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 backend frontend
docker compose restart caddy
sh scripts/wait-panel-health.sh

docker compose exec -T backend python -c 'import httpx; r=httpx.get("http://127.0.0.1:8000/public/news", timeout=10, trust_env=False); r.raise_for_status(); data=r.json(); assert "items" in data; print("Public news API ready:", data["total"], "publications")'
docker compose ps
printf '\nUpdate completed. Admin: /announcements; public: /news\n'
