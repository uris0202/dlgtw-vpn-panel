#!/bin/sh
set -eu

attempts=${1:-30}
delay=${2:-2}
case "$attempts:$delay" in
    *[!0-9:]*|:*|*:) echo "Expected numeric attempt count and delay." >&2; exit 2 ;;
esac
if [ "$attempts" -lt 1 ]; then
    echo "At least one health check attempt is required." >&2
    exit 2
fi

attempt=1
while [ "$attempt" -le "$attempts" ]; do
    # Keep the TLS hostname while avoiding public DNS and hairpin routing.
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 6 \
        --noproxy '*' --resolve dlgtw.ru:443:127.0.0.1 \
        --output /dev/null https://dlgtw.ru/api/health; then
        echo "Panel HTTPS health check passed."
        exit 0
    fi
    echo "Waiting for Caddy and API readiness ($attempt/$attempts)..." >&2
    if [ "$attempt" -lt "$attempts" ]; then
        sleep "$delay"
    fi
    attempt=$((attempt + 1))
done

echo "Panel HTTPS did not become ready. Check docker compose logs --tail=80 caddy backend." >&2
exit 1
