"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Copy, ExternalLink, Link2, Loader2, Pencil, QrCode, ReceiptText, RefreshCw, ScrollText, Server, UserRoundCog, X } from "lucide-react";
import api from "../lib/api";
import useDialogLifecycle from "../lib/useDialogLifecycle";
import { formatClientExpiry, matchesClientAudit, previewRenewal, renewClientProfiles } from "../lib/clientDirectory";
import { clientPresence, formatLastOnline } from "../lib/clientPresence";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DirectoryPresence } from "./ClientDirectoryTable";

const tabs = [{ id: "servers", label: "Серверы", icon: Server }, { id: "renew", label: "Продление", icon: CalendarPlus }, { id: "orders", label: "Заказы", icon: ReceiptText }, { id: "history", label: "История", icon: ScrollText }, { id: "accounts", label: "Кабинеты", icon: UserRoundCog }];
const orderLabels = { paid: "Оплачен", pending: "Ожидает оплаты", canceled: "Отменён", access: "Доступ вручную" };

export default function ClientDetailsModal({ client, servers, snapshots, metadataErrors, onClose, onEdit, onLinks, onChanged, onCreateAccount }) {
    const [tab, setTab] = useState("servers");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const dialog = useRef(null);
    useDialogLifecycle(true, onClose, busy);
    useEffect(() => {
        const previous = document.activeElement;
        dialog.current?.querySelector("button")?.focus();
        return () => previous?.focus?.();
    }, []);

    async function copy(value) {
        setError("");
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
            else {
                const field = document.createElement("textarea");
                field.value = value; field.style.position = "fixed"; field.style.left = "-9999px";
                document.body.appendChild(field); field.select();
                const copied = document.execCommand("copy"); field.remove();
                if (!copied) throw new Error("Не удалось скопировать ссылку.");
            }
            setMessage("Ссылка скопирована.");
        } catch { setError("Не удалось скопировать ссылку. Откройте кабинет через кнопку рядом."); }
    }

    async function createAccount() {
        setBusy(true); setError(""); setMessage("");
        try { await onCreateAccount(client); setMessage("Кабинет создан. Его ссылка доступна в этой вкладке."); }
        catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
    }

    function trapFocus(event) {
        if (event.key !== "Tab") return;
        const focusable = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter((element) => !element.disabled && element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }

    const missing = [...client.expectedServerIds].filter((id) => !client.profiles.some((profile) => Number(profile.server_id) === id));
    return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
        <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="client-details-title" onKeyDown={trapFocus} className="flex max-h-[96dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-lg border border-border bg-card shadow-2xl sm:max-w-4xl sm:rounded-lg">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
                <div className="min-w-0"><h2 id="client-details-title" className="m-0 break-words text-lg font-semibold">{client.name}</h2><div className="mt-2"><DirectoryPresence client={client} /></div></div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} disabled={busy} title="Закрыть карточку" aria-label="Закрыть карточку"><X /></Button>
            </header>
            <div role="tablist" aria-label="Карточка клиента" className="flex shrink-0 overflow-x-auto border-b border-border px-2 sm:px-4" onKeyDown={(event) => {
                const index = tabs.findIndex((item) => item.id === tab);
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                if (next !== null && !busy) { event.preventDefault(); setTab(tabs[next].id); event.currentTarget.querySelectorAll('[role="tab"]')[next].focus(); }
            }}>
                {tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`detail-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="client-detail-panel" tabIndex={tab === id ? 0 : -1} disabled={busy} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{label}{id === "orders" && ` (${client.orders.length})`}</button>)}
            </div>
            <div id="client-detail-panel" role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
                {message && <Alert variant="success" className="mb-4">{message}</Alert>}{error && <Alert variant="error" className="mb-4">{error}</Alert>}
                {tab === "servers" && <div className="divide-y divide-border">
                    {client.profiles.map((profile) => <article key={profile.server_id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="m-0 break-words text-sm font-semibold">{profile.server_name}</h3><div className="mt-1 text-xs text-muted-foreground">{profile.country}</div></div><div className="flex flex-wrap gap-2"><Badge variant={profile.enabled ? "success" : "secondary"}>{profile.enabled ? "Доступ включён" : "Доступ отключён"}</Badge><Badge variant={profile.stale ? "warning" : clientPresence(profile) === "online" ? "success" : "outline"}>{profile.stale ? "Данные устарели" : clientPresence(profile) === "online" ? "Онлайн" : clientPresence(profile) === "offline" ? "Не в сети" : "Нет данных"}</Badge></div></div>
                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Detail label="Окончание" value={formatClientExpiry(profile.expiry)} /><Detail label="Трафик" value={`${(Number(profile.traffic || 0) / 1024 ** 3).toFixed(2)} GB`} /><Detail label="Группа" value={profile.group || "Без группы"} /><Detail label="Последняя активность" value={formatLastOnline(profile.last_online) || "Нет данных"} /><Detail label="Комментарий" value={profile.comment || "Не задан"} /><Detail label="Основание в панели" value={client.paidServerIds.has(Number(profile.server_id)) ? "Оплаченный и выданный заказ" : client.manualServerIds.has(Number(profile.server_id)) ? "Административный доступ" : "Профиль 3X-UI"} /></dl>
                        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onEdit(profile)}><Pencil />Изменить</Button><Button size="sm" variant="outline" disabled={!profile.vless_url && !profile.subscription_url} onClick={() => onLinks(profile)}><QrCode />QR и ссылки</Button><Link href={`/clients?server=${profile.server_id}&q=${encodeURIComponent(client.name)}`} className="inline-flex min-h-9 items-center gap-2 px-2 text-sm text-primary hover:underline"><ExternalLink className="size-4" />Список сервера</Link></div>
                    </article>)}
                    {missing.map((id) => <div key={id} className="py-4 text-sm"><span className="font-medium">{servers.find((server) => Number(server.id) === id)?.name || `Сервер #${id}`}</span><div className="mt-1 text-muted-foreground">{snapshots[id]?.state === "ok" && !snapshots[id]?.data?.truncated ? "Профиль с точным именем не найден в 3X-UI." : "Нет актуальных данных профиля."}</div></div>)}
                    {!client.profiles.length && !missing.length && <p className="text-sm text-muted-foreground">Профили не найдены.</p>}
                </div>}
                {tab === "renew" && <ClientRenewal client={client} onBusy={setBusy} onChanged={onChanged} />}
                {tab === "history" && <ClientHistory name={client.name} servers={servers} />}
                {tab === "orders" && <>
                    {metadataErrors.orders && <Alert variant="error" className="mb-4">{metadataErrors.orders}</Alert>}
                    <div className="divide-y divide-border">{client.orders.map((order) => <article key={order.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 text-sm font-semibold">Заказ #{order.id} · {order.plan_name || (order.status === "access" ? "Доступ в ЛК" : "Без тарифа")}</h3><Badge variant={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "outline"}>{orderLabels[order.status] || order.status}</Badge></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground"><span>{order.amount} {order.currency}</span><span>{order.duration_days ? `${order.duration_days} дн.` : "Без срока"}</span><span className="break-words">{order.server_names || order.server_name || "Серверы не указаны"}</span></div>{order.paid_at && <div className="mt-1 text-xs text-muted-foreground">Оплата: {new Date(order.paid_at).toLocaleString("ru-RU")}</div>}{order.note && <p className="mt-2 break-words text-sm">{order.note}</p>}{order.activation_error && <Alert variant="error" className="mt-2">{order.activation_error}</Alert>}</article>)}</div>
                    {!client.orders.length && !metadataErrors.orders && <p className="text-sm text-muted-foreground">Заказов с этим именем нет.</p>}
                    <Link href={`/orders?q=${encodeURIComponent(client.name)}`} className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"><ReceiptText className="size-4" />Открыть раздел заказов</Link>
                </>}
                {tab === "accounts" && <>
                    {metadataErrors.accounts && <Alert variant="error" className="mb-4">{metadataErrors.accounts}</Alert>}
                    {client.accounts.length > 1 && <Alert variant="warning" className="mb-4">С этим точным именем связано несколько кабинетов. Проверьте контакт перед отправкой ссылки.</Alert>}
                    <div className="divide-y divide-border">{client.accounts.map((account) => <article key={account.account_token} className="py-4 first:pt-0"><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Логин" value={account.account_login || "Не задан"} /><Detail label="Контакт" value={account.customer_contact || "Не указан"} /><Detail label="Пароль" value={account.has_password ? "Настроен" : "Не настроен"} /><Detail label="Последний тариф" value={account.latest_plan_name || "Не указан"} /></dl><div className="mt-4 flex flex-wrap gap-2"><Link href={`/account/${account.account_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 text-sm text-primary hover:underline"><ExternalLink className="size-4" />Открыть ЛК</Link><Button size="sm" variant="outline" onClick={() => copy(`${window.location.origin}/account/${account.account_token}`)}><Copy />Ссылка ЛК</Button><Button size="sm" variant="outline" disabled={!account.subscription_url} onClick={() => copy(account.subscription_url)}><Link2 />Единая подписка</Button></div></article>)}</div>
                    {!client.accounts.length && !metadataErrors.accounts && <div className="grid justify-items-start gap-3"><p className="m-0 text-sm text-muted-foreground">Личный кабинет ещё не выдан.</p><Button onClick={createAccount} disabled={busy || !client.profiles.length}>{busy ? <Loader2 className="animate-spin" /> : <UserRoundCog />}Выдать доступ в ЛК</Button></div>}
                </>}
            </div>
        </section>
    </div>;
}

function Detail({ label, value }) { return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>; }

function ClientHistory({ name, servers }) {
    const [items, setItems] = useState([]);
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError("");
        api.get("/audit-logs", { ...auth(), signal: controller.signal, params: { entity_type: "client", q: name.slice(0, 200), limit: 100, offset } }).then((response) => {
            if (controller.signal.aborted) return;
            const page = (response.data.items || []).filter((event) => matchesClientAudit(event, name));
            setItems((previous) => offset ? [...previous, ...page.filter((item) => !previous.some((existing) => existing.id === item.id))] : page);
            setTotal(Number(response.data.total) || 0);
        }).catch((failure) => {
            if (!controller.signal.aborted) setError(failure.response?.data?.detail || "Не удалось загрузить журнал действий.");
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [name, offset, revision]);
    return <div className="grid gap-4">
        <div className="flex justify-end"><Button size="sm" variant="outline" disabled={loading} onClick={() => { setOffset(0); setRevision((value) => value + 1); }}><RefreshCw className={loading ? "animate-spin" : ""} />Обновить историю</Button></div>
        {error && <Alert variant="error">{typeof error === "string" ? error : "Журнал недоступен."}</Alert>}
        <div className="divide-y divide-border">{items.map((event) => <article key={event.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 break-words text-sm font-semibold">{event.summary}</h3>{Number.isInteger(event.details?.added_days) && <Badge variant="outline">{event.details.added_days > 0 ? `+${event.details.added_days} дн.` : event.details.added_days === 0 ? "Без срока" : "Изменение срока"}</Badge>}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 break-words text-xs text-muted-foreground"><span>{new Date(event.created_at).toLocaleString("ru-RU")}</span><span>{event.actor_label}</span><span>{servers.find((server) => Number(server.id) === Number(event.details?.server_id))?.name || `Сервер #${event.details?.server_id || String(event.entity_id).split(":")[0]}`}</span></div></article>)}</div>
        {loading && <Alert>Загрузка истории...</Alert>}
        {!loading && !items.length && !error && <p className="m-0 text-sm text-muted-foreground">В загруженной части журнала нет записей с этим точным именем.</p>}
        {offset + 100 < total && <Button variant="outline" disabled={loading} onClick={() => setOffset((value) => value + 100)}><ScrollText />Загрузить ещё</Button>}
    </div>;
}

function auth() { return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, timeout: 20000 }; }
async function readProfile(profile, signal) {
    const response = await api.get(`/clients/${profile.server_id}`, { ...auth(), signal });
    const fresh = response.data.clients?.find((item) => item.email === profile.email);
    if (!fresh) throw new Error(`${profile.server_name}: профиль с точным именем не найден.`);
    return { ...profile, ...fresh, stale: false };
}

function ClientRenewal({ client, onBusy, onChanged }) {
    const [days, setDays] = useState("30");
    const [fresh, setFresh] = useState([]);
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [results, setResults] = useState(null);
    const [baseTime, setBaseTime] = useState(Date.now());
    const [revision, setRevision] = useState(0);
    const lock = useRef(false);
    const source = useRef(client.profiles);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError(""); setResults(null); setSelected([]);
        Promise.all(source.current.map((profile) => readProfile(profile, controller.signal).then((value) => ({ value }), (failure) => ({ failure, profile })))).then((values) => {
            if (controller.signal.aborted) return;
            const loaded = values.filter((item) => item.value).map((item) => item.value);
            const now = Date.now(); setFresh(loaded); setBaseTime(now);
            setSelected(loaded.filter((profile) => previewRenewal(profile.expiry, 30, now) !== null).map((profile) => profile.server_id));
            setError(values.filter((item) => item.failure).map((item) => `${item.profile.server_name}: ${item.failure.message}`).join("; "));
            setLoading(false);
        });
        return () => controller.abort();
    }, [revision]);

    async function submit(event) {
        event.preventDefault();
        if (lock.current || results) return;
        const targets = fresh.filter((profile) => selected.includes(profile.server_id));
        if (!targets.length || targets.some((profile) => previewRenewal(profile.expiry, Number(days), baseTime) === null)) { setError("Выберите серверы и укажите от 1 до 3650 дней."); return; }
        if (!window.confirm(`Продлить доступ «${client.name}» на ${days} дней? Серверов: ${targets.length}. Доступ на выбранных серверах будет включён.`)) return;
        lock.current = true; setSaving(true); onBusy(true); setError("");
        try {
            const result = await renewClientProfiles(targets, Number(days), { read: readProfile, update: (profile, payload) => api.patch(`/clients/${profile.server_id}/${encodeURIComponent(profile.email)}`, payload, auth()) }, Date.now());
            if (result.changed) {
                setFresh((previous) => previous.map((profile) => result.current.find((item) => item.server_id === profile.server_id) || profile));
                setBaseTime(Date.now()); setError("Сроки изменились после загрузки. Новые даты показаны ниже; проверьте их и подтвердите продление ещё раз.");
            } else { setResults(result.results); await onChanged(); }
        } catch (failure) { setError(failure.message || "Не удалось завершить проверку. Обновите сроки перед повторным действием."); }
        finally { lock.current = false; setSaving(false); onBusy(false); }
    }

    return <form onSubmit={submit} className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid w-full gap-1.5 text-sm font-medium sm:w-48">Добавить дней<Input type="number" min="1" max="3650" step="1" value={days} onChange={(event) => setDays(event.target.value)} required disabled={saving || Boolean(results)} /></label><Button type="button" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)} disabled={loading || saving}><RefreshCw className={loading ? "animate-spin" : ""} />Обновить сроки</Button></div>
        {loading && <Alert>Проверка текущих сроков на серверах...</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <div className="divide-y divide-border">{!loading && fresh.map((profile) => {
            const preview = previewRenewal(profile.expiry, Number(days), baseTime);
            const result = results?.find((item) => item.server_id === profile.server_id);
            return <label key={profile.server_id} className="flex items-start gap-3 py-4"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#155eef]" aria-label={`Продлить ${profile.server_name}`} checked={selected.includes(profile.server_id)} disabled={saving || Boolean(results) || preview === null} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, profile.server_id] : previous.filter((id) => id !== profile.server_id))} /><span className="grid min-w-0 gap-1 text-sm"><span className="break-words font-semibold">{profile.server_name}</span><span className="text-muted-foreground">Сейчас: {formatClientExpiry(profile.expiry)}</span>{preview !== null && selected.includes(profile.server_id) && <span>После продления: <strong>{formatClientExpiry(preview)}</strong></span>}{result && <span className={result.state === "ok" ? "text-[#067647]" : "text-destructive"}>{result.state === "ok" ? `Подтверждено: ${formatClientExpiry(result.expiry)}` : result.error}</span>}</span></label>;
        })}</div>
        {!loading && !fresh.length && <Alert>Нет доступных профилей для продления.</Alert>}
        {results && <Alert variant={results.every((result) => result.state === "ok") ? "success" : "warning"}>Подтверждено серверов: {results.filter((result) => result.state === "ok").length} из {results.length}. Повторного продления автоматически не будет.</Alert>}
        <div className="flex justify-end"><Button type="submit" disabled={loading || saving || Boolean(results) || !selected.length || !Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 3650}>{saving ? <Loader2 className="animate-spin" /> : <CalendarPlus />}{saving ? "Продление..." : "Подтвердить продление"}</Button></div>
    </form>;
}
