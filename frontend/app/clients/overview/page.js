"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import AdminLayout from "../../../components/AdminLayout";
import PageHeading from "../../../components/PageHeading";
import ClientDirectoryTable from "../../../components/ClientDirectoryTable";
import ClientDetailsModal from "../../../components/ClientDetailsModal";
import ClientModal from "../../../components/ClientModal";
import ClientLinksModal from "../../../components/ClientLinksModal";
import { Alert } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input, Select } from "../../../components/ui/input";
import api from "../../../lib/api";
import { getMe } from "../../../lib/auth";
import { buildClientDirectory, matchesDirectory } from "../../../lib/clientDirectory";

export default function ClientOverviewPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [servers, setServers] = useState([]);
    const [snapshots, setSnapshots] = useState({});
    const [accounts, setAccounts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [settings, setSettings] = useState({});
    const [plans, setPlans] = useState([]);
    const [metadataErrors, setMetadataErrors] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [checkedAt, setCheckedAt] = useState(null);
    const [query, setQuery] = useState("");
    const [connection, setConnection] = useState("all");
    const [group, setGroup] = useState("all");
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedName, setSelectedName] = useState(null);
    const [editProfile, setEditProfile] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [linksProfile, setLinksProfile] = useState(null);
    const [saving, setSaving] = useState(false);
    const [modalError, setModalError] = useState("");
    const request = useRef(0);
    const controller = useRef(null);
    const running = useRef(false);
    const serverList = useRef([]);
    const mutation = useRef(false);

    const load = useCallback(async ({ metadata = true, initial = false } = {}) => {
        controller.current?.abort();
        const abort = new AbortController(); controller.current = abort;
        const sequence = ++request.current;
        const current = () => sequence === request.current && !abort.signal.aborted;
        running.current = true; setRefreshing(true);
        if (initial) setLoading(true);
        try {
            const me = await getMe();
            if (!current()) return;
            if (!me) { router.replace("/login?next=/clients/overview"); return; }
            setUser(me);
            const config = { ...auth(), signal: abort.signal };
            let targets = serverList.current;
            if (metadata) {
                const response = await api.get("/servers", config);
                if (!current()) return;
                targets = Array.isArray(response.data) ? response.data : [];
                serverList.current = targets; setServers(targets);
                const requests = ["accounts", "orders", "settings", "plans"];
                const results = await Promise.all(requests.map(async (key) => {
                    try { return { key, data: (await api.get(`/${key}`, config)).data }; }
                    catch (failure) { return { key, error: errorMessage(failure, `Не удалось загрузить ${key}.`) }; }
                }));
                if (!current()) return;
                const errors = {};
                for (const result of results) {
                    if (result.error) errors[result.key] = result.error;
                    if (result.key === "accounts") setAccounts(Array.isArray(result.data) ? result.data : []);
                    if (result.key === "orders") setOrders(Array.isArray(result.data) ? result.data : []);
                    if (result.key === "settings") setSettings(result.data || {});
                    if (result.key === "plans") setPlans(Array.isArray(result.data) ? result.data : []);
                }
                setMetadataErrors(errors);
            }
            setError("");
            setSnapshots((previous) => Object.fromEntries(targets.map((server) => [server.id, server.enabled === false ? { state: "disabled", error: "Сервер отключён в панели." } : previous[server.id] || { state: "loading" }])));
            // Bound concurrency so a large inventory cannot flood the VPN panels.
            let next = 0;
            async function worker() {
                while (next < targets.length && current()) {
                    const server = targets[next++];
                    if (server.enabled === false) continue;
                    try {
                        const response = await api.get(`/clients/${server.id}`, config);
                        if (!Array.isArray(response.data?.clients)) throw new Error("Некорректный ответ списка клиентов.");
                        if (current()) setSnapshots((previous) => ({ ...previous, [server.id]: { state: "ok", data: response.data } }));
                    } catch (failure) {
                        if (current()) setSnapshots((previous) => ({ ...previous, [server.id]: { state: "error", error: errorMessage(failure, "Список клиентов недоступен."), data: previous[server.id]?.data } }));
                    }
                }
            }
            await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
            if (current()) setCheckedAt(Date.now());
        } catch (failure) {
            if (current()) {
                setError(errorMessage(failure, "Не удалось обновить обзор."));
                setSnapshots((previous) => Object.fromEntries(Object.entries(previous).map(([id, snapshot]) => [id, { ...snapshot, state: "error" }])));
            }
        } finally {
            if (current()) { running.current = false; setLoading(false); setRefreshing(false); }
        }
    }, [router]);

    useEffect(() => {
        setQuery(new URLSearchParams(window.location.search).get("q") || "");
        load({ initial: true });
        return () => { request.current++; controller.current?.abort(); running.current = false; };
    }, [load]);
    useEffect(() => {
        if (!autoRefresh || selectedName !== null || createOpen || editProfile || linksProfile || saving) return undefined;
        function refreshVisibleDirectory() { if (document.visibilityState === "visible" && !running.current) load({ metadata: false }); }
        const timer = window.setInterval(refreshVisibleDirectory, 30000);
        document.addEventListener("visibilitychange", refreshVisibleDirectory);
        return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisibleDirectory); };
    }, [autoRefresh, selectedName, createOpen, editProfile, linksProfile, saving, load]);

    const clients = useMemo(() => buildClientDirectory(servers, snapshots, accounts, orders), [servers, snapshots, accounts, orders]);
    const filtered = useMemo(() => clients.filter((client) => matchesDirectory(client, { query, connection, group })), [clients, query, connection, group]);
    const groups = useMemo(() => [...new Set(clients.flatMap((client) => client.groups))].sort((a, b) => a.localeCompare(b, "ru")), [clients]);
    const activeServers = useMemo(() => servers.filter((server) => server.enabled !== false), [servers]);
    const activePlans = useMemo(() => plans.filter((plan) => plan.is_active), [plans]);
    const selected = clients.find((client) => client.name === selectedName);
    const failed = servers.filter((server) => snapshots[server.id]?.state === "error");
    const incomplete = servers.filter((server) => snapshots[server.id]?.data?.truncated);

    async function saveClient(payload) {
        if (mutation.current) return;
        mutation.current = true; setSaving(true); setModalError("");
        try {
            if (editProfile) {
                await api.patch(`/clients/${editProfile.server_id}/${encodeURIComponent(editProfile.email)}`, payload, auth());
                // A rename only affects this profile. Other servers and account names are not rewritten.
                setEditProfile(null); setSelectedName(null);
            } else {
                const { server_ids: ids, ...values } = payload;
                const results = await Promise.all(ids.map(async (id) => {
                    try { await api.post(`/clients/${id}`, values, auth()); return { id }; }
                    catch (failure) { return { id, error: errorMessage(failure, "Ошибка создания.") }; }
                }));
                const failures = results.filter((result) => result.error);
                setCreateOpen(false);
                if (failures.length) setError(`Создание выполнено на ${results.length - failures.length} из ${results.length} серверов. ${failures.map((result) => `${servers.find((server) => server.id === result.id)?.name || result.id}: ${result.error}`).join("; ")}`);
                else setMessage("Клиент создан.");
                await load();
                if (failures.length) setError(`Создание выполнено на ${results.length - failures.length} из ${results.length} серверов. ${failures.map((result) => `${servers.find((server) => server.id === result.id)?.name || result.id}: ${result.error}`).join("; ")}`);
                return;
            }
            setMessage("Профиль сохранён."); await load();
        } catch (failure) { setModalError(errorMessage(failure, "Не удалось сохранить клиента.")); }
        finally { mutation.current = false; setSaving(false); }
    }

    async function createAccount(client) {
        const normalized = client.name.trim().toLowerCase();
        const names = [...clients.map((item) => item.name), ...accounts.map((item) => item.client_email), ...orders.map((item) => item.client_email)];
        if (client.name !== client.name.trim() || names.some((name) => name !== client.name && String(name || "").trim().toLowerCase() === normalized)) {
            throw new Error("Есть совпадение имени без учёта регистра или пробелов. Сначала задайте разные имена профилям: существующий API выдачи ЛК сопоставляет такие имена вместе.");
        }
        if (metadataErrors.accounts || metadataErrors.orders) throw new Error("Сначала обновите данные кабинетов и заказов.");
        const ids = client.profiles.filter((profile) => !profile.stale).map((profile) => Number(profile.server_id));
        if (!ids.length) throw new Error("Сначала обновите доступность серверов.");
        try {
            await api.post("/orders/account-access", { client_email: client.name, server_id: ids[0], server_ids: ids, customer_contact: client.profiles[0]?.comment || "" }, auth());
            await load();
        } catch (failure) { throw new Error(errorMessage(failure, "Не удалось выдать доступ в ЛК.")); }
    }

    return <AdminLayout user={user} onLogout={() => { localStorage.removeItem("token"); router.replace("/login"); }}>
        <PageHeading title="Клиенты" description="Общий обзор доступов и подключений" actions={<>
            <Select value="all" onChange={(event) => event.target.value !== "all" && router.push(`/clients?server=${event.target.value}`)} aria-label="Режим просмотра клиентов" className="w-full sm:w-48"><option value="all">Все серверы</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</Select>
            <Button variant="outline" className="flex-1 px-3 text-sm sm:flex-none sm:px-4" onClick={() => { setMessage(""); load(); }} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : ""} />Обновить</Button>
            <Button className="flex-1 px-3 text-sm sm:flex-none sm:px-4" disabled={loading || refreshing || !servers.some((server) => server.enabled !== false) || Boolean(metadataErrors.settings) || Boolean(metadataErrors.plans)} onClick={() => { setModalError(""); setCreateOpen(true); }}><Plus />Новый клиент</Button>
        </>} />
        <div className="mb-5 flex flex-wrap items-center gap-2"><Badge variant="outline">Клиентов: {clients.length}</Badge><Badge variant="success">Онлайн: {clients.filter((client) => client.onlineCount > 0).length}</Badge><Badge variant="outline">Профилей: {clients.reduce((sum, client) => sum + client.profiles.length, 0)}</Badge><label className="ml-auto flex min-h-8 items-center gap-2 text-xs text-muted-foreground" title="Обновлять подключения каждые 30 секунд, пока вкладка видна"><input type="checkbox" className="size-4 accent-[#155eef]" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />Автообновление</label>{checkedAt && <span className="w-full text-xs text-muted-foreground sm:w-auto">Проверка: {new Date(checkedAt).toLocaleTimeString("ru-RU")}</span>}</div>
        {loading && <Alert className="mb-4"><Loader2 className="mr-2 inline size-4 animate-spin" />Загрузка клиентов со всех серверов...</Alert>}
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}{message && <Alert variant="success" className="mb-4">{message}</Alert>}
        {Object.keys(metadataErrors).length > 0 && <Alert variant="warning" className="mb-4">Часть данных панели не загружена: {Object.keys(metadataErrors).map((key) => ({ accounts: "кабинеты", orders: "заказы", settings: "настройки", plans: "тарифы" })[key]).join(", ")}. Доступные VPN-профили показаны отдельно; обновите страницу для повторной проверки.</Alert>}
        {failed.length > 0 && <Alert variant="warning" className="mb-4"><div className="font-medium">Не все серверы ответили</div>{failed.map((server) => <div key={server.id} className="mt-1 break-words">{server.name}: {snapshots[server.id].error || "Нет актуальных данных."}</div>)}</Alert>}
        {incomplete.length > 0 && <Alert variant="warning" className="mb-4">Неполный список 3X-UI: {incomplete.map((server) => server.name).join(", ")}. Часть клиентов может отсутствовать.</Alert>}
        {!loading && !servers.length && <Alert className="mb-4">Сначала добавьте сервер в разделе «Серверы».</Alert>}
        <div className="mb-4 border-y border-border py-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_180px_180px]"><label className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Клиент, контакт, сервер или группа" aria-label="Поиск по всем клиентам" className="pl-9" /></label><Select value={connection} onChange={(event) => setConnection(event.target.value)} aria-label="Подключение клиента"><option value="all">Все подключения</option><option value="online">Онлайн</option><option value="offline">Не в сети</option><option value="unknown">Нет полных данных</option></Select><Select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Группа клиента"><option value="all">Все группы</option><option value="none">Без группы</option>{groups.map((value) => <option key={value} value={value}>{value}</option>)}</Select></div><div className="mt-3 text-xs text-muted-foreground">Показано {filtered.length} из {clients.length}</div></div>
        <ClientDirectoryTable clients={filtered} onOpen={setSelectedName} busy={loading || refreshing} ordersAvailable={!metadataErrors.orders} />
        {selected && !editProfile && !linksProfile && <ClientDetailsModal client={selected} servers={servers} snapshots={snapshots} metadataErrors={metadataErrors} onClose={() => setSelectedName(null)} onEdit={(profile) => { setModalError(""); setEditProfile(profile); }} onLinks={setLinksProfile} onChanged={() => load()} onCreateAccount={createAccount} />}
        <ClientModal open={createOpen || Boolean(editProfile)} mode={editProfile ? "edit" : "create"} client={editProfile} groupOptions={groups} serverOptions={activeServers} planOptions={activePlans} currentServerId={editProfile?.server_id || null} defaultSettings={settings} error={modalError} saving={saving} onClose={() => { if (!saving) { setCreateOpen(false); setEditProfile(null); } }} onSave={saveClient} />
        <ClientLinksModal client={linksProfile} onClose={() => setLinksProfile(null)} />
    </AdminLayout>;
}

function auth() { return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, timeout: 20000 }; }
function errorMessage(error, fallback) { const detail = error?.response?.data?.detail; return typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((item) => item.msg).filter(Boolean).join("; ") : error?.message || fallback; }
