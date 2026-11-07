#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(id -u)" -ne 0 ]; then
    echo "Run on the Petersburg website server as root." >&2
    exit 1
fi
if ! command -v tcpdump >/dev/null; then
    echo "tcpdump is required. On Ubuntu/Debian: apt-get update && apt-get install -y tcpdump" >&2
    exit 1
fi

VPN_HOST=${1:-195.133.63.113}
VPN_PORT=${2:-30001}
case "$VPN_HOST" in ''|*[!0-9.]*) echo "Expected an IPv4 VPN address." >&2; exit 2 ;; esac
case "$VPN_PORT" in ''|*[!0-9]*) echo "Expected a numeric VPN port." >&2; exit 2 ;; esac

backend_image=$(docker inspect --format '{{.Image}}' vpnpanel-backend)
umask 077
capture_log=$(mktemp "${TMPDIR:-/tmp}/dlgtw-vpn-syn.XXXXXX")
capture_pid=""
stop_capture() {
    if [ -n "$capture_pid" ]; then
        kill -INT "$capture_pid" 2>/dev/null || true
        wait "$capture_pid" 2>/dev/null || true
        capture_pid=""
    fi
}
trap stop_capture EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

tcpdump -nn -tttt -ni any -s 96 -l \
    "host $VPN_HOST and tcp port $VPN_PORT and (tcp[13] & 6 != 0)" \
    > "$capture_log" 2>&1 &
capture_pid=$!
sleep 1
if ! kill -0 "$capture_pid" 2>/dev/null; then
    cat "$capture_log"
    exit 1
fi

printf 'TCP probes from Petersburg to %s:%s; no VPN payload is sent.\n' "$VPN_HOST" "$VPN_PORT"
probe_status=0
docker run --rm -i --network host --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --entrypoint python "$backend_image" \
    - "$VPN_HOST" "$VPN_PORT" --attempts 8 < scripts/probe-vpn-tcp.py || probe_status=$?
stop_capture
printf '\n--- Petersburg SYN/RST trace ---\n'
cat "$capture_log"
printf '\nTrace saved at: %s\nNo firewall, routing or VPN settings were changed.\n' "$capture_log"
exit "$probe_status"
