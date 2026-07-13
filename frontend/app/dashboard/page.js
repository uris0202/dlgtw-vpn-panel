"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import StatCard from "../../components/StatCard";

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

        <div style={page}>

            <Sidebar />

            <div style={main}>

                <Header
                    user={user}
                    onLogout={logout}
                />

                <div style={content}>

                    <div style={pageHeader}>
                        <div>
                            <h1 style={title}>
                                Панель управления
                            </h1>

                            <p style={subtitle}>
                                Вы вошли как <b>{user?.email || "..."}</b>
                            </p>
                        </div>

                        <div style={headerActions}>
                            <button
                                onClick={() => router.push("/search")}
                                style={secondaryButton}
                            >
                                Поиск клиентов
                            </button>

                            <button
                                onClick={refreshDashboard}
                                disabled={refreshing || loading}
                                style={{
                                    ...primaryButton,
                                    cursor: refreshing || loading ? "not-allowed" : "pointer",
                                    opacity: refreshing || loading ? .7 : 1,
                                }}
                            >
                                {refreshing || loading ? "Обновление..." : "Обновить"}
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div style={loadingNotice}>
                            Загрузка статистики...
                        </div>
                    )}

                    {pageError && (
                        <div style={errorBox}>
                            {pageError}
                        </div>
                    )}

                    {actionNotice && (
                        <div style={successBox}>
                            {actionNotice}
                        </div>
                    )}

                    <div style={statsGrid}>
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

                    <div style={alertGrid}>
                        <section style={panel}>
                            <div style={panelHeader}>
                                <div>
                                    <h2 style={panelTitle}>
                                        Заказы требуют внимания
                                    </h2>

                                    <p style={panelSubtitle}>
                                        Ручные оплаты и ошибки автоматической выдачи.
                                    </p>
                                </div>

                                <button
                                    onClick={() => router.push("/orders")}
                                    style={linkButton}
                                >
                                    Заказы
                                </button>
                            </div>

                            {orderSummary.actionItems.length === 0 ? (
                                <div style={emptyState}>
                                    Нет заказов, требующих действий.
                                </div>
                            ) : (
                                <div style={list}>
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
                        </section>

                        <section style={panel}>
                            <div style={panelHeader}>
                                <div>
                                    <h2 style={panelTitle}>
                                        Проблемные серверы
                                    </h2>

                                    <p style={panelSubtitle}>
                                        Ошибки подключения к 3X-UI.
                                    </p>
                                </div>

                                <button
                                    onClick={() => router.push("/servers")}
                                    style={linkButton}
                                >
                                    Серверы
                                </button>
                            </div>

                            {summary.problemServers.length === 0 ? (
                                <div style={emptyState}>
                                    Все серверы доступны.
                                </div>
                            ) : (
                                <div style={list}>
                                    {summary.problemServers.map((server) => (
                                        <div
                                            key={server.id}
                                            style={dangerRow}
                                        >
                                            <div>
                                                <div style={rowTitle}>
                                                    {server.name}
                                                </div>

                                                <div style={rowMeta}>
                                                    {server.country}
                                                </div>

                                                <div style={rowError}>
                                                    {server.error || "Сервер недоступен"}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section style={panel}>
                            <div style={panelHeader}>
                                <div>
                                    <h2 style={panelTitle}>
                                        Истекающие клиенты
                                    </h2>

                                    <p style={panelSubtitle}>
                                        Ближайшие окончания в течение 7 дней.
                                    </p>
                                </div>
                            </div>

                            {summary.expiringClients.length === 0 ? (
                                <div style={emptyState}>
                                    Нет клиентов, которые истекают в ближайшие 7 дней.
                                </div>
                            ) : (
                                <div style={list}>
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
                        </section>
                    </div>

                    <section style={panel}>
                        <div style={panelHeader}>
                            <div>
                                <h2 style={panelTitle}>
                                    Обзор серверов
                                </h2>

                                <p style={panelSubtitle}>
                                    Клиенты, трафик и состояние каждого 3X-UI сервера.
                                </p>
                            </div>

                            <button
                                onClick={() => router.push("/servers")}
                                style={linkButton}
                            >
                                Управлять
                            </button>
                        </div>

                        {servers.length === 0 ? (
                            <div style={emptyState}>
                                Серверы пока не добавлены.
                            </div>
                        ) : (
                            <div style={serverGrid}>
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

                    <section style={panel}>
                        <div style={panelHeader}>
                            <div>
                                <h2 style={panelTitle}>
                                    Последние клиенты
                                </h2>

                                <p style={panelSubtitle}>
                                    Недавно созданные клиенты по всем доступным серверам.
                                </p>
                            </div>
                        </div>

                        {summary.recentClients.length === 0 ? (
                            <div style={emptyState}>
                                Пока нет данных о недавно созданных клиентах.
                            </div>
                        ) : (
                            <div style={list}>
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
                    </section>

                </div>

            </div>

        </div>

    );

}

function ClientRow({
    client,
    tone,
    onOpen,
}) {

    return (
        <div style={clientRow}>
            <div style={clientMain}>
                <div style={rowTitle}>
                    {client.email || "Без имени"}
                </div>

                <div style={rowMeta}>
                    {client.server}
                    {client.group ? ` · ${client.group}` : ""}
                </div>
            </div>

            <div
                style={{
                    ...statusBadge,
                    ...(tone === "warning" ? warningBadge : neutralBadge),
                }}
            >
                {formatDaysLeft(client.days_left)}
            </div>

            <button
                onClick={() => onOpen(client)}
                style={smallButton}
            >
                Открыть
            </button>
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
        <div style={serverCard}>
            <div style={serverCardHeader}>
                <div>
                    <h3 style={serverTitle}>
                        {server.name}
                    </h3>

                    <div style={rowMeta}>
                        {server.country}
                    </div>
                </div>

                <span
                    style={{
                        ...statusBadge,
                        ...(isOffline ? dangerBadge : successBadge),
                    }}
                >
                    {isOffline ? "Недоступен" : "Доступен"}
                </span>
            </div>

            <div style={serverMetrics}>
                <Metric label="Клиентов" value={server.clients || 0} />
                <Metric label="Онлайн" value={server.online || 0} />
                <Metric label="Активных" value={server.enabled || 0} />
                <Metric label="Истекают" value={server.expiring_soon || 0} />
            </div>

            <div style={trafficBlock}>
                <div style={trafficHeader}>
                    <span>Трафик</span>
                    <b>
                        {formatBytes(server.traffic_used || 0)}
                    </b>
                </div>

                {server.traffic_limit > 0 && (
                    <>
                        <div style={progressTrack}>
                            <div
                                style={{
                                    ...progressFill,
                                    width: `${trafficPercent}%`,
                                }}
                            />
                        </div>

                        <div style={trafficLimit}>
                            Лимит: {formatBytes(server.traffic_limit)}
                        </div>
                    </>
                )}
            </div>

            {server.error && (
                <div style={rowError}>
                    {server.error}
                </div>
            )}

            <button
                onClick={onOpenClients}
                style={secondaryButton}
            >
                Клиенты
            </button>
        </div>
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
        <div style={clientRow}>
            <div style={clientMain}>
                <div style={rowTitle}>
                    {order.client_email || "Клиент"}
                </div>

                <div style={rowMeta}>
                    Заказ #{order.id}
                    {order.plan_name ? ` · ${order.plan_name}` : ""}
                    {order.server_names ? ` · ${order.server_names}` : ""}
                </div>

                <div style={rowMeta}>
                    {formatPrice(order.amount, order.currency)}
                    {order.customer_contact ? ` · ${order.customer_contact}` : ""}
                </div>

                {hasActivationError && (
                    <div style={rowError}>
                        {order.activation_error}
                    </div>
                )}
            </div>

            <div
                style={{
                    ...statusBadge,
                    ...(tone === "danger" ? dangerBadge : warningBadge),
                }}
            >
                {hasActivationError ? "Ошибка" : "Оплата"}
            </div>

            <div style={rowActions}>
                <button
                    onClick={onAction}
                    disabled={actionLoading}
                    style={{
                        ...actionButton,
                        cursor: actionLoading ? "not-allowed" : "pointer",
                        opacity: actionLoading ? .7 : 1,
                    }}
                >
                    {actionLoading
                        ? "Обработка..."
                        : hasActivationError
                            ? "Повторить выдачу"
                            : "Подтвердить оплату"}
                </button>

                <button
                    onClick={onOpen}
                    style={smallButton}
                >
                    Открыть
                </button>
            </div>
        </div>
    );

}

function Metric({
    label,
    value,
}) {

    return (
        <div style={metricBox}>
            <div style={metricValue}>
                {value}
            </div>

            <div style={metricLabel}>
                {label}
            </div>
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
