"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    CheckCircle2,
    Clock3,
    RefreshCw,
    Search,
    Server as ServerIcon,
    ShoppingCart,
    Users,
    WifiOff,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import StatCard from "../../components/StatCard";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";
import { getDashboard } from "../../lib/dashboard";
import { getDashboardOrders } from "../../lib/dashboard";

export default function Dashboard() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [servers, setServers] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionOrderId, setActionOrderId] = useState(null);
    const [actionNotice, setActionNotice] = useState("");
    const [pageError, setPageError] = useState("");

    const loadDashboard = useCallback(async ({
        silent = false,
        refresh = false,
    } = {}) => {

        if (!silent) {
            setLoading(true);
        }

        setPageError("");

        try {

            const me = await getMe();

            if (!me) {
                router.replace("/login");
                return;
            }

            setUser(me);

            const [
                dashboard,
                loadedOrders,
            ] = await Promise.all([
                getDashboard({
                    refresh,
                }),
                getDashboardOrders(),
            ]);

            setServers(Array.isArray(dashboard) ? dashboard : []);
            setOrders(Array.isArray(loadedOrders) ? loadedOrders : []);

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось загрузить dashboard."));

        } finally {

            setLoading(false);
            setRefreshing(false);

        }

    }, [router]);

    useEffect(() => {

        loadDashboard();

    }, [loadDashboard]);

    const summary = useMemo(
        () => buildSummary(servers),
        [servers],
    );

    const orderSummary = useMemo(
        () => buildOrderSummary(orders),
        [orders],
    );

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    async function refreshDashboard() {

        setRefreshing(true);

        await loadDashboard({
            silent: true,
            refresh: true,
        });

    }

    function openClient(client) {

        router.push(
            `/clients?server=${client.server_id}&q=${encodeURIComponent(client.email || "")}`
        );

    }

    async function processOrder(order) {

        const retryActivation = Boolean(order.activation_error);

        if (
            !retryActivation
            && !confirm(`Подтвердить оплату заказа #${order.id} для "${order.client_email}"?`)
        ) {
            return;
        }

        setActionOrderId(order.id);
        setActionNotice("");
        setPageError("");

        try {

            await api.patch(
                `/orders/${order.id}`,
                {
                    status: "paid",
                },
                getAuthConfig(),
            );

            setActionNotice(
                retryActivation
                    ? `Выдача заказа #${order.id} повторена.`
                    : `Оплата заказа #${order.id} подтверждена.`,
            );

            await loadDashboard({
                silent: true,
                refresh: true,
            });

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось обработать заказ."));

        } finally {

            setActionOrderId(null);

        }

    }

    return (

        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Панель управления"
                description="Состояние инфраструктуры, клиентов и заказов"
                actions={
                    <>
                        <Button variant="outline" onClick={() => router.push("/search")}>
                            <Search />
                            Найти клиента
                        </Button>
                        <Button onClick={refreshDashboard} disabled={refreshing || loading}>
                            <RefreshCw className={refreshing || loading ? "animate-spin" : ""} />
                            {refreshing || loading ? "Обновление..." : "Обновить"}
                        </Button>
                    </>
                }
            />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка статистики...</Alert>}
                {pageError && <Alert variant="error">{pageError}</Alert>}
                {actionNotice && <Alert variant="success">{actionNotice}</Alert>}
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                        <StatCard
                            title="Серверов онлайн"
                            value={`${summary.onlineServers}/${summary.totalServers}`}
                            description={`${summary.problemServers.length} требуют внимания`}
                            tone={summary.problemServers.length > 0 ? "danger" : "success"}
                        />

                        <StatCard
                            title="Всего клиентов"
                            value={summary.totalClients}
                            description={`${summary.enabledClients} активных, ${summary.disabledClients} отключено`}
                            tone="default"
                        />

                        <StatCard
                            title="Клиентов онлайн"
                            value={summary.onlineClients}
                            description="Суммарно по всем доступным 3X-UI серверам"
                            tone="success"
                        />

                        <StatCard
                            title="Скоро истекают"
                            value={summary.expiringClients.length}
                            description={`${summary.expiredClients.length} уже просрочено`}
                            tone={summary.expiringClients.length > 0 || summary.expiredClients.length > 0 ? "warning" : "neutral"}
                        />

                        <StatCard
                            title="Ожидают оплаты"
                            value={orderSummary.pending.length}
                            description={`${formatPrice(orderSummary.pendingAmount, orderSummary.currency)} к подтверждению`}
                            tone={orderSummary.pending.length > 0 ? "warning" : "neutral"}
                        />

                        <StatCard
                            title="Ошибки выдачи"
                            value={orderSummary.activationErrors.length}
                            description="Заказы, где доступ не выдался автоматически"
                            tone={orderSummary.activationErrors.length > 0 ? "danger" : "success"}
                        />
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-2">
                <DashboardPanel
                    title="Заказы требуют внимания"
                    description="Ручные оплаты и ошибки автоматической выдачи"
                    icon={ShoppingCart}
                    action={<Button variant="ghost" size="sm" onClick={() => router.push("/orders")}>Заказы <ArrowRight /></Button>}
                >
                    {orderSummary.actionItems.length === 0 ? (
                        <EmptyState icon={CheckCircle2}>Нет заказов, требующих действий.</EmptyState>
                    ) : (
                        <div className="divide-y divide-border">
                            {orderSummary.actionItems.slice(0, 8).map((order) => (
                                <OrderAlertRow
                                    key={order.id}
                                    order={order}
                                    actionLoading={actionOrderId === order.id}
                                    onAction={() => processOrder(order)}
                                    onOpen={() => router.push("/orders")}
                                />
                            ))}
                        </div>
                    )}
                </DashboardPanel>

                <DashboardPanel
                    title="Проблемные серверы"
                    description="Ошибки подключения к 3X-UI"
                    icon={WifiOff}
                    action={<Button variant="ghost" size="sm" onClick={() => router.push("/servers")}>Серверы <ArrowRight /></Button>}
                >
                    {summary.problemServers.length === 0 ? (
                        <EmptyState icon={CheckCircle2}>Все серверы доступны.</EmptyState>
                    ) : (
                        <div className="divide-y divide-border">
                            {summary.problemServers.map((server) => (
                                <div key={server.id} className="px-5 py-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">{server.name}</div>
                                            <div className="mt-0.5 text-xs text-muted-foreground">{server.country}</div>
                                        </div>
                                        <Badge variant="destructive">Недоступен</Badge>
                                    </div>
                                    <div className="mt-2 text-xs text-[#b42318]">{server.error || "Сервер недоступен"}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </DashboardPanel>
            </div>

            <DashboardPanel
                title="Истекающие клиенты"
                description="Ближайшие окончания в течение 7 дней"
                icon={Clock3}
                className="mb-6"
            >
                {summary.expiringClients.length === 0 ? (
                    <EmptyState icon={CheckCircle2}>Нет клиентов, которые истекают в ближайшие 7 дней.</EmptyState>
                ) : (
                    <div className="divide-y divide-border">
                        {summary.expiringClients.slice(0, 8).map((client) => (
                            <ClientRow
                                key={`${client.server_id}-${client.email}`}
                                client={client}
                                tone="warning"
                                onOpen={openClient}
                            />
                        ))}
                    </div>
                )}
            </DashboardPanel>

            <section className="mb-6">
                <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="m-0 text-base font-semibold">Обзор серверов</h2>
                        <p className="mt-1 mb-0 text-sm text-muted-foreground">Клиенты, трафик и состояние каждого 3X-UI сервера</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => router.push("/servers")}>Управлять <ArrowRight /></Button>
                </div>

                {servers.length === 0 ? (
                    <Card><EmptyState icon={ServerIcon}>Серверы пока не добавлены.</EmptyState></Card>
                ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                        {servers.map((server) => (
                            <ServerOverviewCard
                                key={server.id}
                                server={server}
                                onOpenClients={() => router.push(`/clients?server=${server.id}`)}
                            />
                        ))}
                    </div>
                )}
            </section>

            <DashboardPanel
                title="Последние клиенты"
                description="Недавно созданные клиенты по всем доступным серверам"
                icon={Users}
            >
                {summary.recentClients.length === 0 ? (
                    <EmptyState icon={Users}>Пока нет данных о недавно созданных клиентах.</EmptyState>
                ) : (
                    <div className="divide-y divide-border">
                        {summary.recentClients.slice(0, 10).map((client) => (
                            <ClientRow
                                key={`${client.server_id}-${client.email}-${client.created}`}
                                client={client}
                                tone="neutral"
                                onOpen={openClient}
                            />
                        ))}
                    </div>
                )}
            </DashboardPanel>

        </AdminLayout>

    );

}

function ClientRow({
    client,
    tone,
    onOpen,
}) {

    return (
        <div className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{client.email || "Без имени"}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {client.server}
                    {client.group ? ` · ${client.group}` : ""}
                </div>
            </div>

            <Badge variant={tone === "warning" ? "warning" : "outline"}>
                {formatDaysLeft(client.days_left)}
            </Badge>

            <Button variant="ghost" size="sm" onClick={() => onOpen(client)}>
                Открыть <ArrowRight />
            </Button>
        </div>
    );

}

function ServerOverviewCard({
    server,
    onOpenClients,
}) {

    const isOffline = server.status === "offline";
    const trafficPercent = getTrafficPercent(server);

    return (
        <Card className="min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="min-w-0">
                    <h3 className="m-0 truncate text-base font-semibold">{server.name}</h3>
                    <div className="mt-1 text-xs text-muted-foreground">{server.country}</div>
                </div>

                <Badge variant={isOffline ? "destructive" : "success"}>
                    {isOffline ? "Недоступен" : "Доступен"}
                </Badge>
            </div>

            <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
                <Metric label="Клиентов" value={server.clients || 0} />
                <Metric label="Онлайн" value={server.online || 0} />
                <Metric label="Активных" value={server.enabled || 0} />
                <Metric label="Истекают" value={server.expiring_soon || 0} />
            </div>

            <div className="p-5">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span>Трафик</span>
                    <b>{formatBytes(server.traffic_used || 0)}</b>
                </div>

                {server.traffic_limit > 0 && (
                    <>
                        <div className="h-2 overflow-hidden rounded-md bg-secondary">
                            <div
                                className="h-full rounded-md bg-primary"
                                style={{ width: `${trafficPercent}%` }}
                            />
                        </div>

                        <div className="mt-1.5 text-xs text-muted-foreground">
                            Лимит: {formatBytes(server.traffic_limit)}
                        </div>
                    </>
                )}

                {server.error && <div className="mt-3 text-xs text-destructive">{server.error}</div>}

                <Button className="mt-4" variant="outline" onClick={onOpenClients}>
                    <Users />
                    Клиенты
                </Button>
            </div>
        </Card>
    );

}

function OrderAlertRow({
    order,
    actionLoading,
    onAction,
    onOpen,
}) {

    const hasActivationError = Boolean(order.activation_error);
    const tone = hasActivationError ? "danger" : "warning";

    return (
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{order.client_email || "Клиент"}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    Заказ #{order.id}
                    {order.plan_name ? ` · ${order.plan_name}` : ""}
                    {order.server_names ? ` · ${order.server_names}` : ""}
                </div>

                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatPrice(order.amount, order.currency)}
                    {order.customer_contact ? ` · ${order.customer_contact}` : ""}
                </div>

                {hasActivationError && (
                    <div className="mt-1.5 text-xs text-destructive">{order.activation_error}</div>
                )}
            </div>

            <Badge variant={tone === "danger" ? "destructive" : "warning"}>
                {hasActivationError ? "Ошибка" : "Оплата"}
            </Badge>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    size="sm"
                    onClick={onAction}
                    disabled={actionLoading}
                >
                    {actionLoading
                        ? "Обработка..."
                        : hasActivationError
                            ? "Повторить выдачу"
                            : "Подтвердить оплату"}
                </Button>

                <Button variant="ghost" size="sm" onClick={onOpen} title="Открыть заказ" aria-label="Открыть заказ">
                    <ArrowRight />
                </Button>
            </div>
        </div>
    );

}

function Metric({
    label,
    value,
}) {

    return (
        <div className="min-w-0 px-3 py-3 text-center">
            <div className="text-base font-semibold">{value}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</div>
        </div>
    );

}

function DashboardPanel({ title, description, icon: Icon, action, children, className = "" }) {
    return (
        <Card className={`min-w-0 overflow-hidden ${className}`}>
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="m-0 text-sm font-semibold">{title}</h2>
                        <p className="mt-1 mb-0 text-xs text-muted-foreground">{description}</p>
                    </div>
                </div>
                {action}
            </div>
            {children}
        </Card>
    );
}

function EmptyState({ icon: Icon, children }) {
    return (
        <div className="flex min-h-32 flex-col items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
            <Icon className="mb-2 size-5 text-[#98a2b3]" />
            {children}
        </div>
    );
}

function buildOrderSummary(orders) {

    const safeOrders = orders || [];
    const pending = safeOrders.filter((order) => order.status === "pending");
    const activationErrors = safeOrders.filter((order) =>
        order.status === "paid" && order.activation_error
    );
    const currency =
        pending[0]?.currency
        || safeOrders[0]?.currency
        || "RUB";
    const actionItems = [
        ...activationErrors,
        ...pending,
    ].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

    return {
        pending,
        activationErrors,
        actionItems,
        pendingAmount: pending.reduce(
            (sum, order) => sum + Number(order.amount || 0),
            0,
        ),
        currency,
    };

}

function buildSummary(servers) {

    const safeServers = servers || [];
    const problemServers = safeServers.filter((server) => server.status === "offline");
    const expiringClients = flattenClients(safeServers, "expiring_clients")
        .sort((a, b) => (a.expiry || 0) - (b.expiry || 0));
    const expiredClients = flattenClients(safeServers, "expired_clients")
        .sort((a, b) => (a.expiry || 0) - (b.expiry || 0));
    const recentClients = flattenClients(safeServers, "recent_clients")
        .sort((a, b) => (b.created || 0) - (a.created || 0));

    return {
        totalServers: safeServers.length,
        onlineServers: safeServers.filter((server) => server.status !== "offline").length,
        problemServers,
        totalClients: sumBy(safeServers, "clients"),
        onlineClients: sumBy(safeServers, "online"),
        enabledClients: sumBy(safeServers, "enabled"),
        disabledClients: sumBy(safeServers, "disabled"),
        expiringClients,
        expiredClients,
        recentClients,
    };

}

function flattenClients(servers, key) {

    return servers.flatMap((server) =>
        (server[key] || []).map((client) => ({
            ...client,
            server_id: client.server_id || server.id,
            server: client.server || server.name,
            country: client.country || server.country,
        }))
    );

}

function sumBy(items, key) {

    return items.reduce(
        (sum, item) => sum + Number(item[key] || 0),
        0,
    );

}

function getTrafficPercent(server) {

    const used = Number(server.traffic_used || 0);
    const limit = Number(server.traffic_limit || 0);

    if (limit <= 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.round((used / limit) * 100),
    );

}

function formatPrice(value, currency) {

    const amount = Number(value || 0);

    return `${amount.toLocaleString("ru-RU")} ${currency || "RUB"}`;

}

function formatBytes(value) {

    const bytes = Number(value || 0);

    if (bytes <= 0) {
        return "0 GB";
    }

    const gb = bytes / 1024 ** 3;

    if (gb < 1) {
        return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    }

    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;

}

function formatDaysLeft(daysLeft) {

    if (daysLeft === null || daysLeft === undefined) {
        return "Без срока";
    }

    if (daysLeft < 0) {
        return `${Math.abs(daysLeft)} дн. просрочено`;
    }

    if (daysLeft === 0) {
        return "Сегодня";
    }

    if (daysLeft === 1) {
        return "1 день";
    }

    return `${daysLeft} дн.`;

}

function getErrorMessage(error, fallback) {

    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") {
        return detail;
    }

    if (Array.isArray(detail)) {
        return detail
            .map((item) => item?.msg)
            .filter(Boolean)
            .join(". ");
    }

    return error?.message || fallback;

}

function getAuthConfig() {

    const token = localStorage.getItem("token");

    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };

}

const page = {
    display: "flex",
    background: "#f5f7fb",
    minHeight: "100vh",
    fontFamily: "Arial",
};

const main = {
    flex: 1,
};

const content = {
    padding: 30,
};

const loadingBox = {
    padding: 50,
    fontFamily: "Arial",
};

const loadingNotice = {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: 14,
};

const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 22,
};

const title = {
    margin: "0 0 8px",
};

const subtitle = {
    margin: 0,
    color: "#6b7280",
};

const headerActions = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
};

const statsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 20,
};

const alertGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    marginBottom: 20,
};

const panel = {
    marginBottom: 22,
};

const panelHeader = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
};

const panelTitle = {
    margin: "0 0 6px",
    fontSize: 20,
};

const panelSubtitle = {
    margin: 0,
    color: "#6b7280",
    fontSize: 14,
};

const list = {
    display: "grid",
    gap: 10,
};

const clientRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const dangerRow = {
    padding: 12,
    border: "1px solid #fecaca",
    borderRadius: 8,
    background: "#fff7f7",
};

const clientMain = {
    minWidth: 180,
    flex: 1,
};

const rowTitle = {
    color: "#111827",
    fontWeight: 700,
    overflowWrap: "anywhere",
};

const rowMeta = {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 13,
};

const rowError = {
    marginTop: 8,
    color: "#991b1b",
    fontSize: 13,
    overflowWrap: "anywhere",
};

const rowActions = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
};

const serverGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 16,
};

const serverCard = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 16,
    background: "#fff",
};

const serverCardHeader = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
};

const serverTitle = {
    margin: 0,
    fontSize: 18,
};

const serverMetrics = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 14,
};

const metricBox = {
    padding: 10,
    borderRadius: 8,
    background: "#f9fafb",
    textAlign: "center",
};

const metricValue = {
    color: "#111827",
    fontSize: 18,
    fontWeight: 700,
};

const metricLabel = {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
};

const trafficBlock = {
    marginBottom: 14,
};

const trafficHeader = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#374151",
    fontSize: 14,
    marginBottom: 8,
};

const progressTrack = {
    height: 8,
    overflow: "hidden",
    borderRadius: 999,
    background: "#e5e7eb",
};

const progressFill = {
    height: "100%",
    borderRadius: 999,
    background: "#2563eb",
};

const trafficLimit = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 12,
};

const statusBadge = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
};

const successBadge = {
    background: "#dcfce7",
    color: "#166534",
};

const warningBadge = {
    background: "#fef3c7",
    color: "#92400e",
};

const dangerBadge = {
    background: "#fee2e2",
    color: "#991b1b",
};

const neutralBadge = {
    background: "#f1f5f9",
    color: "#334155",
};

const primaryButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
};

const secondaryButton = {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    cursor: "pointer",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const smallButton = {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    cursor: "pointer",
    background: "#fff",
    color: "#111827",
    fontSize: 13,
};

const actionButton = {
    padding: "8px 12px",
    border: "none",
    borderRadius: 8,
    background: "#16a34a",
    color: "#fff",
    fontSize: 13,
    whiteSpace: "nowrap",
};

const linkButton = {
    padding: "8px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: 13,
    whiteSpace: "nowrap",
};

const emptyState = {
    padding: 14,
    borderRadius: 8,
    background: "#f9fafb",
    color: "#6b7280",
    fontSize: 14,
};

const errorBox = {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const successBox = {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: "#dcfce7",
    color: "#166534",
    fontSize: 14,
};
