const DAY_MS = 86400000;

export function matchesClientAudit(event, name) {
    if (event.entity_type !== "client") return false;
    const id = String(event.entity_id || "");
    const separator = id.indexOf(":");
    return separator > 0 && /^\d+$/.test(id.slice(0, separator)) && id.slice(separator + 1) === name;
}

export function orderServerIds(order) {
    const ids = (order.server_ids?.length ? order.server_ids : [order.server_id]).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (order.status === "access") return ids;
    if (order.status !== "paid") return [];
    const activated = (order.activated_server_ids || []).map(Number);
    return activated.length || !order.activated_at || order.activation_error ? ids.filter((id) => activated.includes(id)) : ids;
}

export function buildClientDirectory(servers, snapshots, accounts = [], orders = []) {
    const clients = new Map();
    function entry(name) {
        if (typeof name !== "string" || !name) return null;
        if (!clients.has(name)) clients.set(name, { name, profiles: [], accounts: [], orders: [], expectedServerIds: new Set(), paidServerIds: new Set(), manualServerIds: new Set() });
        return clients.get(name);
    }
    for (const server of servers) {
        const snapshot = snapshots[server.id];
        for (const profile of snapshot?.data?.clients || []) {
            const client = entry(profile.email);
            if (!client || client.profiles.some((item) => item.server_id === server.id)) continue;
            client.profiles.push({ ...profile, online: snapshot.state === "ok" ? profile.online : null, stale: snapshot.state !== "ok", server_id: server.id, server_name: server.name, country: server.country });
            client.expectedServerIds.add(Number(server.id));
        }
    }
    for (const account of accounts) {
        const client = entry(account.client_email);
        if (!client) continue;
        client.accounts.push(account);
        for (const id of account.server_ids || []) client.expectedServerIds.add(Number(id));
    }
    for (const order of orders) {
        const client = entry(order.client_email);
        // Unpaid purchases without a VPN profile or account are not VPN clients.
        if (!client) continue;
        client.orders.push(order);
        const eligible = orderServerIds(order);
        for (const id of eligible) {
            client.expectedServerIds.add(id);
            (order.status === "paid" ? client.paidServerIds : client.manualServerIds).add(id);
        }
    }
    return [...clients.values()].filter((client) => client.profiles.length || client.accounts.length || client.expectedServerIds.size).map((client) => {
        const known = client.profiles.filter((profile) => typeof profile.online === "boolean");
        const onlineCount = known.filter((profile) => profile.online).length;
        const serverCount = client.expectedServerIds.size;
        const expiryValues = client.profiles.map((profile) => Number(profile.expiry)).filter((value) => Number.isFinite(value) && value > 0);
        return { ...client, serverCount, onlineCount, presence: onlineCount ? "online" : known.length === serverCount && serverCount > 0 ? "offline" : "unknown",
            traffic: client.profiles.reduce((sum, profile) => sum + (Number(profile.traffic) || 0), 0),
            nearestExpiry: expiryValues.length ? Math.min(...expiryValues) : null,
            groups: [...new Set(client.profiles.map((profile) => profile.group).filter(Boolean))],
            orders: client.orders.sort((a, b) => b.id - a.id) };
    }).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function matchesDirectory(client, { query = "", connection = "all", group = "all" }) {
    const text = query.trim().toLowerCase();
    return (connection === "all" || client.presence === connection)
        && (group === "all" || (group === "none" ? !client.groups.length : client.groups.includes(group)))
        && (!text || [client.name, ...client.groups, ...client.profiles.flatMap((profile) => [profile.comment, profile.server_name, profile.country]),
            ...client.accounts.flatMap((account) => [account.customer_contact, account.account_login])].some((value) => String(value || "").toLowerCase().includes(text)));
}

export function formatClientExpiry(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Нет данных";
    if (Number(value) === 0) return "Без срока";
    if (Number(value) < 0) return "От первого подключения";
    return new Date(Number(value)).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function previewRenewal(expiry, days, nowMs) {
    const value = Number(expiry);
    if (!Number.isSafeInteger(value) || value <= 0 || !Number.isInteger(days) || days < 1 || days > 3650) return null;
    return Math.max(value, nowMs) + days * DAY_MS;
}

export async function renewClientProfiles(profiles, days, transport, nowMs = Date.now()) {
    if (!profiles.length || profiles.some((profile) => previewRenewal(profile.expiry, days, nowMs) === null)) throw new Error("Выберите серверы с известным конечным сроком и укажите от 1 до 3650 дней.");
    if (new Set(profiles.map((profile) => profile.server_id)).size !== profiles.length) throw new Error("Один сервер не должен повторяться в продлении.");
    // Recheck every selected expiry before sending the first mutation.
    const current = await Promise.all(profiles.map((profile) => transport.read(profile)));
    if (current.some((profile, index) => Number(profile.expiry) !== Number(profiles[index].expiry))) return { changed: true, current, results: [] };
    const results = [];
    for (let index = 0; index < profiles.length; index++) {
        const profile = profiles[index];
        const expected = previewRenewal(current[index].expiry, days, nowMs);
        let requestError = null;
        try { await transport.update(profile, { days, enable: true }); } catch (error) { requestError = error; }
        try {
            const actual = await transport.read(profile);
            // Allow small client/server clock differences, never a missing day.
            if (actual.enabled === true && Number(actual.expiry) >= expected - 2000) results.push({ server_id: profile.server_id, state: "ok", expiry: actual.expiry });
            else results.push({ server_id: profile.server_id, state: "unknown", error: requestError?.message || "Новая дата или включение не подтверждены. Проверьте срок перед повторным продлением." });
        } catch {
            results.push({ server_id: profile.server_id, state: "unknown", error: "Не удалось проверить результат. Повторный запрос автоматически не отправлен." });
        }
    }
    return { changed: false, current, results };
}
