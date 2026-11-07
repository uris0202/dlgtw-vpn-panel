const states = new Set(["ok", "partial", "issue", "unknown"]);

export function sessionLabel(value) {
    return value === "up" ? "HTTPS через VPN прошёл" : value === "down" ? "Запрос не прошёл" : value === "not_configured" ? "Не настроена" : "Нет данных";
}

export function statusIsFresh(data, now = Date.now()) {
    const checked = data?.checked_at;
    const interval = data?.interval_seconds;
    return data?.fresh === true && typeof checked === "number" && Number.isFinite(checked)
        && typeof interval === "number" && Number.isFinite(interval) && interval >= 60 && interval <= 86400
        && now / 1000 >= checked && now / 1000 - checked < interval + 900;
}

export function visibleStatus(data, failed, now = Date.now()) {
    if (failed || !statusIsFresh(data, now)) return "unknown";
    return states.has(data.state) ? data.state : "unknown";
}

export function statusDate(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "Нет данных";
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? "Нет данных" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
