"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search, UserRoundSearch } from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";

export default function SearchPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
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

    async function searchClient(event) {
        event.preventDefault();
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            setPageError("Введите имя клиента или псевдоним.");
            return;
        }
        setLoading(true);
        setPageError("");
        setSearched(false);
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
            setPageError(getErrorMessage(error, "Не удалось выполнить поиск."));
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
            <PageHeading title="Поиск клиента" description="Поиск по имени, группе или комментарию на всех VPN-серверах" />

            <Card className="mb-5 p-4 sm:p-5">
                <form onSubmit={searchClient} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя клиента или псевдоним" className="pl-9" aria-label="Поиск клиента" autoFocus />
                    </label>
                    <Button type="submit" disabled={loading} className="sm:min-w-28">
                        {loading ? <Loader2 className="animate-spin" /> : <Search />}
                        {loading ? "Поиск..." : "Найти"}
                    </Button>
                </form>
            </Card>

            {pageError && <Alert variant="error" className="mb-5">{pageError}</Alert>}

            {searched && results.length === 0 && (
                <Card className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
                    <UserRoundSearch className="size-8 text-muted-foreground" />
                    <div className="text-sm font-medium">Клиент не найден</div>
                    <div className="text-sm text-muted-foreground">Проверьте запрос или попробуйте найти клиента по группе.</div>
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
                                <article key={`${client.server_id}-${client.email}`} className="grid gap-4 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="m-0 break-words text-base font-semibold">{client.email}</h3>
                                            <Badge variant={client.enabled ? "success" : "destructive"}>{client.enabled ? "Активен" : "Отключен"}</Badge>
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">{client.server} · {client.country} · {client.group || "Без группы"}</div>
                                        <div className="mt-3 grid grid-cols-2 gap-4 sm:max-w-md">
                                            <Detail label="Трафик" value={formatTraffic(client.traffic)} />
                                            <Detail label="Окончание" value={formatExpiry(client.expiry)} />
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => router.push(`/clients?server=${client.server_id}&q=${encodeURIComponent(client.email)}`)}>Открыть клиента <ArrowRight /></Button>
                                </article>
                            ))}
                        </div>
                    </Card>
                </>
            )}

            {!searched && !loading && (
                <div className="flex min-h-56 flex-col items-center justify-center text-center text-muted-foreground">
                    <UserRoundSearch className="size-9" />
                    <div className="mt-3 text-sm font-medium text-foreground">Поиск по всей инфраструктуре</div>
                    <div className="mt-1 max-w-md text-sm">Результаты покажут сервер, статус, трафик и срок действия клиента.</div>
                </div>
            )}
        </AdminLayout>
    );
}

function Detail({ label, value }) {
    return <div><div className="text-sm font-semibold">{value}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div></div>;
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

function formatTraffic(value) {
    return `${(Number(value || 0) / 1024 ** 3).toFixed(2)} GB`;
}

function formatExpiry(value) {
    return !value || value === 0 ? "Без срока" : new Date(value).toLocaleDateString("ru-RU");
}
