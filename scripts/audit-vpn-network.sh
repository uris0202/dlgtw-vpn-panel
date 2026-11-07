#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(id -u)" -ne 0 ]; then
    echo "Run on the website server as root to read process and network counters." >&2
    exit 1
fi
if [ ! -s relay/routes.json ]; then
    echo "Active relay/routes.json is required." >&2
    exit 1
fi

section() {
    printf '\n--- %s ---\n' "$1"
}

section "System resources"
date -u '+%Y-%m-%d %H:%M:%S UTC'
uname -sr
uptime
if command -v nproc >/dev/null; then nproc; fi
if command -v free >/dev/null; then free -h; fi
if command -v vmstat >/dev/null; then vmstat 1 3; fi

section "Container resource usage"
docker stats --no-stream \
    --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}' \
    vpnpanel-vpn-relay vpnpanel-backend vpnpanel-frontend vpnpanel-postgres || true
docker inspect --format 'relay_network={{.HostConfig.NetworkMode}} oom_killed={{.State.OOMKilled}} restart_count={{.RestartCount}} memory_limit={{.HostConfig.Memory}}' vpnpanel-vpn-relay

section "TCP settings (read only)"
for key in \
    net.ipv4.tcp_congestion_control \
    net.ipv4.tcp_available_congestion_control \
    net.core.default_qdisc \
    net.core.somaxconn \
    net.ipv4.tcp_max_syn_backlog \
    net.ipv4.ip_local_port_range \
    net.ipv4.tcp_mtu_probing \
    net.ipv4.tcp_sack \
    net.ipv4.tcp_window_scaling \
    net.ipv4.tcp_syncookies \
    net.ipv4.tcp_keepalive_time \
    net.ipv4.tcp_keepalive_intvl \
    net.ipv4.tcp_keepalive_probes \
    net.ipv4.tcp_rmem \
    net.ipv4.tcp_wmem \
    net.core.rmem_max \
    net.core.wmem_max \
    net.netfilter.nf_conntrack_count \
    net.netfilter.nf_conntrack_max; do
    sysctl "$key" 2>/dev/null || true
done

section "Interfaces and default route"
if command -v ip >/dev/null; then
    ip route show default
    interface=$(ip -o route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
    if [ -n "$interface" ]; then
        ip -s link show dev "$interface"
        if command -v tc >/dev/null; then tc -s qdisc show dev "$interface"; fi
    fi
fi

section "Socket counts and cumulative TCP counters"
ss -s
if command -v nstat >/dev/null; then
    nstat -asz TcpRetransSegs TcpExtTCPSynRetrans TcpExtListenOverflows TcpExtListenDrops \
        TcpExtTCPTimeouts TcpExtTCPMemoryPressures IpInDiscards IpOutDiscards || true
fi
if [ -r /proc/net/sockstat ]; then cat /proc/net/sockstat; fi

section "Relay process file limits"
relay_pid=$(docker inspect --format '{{.State.Pid}}' vpnpanel-vpn-relay)
case "$relay_pid" in
    ''|*[!0-9]*) echo "Relay process ID is not available." ;;
    *)
        if [ "$relay_pid" -gt 0 ] && [ -r "/proc/$relay_pid/limits" ]; then
            printf 'Relay PID: %s\n' "$relay_pid"
            grep 'Max open files' "/proc/$relay_pid/limits"
            printf 'Open file descriptors: '
            find "/proc/$relay_pid/fd" -mindepth 1 -maxdepth 1 -type l 2>/dev/null | wc -l
        fi
        ;;
esac

section "Configured relay capacity and listeners"
grep -E '^[[:space:]]*(maxconn|timeout|option|mode|bind|server)[[:space:]]' relay/haproxy.cfg
if [ -r relay/ports.next.txt ]; then
    while IFS= read -r port; do
        case "$port" in ''|*[!0-9]*) continue ;; esac
        ss -ltn "sport = :$port"
    done < relay/ports.next.txt
fi

section "Website server to VPN endpoints (same host network as HAProxy)"
backend_image=$(docker inspect --format '{{.Image}}' vpnpanel-backend)
docker run --rm -i --network host --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --entrypoint python \
    -v "$PWD/relay:/relay:ro" "$backend_image" - /relay/routes.json \
    < scripts/audit-vpn-upstreams.py

printf '\nAudit completed. No sysctl, firewall, routing or application settings were changed.\n'
