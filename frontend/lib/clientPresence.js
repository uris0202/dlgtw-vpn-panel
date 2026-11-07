export function clientPresence(client) {
    return client.online === true ? "online" : client.online === false ? "offline" : "unknown";
}

export function matchesConnection(client, filter) {
    return filter === "all" || clientPresence(client) === filter;
}

export function formatLastOnline(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}
