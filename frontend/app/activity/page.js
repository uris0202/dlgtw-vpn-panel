"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    FileClock,
    KeyRound,
    RefreshCw,
    Search,
    Server,
    Settings,
    ShoppingCart,
    UserRound,
    Users,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";

const PAGE_SIZE = 50;

export default function ActivityPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [events, setEvents] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [query, setQuery] = useState("");
    const [actorType, setActorType] = useState("");
    const [entityType, setEntityType] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        bootstrap();
    }, [router]);

    async function bootstrap() {
        const me = await getMe();

        if (!me) {
            router.replace("/login");
            return;
        }

        setUser(me);
        await loadEvents(0, { query: "", actorType: "", entityType: "" });
        setLoading(false);
    }

    async function loadEvents(nextOffset = offset, filters = null) {
        const activeFilters = filters || { query, actorType, entityType };
        setError("");

        try {
            const response = await api.get("/audit-logs", {
                ...getAuthConfig(),
                params: {
                    limit: PAGE_SIZE,
                    offset: nextOffset,
                    q: activeFilters.query.trim(),
                    actor_type: activeFilters.actorType,
                    entity_type: activeFilters.entityType,
                },
            });
            setEvents(Array.isArray(response.data?.items) ? response.data.items : []);
            setTotal(Number(response.data?.total || 0));
            setOffset(nextOffset);
        } catch (requestError) {
            setError(getErrorMessage(requestError, "Не удалось загрузить журнал действий."));
        }
    }

    async function applyFilters(event) {
        event.preventDefault();
        setRefreshing(true);
        try {
            await loadEvents(0);
        } finally {
            setRefreshing(false);
        }
    }

    async function resetFilters() {
        const emptyFilters = { query: "", actorType: "", entityType: "" };
        setQuery("");
        setActorType("");
        setEntityType("");
        setRefreshing(true);
        try {
            await loadEvents(0, emptyFilters);
        } finally {
            setRefreshing(false);
        }
    }

    async function refresh() {
        setRefreshing(true);
        try {
            await loadEvents(offset);
        } finally {
            setRefreshing(false);
        }
    }

    async function changePage(nextOffset) {
        setRefreshing(true);
        try {
            await loadEvents(nextOffset);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } finally {
            setRefreshing(false);
        }
    }

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    const firstItem = total === 0 ? 0 : offset + 1;
    const lastItem = Math.min(offset + events.length, total);
    const hasPrevious = offset > 0;
    const hasNext = offset + PAGE_SIZE < total;

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Журнал действий"
                description="Платежи, заказы и изменения конфигурации панели"
                actions={
                    <Button variant="outline" onClick={refresh} disabled={loading || refreshing}>
                        <RefreshCw className={refreshing ? "animate-spin" : ""} />
                        Обновить
                    </Button>
                }
            />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка журнала...</Alert>}
                {error && <Alert variant="error">{error}</Alert>}
            </div>

            <Card className="mb-4 p-4">
                <form onSubmit={applyFilters} className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_200px_220px_auto] xl:items-center">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Администратор, клиент или номер заказа"
                            className="pl-9"
                            aria-label="Поиск по журналу"
                        />
                    </label>

                    <Select value={actorType} onChange={(event) => setActorType(event.target.value)} aria-label="Исполнитель">
                        <option value="">Все исполнители</option>
                        <option value="admin">Администратор</option>
                        <option value="customer">Клиент</option>
                        <option value="system">Система</option>
                    </Select>

                    <Select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="Раздел">
                        <option value="">Все разделы</option>
                        <option value="order">Заказы</option>
                        <option value="account">Личные кабинеты</option>
                        <option value="client">VPN-клиенты</option>
                        <option value="server">Серверы</option>
                        <option value="plan">Тарифы</option>
                        <option value="settings">Настройки</option>
                        <option value="admin">Администраторы</option>
                    </Select>

                    <div className="flex gap-2">
                        <Button type="submit" disabled={refreshing}>Применить</Button>
                        <Button type="button" variant="outline" onClick={resetFilters} disabled={refreshing}>Сбросить</Button>
                    </div>
                </form>
            </Card>

            {!loading && events.length === 0 ? (
                <Card className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
                    <FileClock className="size-8 text-muted-foreground" />
                    <div className="text-sm font-medium">События не найдены</div>
                    <div className="text-sm text-muted-foreground">Новые действия появятся здесь автоматически.</div>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="divide-y divide-border">
                        {events.map((event) => <ActivityRow key={event.id} event={event} />)}
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-muted-foreground">
                            Показано {firstItem}-{lastItem} из {total}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
                                disabled={!hasPrevious || refreshing}
                                aria-label="Предыдущая страница"
                            >
                                <ChevronLeft />
                                Назад
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => changePage(offset + PAGE_SIZE)}
                                disabled={!hasNext || refreshing}
                                aria-label="Следующая страница"
                            >
                                Далее
                                <ChevronRight />
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </AdminLayout>
    );
}

function ActivityRow({ event }) {
    const meta = getActionMeta(event.action, event.entity_type);
    const Icon = meta.icon;
    const detailItems = getDetailItems(event.details);

    return (
        <article className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[40px_minmax(0,1fr)_auto] lg:items-start">
            <div className={`flex size-10 items-center justify-center rounded-md ${meta.iconClass}`}>
                <Icon className="size-4.5" />
            </div>

            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-sm font-semibold">{event.summary}</h2>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{getActorLabel(event.actor_type)}: <span className="font-medium text-foreground">{event.actor_label}</span></span>
                    {event.entity_id && <span>Объект: <span className="font-medium text-foreground">{event.entity_id}</span></span>}
                    {event.ip_address && <span>IP: {event.ip_address}</span>}
                </div>

                {detailItems.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {detailItems.map((item) => (
                            <span key={item} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                                {item}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={event.created_at}>
                {formatDateTime(event.created_at)}
            </time>
        </article>
    );
}

function getActionMeta(action, entityType) {
    if (action === "order.payment_reported") return { label: "Оплата заявлена", variant: "warning", icon: CircleDollarSign, iconClass: "bg-[#fffaeb] text-[#b54708]" };
    if (action === "order.payment_confirmed") return { label: "Оплата подтверждена", variant: "success", icon: CircleDollarSign, iconClass: "bg-[#ecfdf3] text-[#067647]" };
    if (action === "order.activation_failed") return { label: "Ошибка выдачи", variant: "destructive", icon: FileClock, iconClass: "bg-[#fef3f2] text-[#b42318]" };
    if (action === "order.canceled" || action.endsWith(".deleted")) return { label: action === "order.canceled" ? "Заказ отменён" : "Удаление", variant: "destructive", icon: FileClock, iconClass: "bg-[#fef3f2] text-[#b42318]" };
    if (action.startsWith("order.")) return { label: "Заказ", variant: "outline", icon: ShoppingCart, iconClass: "bg-muted text-muted-foreground" };
    if (entityType === "client") return { label: "VPN-клиент", variant: "outline", icon: Users, iconClass: "bg-[#eff4ff] text-[#155eef]" };
    if (entityType === "server") return { label: "Сервер", variant: "outline", icon: Server, iconClass: "bg-[#f0f9ff] text-[#026aa2]" };
    if (entityType === "plan") return { label: "Тариф", variant: "outline", icon: CircleDollarSign, iconClass: "bg-[#fdf4ff] text-[#9f1ab1]" };
    if (entityType === "settings") return { label: "Настройки", variant: "outline", icon: Settings, iconClass: "bg-muted text-muted-foreground" };
    if (action.includes("login")) return { label: "Вход", variant: "outline", icon: KeyRound, iconClass: "bg-muted text-muted-foreground" };
    return { label: entityType === "account" ? "Личный кабинет" : "Администратор", variant: "outline", icon: UserRound, iconClass: "bg-muted text-muted-foreground" };
}

function getDetailItems(details) {
    if (!details || typeof details !== "object") return [];
    const result = [];

    if (details.plan_name) result.push(`Тариф: ${details.plan_name}`);
    if (Array.isArray(details.server_ids) && details.server_ids.length > 0) result.push(`Серверы: ${details.server_ids.join(", ")}`);
    if (Number(details.amount) > 0) result.push(`Сумма: ${formatPrice(details.amount, details.currency)}`);
    if (details.status) result.push(`Статус: ${getStatusLabel(details.status)}`);
    if (Array.isArray(details.changed_fields) && details.changed_fields.length > 0) result.push(`Поля: ${details.changed_fields.map(getFieldLabel).join(", ")}`);
    if (details.activation_error) result.push("Есть ошибка выдачи доступа");

    return result.slice(0, 5);
}

function getActorLabel(actorType) {
    if (actorType === "admin") return "Администратор";
    if (actorType === "customer") return "Клиент";
    return "Система";
}

function getFieldLabel(field) {
    const labels = {
        status: "статус",
        plan_id: "тариф",
        server_id: "сервер",
        server_ids: "серверы",
        client_email: "клиент",
        customer_contact: "контакт",
        name: "название",
        price: "цена",
        is_active: "активность",
        enabled: "доступность",
        email: "имя клиента",
        group: "группа",
        comment: "комментарий",
        days: "срок",
        total_gb: "трафик",
    };
    return labels[field] || field;
}

function getStatusLabel(status) {
    if (status === "paid") return "оплачен";
    if (status === "canceled") return "отменён";
    if (status === "access") return "доступ в ЛК";
    return "ожидает оплаты";
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatPrice(amount, currency) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(amount || 0)) + ` ${currency || "RUB"}`;
}

function getAuthConfig() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
}

function getErrorMessage(error, fallback) {
    return error?.response?.data?.detail || error?.message || fallback;
}
