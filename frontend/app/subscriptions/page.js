"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Loader2, QrCode, Search, UserRound } from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import ClientLinksModal from "../../components/ClientLinksModal";
import PageHeading from "../../components/PageHeading";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";

export default function SubscriptionsPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [copyStatus, setCopyStatus] = useState("");
    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pageError, setPageError] = useState("");

    useEffect(() => {
        async function loadUser() {
            const me = await getMe();
            if (!me) {
                router.replace("/login");
                return;
            }
            setUser(me);
        }
        loadUser();
    }, [router]);

    async function searchSubscriptions(event) {
        event.preventDefault();
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            setPageError("Введите имя клиента или псевдоним.");
            return;
        }
        setLoading(true);
        setSearched(false);
        setPageError("");
        setCopyStatus("");
        try {
            const me = await getMe();
            if (!me) {
                router.replace("/login");
                return;
            }
            setUser(me);
            const response = await api.get(`/clients/search/${encodeURIComponent(normalizedQuery)}`, getAuthConfig());
            setResults(Array.isArray(response.data) ? response.data : []);
            setSearched(true);
        } catch (error) {
            setPageError(getErrorMessage(error, "Не удалось найти подписку."));
        } finally {
            setLoading(false);
        }
    }

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading title="Подписки" description="Поиск VLESS, QR-кода и subscription URL клиента" />

            <Card className="mb-5 p-4 sm:p-5">
                <form onSubmit={searchSubscriptions} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Имя клиента, группа или комментарий"
                            className="pl-9"
                            aria-label="Поиск подписки"
                            autoFocus
                        />
                    </label>
                    <Button type="submit" disabled={loading} className="sm:min-w-28">
                        {loading ? <Loader2 className="animate-spin" /> : <Search />}
                        {loading ? "Поиск..." : "Найти"}
                    </Button>
                </form>
                <p className="mt-3 mb-0 text-xs text-muted-foreground">Поиск выполняется сразу по всем подключённым 3X-UI серверам.</p>
            </Card>

            <div className="mb-5 grid gap-3">
                {pageError && <Alert variant="error">{pageError}</Alert>}
                {copyStatus && <Alert variant="success">{copyStatus}</Alert>}
            </div>

            {searched && results.length === 0 && (
                <Card className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
                    <Link2 className="size-8 text-muted-foreground" />
                    <div className="text-sm font-medium">Подписка не найдена</div>
                    <div className="text-sm text-muted-foreground">Проверьте имя клиента и повторите поиск.</div>
                </Card>
            )}

            {results.length > 0 && (
                <>
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="m-0 text-base font-semibold">Результаты</h2>
                        <Badge variant="outline">Найдено: {results.length}</Badge>
                    </div>
                    <Card className="overflow-hidden">
                        <div className="divide-y divide-border">
                            {results.map((client) => (
                                <SubscriptionRow
                                    key={`${client.server_id}-${client.email}`}
                                    client={client}
                                    onOpenLinks={setSelectedClient}
                                    onCopy={setCopyStatus}
                                    onOpenClient={() => router.push(`/clients?server=${client.server_id}&q=${encodeURIComponent(client.email)}`)}
                                />
                            ))}
                        </div>
                    </Card>
                </>
            )}

            {!searched && !loading && (
                <div className="flex min-h-56 flex-col items-center justify-center text-center text-muted-foreground">
                    <QrCode className="size-9" />
                    <div className="mt-3 text-sm font-medium text-foreground">Найдите клиента</div>
                    <div className="mt-1 max-w-md text-sm">Здесь можно открыть QR-код и скопировать ссылки для подключения.</div>
                </div>
            )}

            <ClientLinksModal client={selectedClient} onClose={() => setSelectedClient(null)} />
        </AdminLayout>
    );
}

function SubscriptionRow({ client, onOpenLinks, onCopy, onOpenClient }) {
    const hasLinks = Boolean(client.vless_url || client.subscription_url);
    return (
        <article className="grid gap-4 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 break-words text-base font-semibold">{client.email || "Без имени"}</h3>
                    <Badge variant={client.enabled ? "success" : "destructive"}>{client.enabled ? "Активен" : "Отключен"}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{client.server} · {client.country} · {client.group || "Без группы"}</div>
                <div className="mt-2 text-xs text-muted-foreground">Окончание: <span className="font-medium text-foreground">{formatExpiry(client.expiry)}</span></div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button type="button" size="sm" onClick={() => onOpenLinks(client)} disabled={!hasLinks}><QrCode />QR и ссылки</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(client.subscription_url, "Subscription URL скопирован.", onCopy)} disabled={!client.subscription_url}><Copy />Subscription</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(client.vless_url, "VLESS ссылка скопирована.", onCopy)} disabled={!client.vless_url}><Copy />VLESS</Button>
                <Button type="button" variant="ghost" size="sm" onClick={onOpenClient}><UserRound />Клиент</Button>
            </div>
        </article>
    );
}

async function copyText(value, message, setStatus) {
    if (!value) {
        setTemporaryStatus(setStatus, "Ссылка недоступна.");
        return;
    }
    try { await navigator.clipboard.writeText(value); } catch { fallbackCopy(value); }
    setTemporaryStatus(setStatus, message);
}

function setTemporaryStatus(setStatus, message) {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
}

function fallbackCopy(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}

function getAuthConfig() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}

function formatExpiry(value) {
    return !value || value === 0 ? "Без срока" : new Date(value).toLocaleDateString("ru-RU");
}
