"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import OrderModal from "../../components/OrderModal";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function OrdersPage() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [orders, setOrders] = useState([]);
    const [plans, setPlans] = useState([]);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pageError, setPageError] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [modalError, setModalError] = useState("");
    const [saving, setSaving] = useState(false);
    const [actionOrderId, setActionOrderId] = useState(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [query, setQuery] = useState("");

    async function loadOrders() {

        setPageError("");

        const me = await getMe();

        if (!me) {
            router.replace("/login");
            return;
        }

        setUser(me);

        try {

            const authConfig = getAuthConfig();

            const [ordersResponse, plansResponse, serversResponse] = await Promise.all([
                api.get("/orders", authConfig),
                api.get("/plans", authConfig),
                api.get("/servers", authConfig),
            ]);

            setOrders(Array.isArray(ordersResponse.data) ? ordersResponse.data : []);
            setPlans(Array.isArray(plansResponse.data) ? plansResponse.data : []);
            setServers(Array.isArray(serversResponse.data) ? serversResponse.data : []);

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось загрузить заказы."));

        } finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        setQuery(new URLSearchParams(window.location.search).get("q") || "");
        loadOrders();

    }, [router]);

    const summary = useMemo(
        () => buildSummary(orders),
        [orders],
    );

    const filteredOrders = orders.filter((order) => {

        const statusMatches = statusFilter === "all" || order.status === statusFilter;
        const normalizedQuery = query.trim().toLowerCase();
        const queryMatches = !normalizedQuery || [
            order.client_email,
            order.customer_contact,
            order.account_login,
            order.server_names,
            order.plan_name,
        ].some((value) =>
            String(value || "").toLowerCase().includes(normalizedQuery)
        );

        return statusMatches && queryMatches;

    });

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    async function refreshOrders() {

        setRefreshing(true);

        try {
            await loadOrders();
        } finally {
            setRefreshing(false);
        }

    }

    function openCreateModal() {

        setModalMode("create");
        setSelectedOrder(null);
        setModalError("");
        setModalOpen(true);

    }

    function openEditModal(order) {

        setModalMode("edit");
        setSelectedOrder(order);
        setModalError("");
        setModalOpen(true);

    }

    function closeModal() {

        if (saving) {
            return;
        }

        setModalOpen(false);
        setSelectedOrder(null);
        setModalError("");
        setModalMode("create");

    }

    async function saveOrder(payload) {

        setSaving(true);
        setModalError("");

        try {

            if (modalMode === "edit" && selectedOrder) {
                await api.patch(
                    `/orders/${selectedOrder.id}`,
                    payload,
                    getAuthConfig(),
                );
            } else {
                await api.post(
                    "/orders",
                    payload,
                    getAuthConfig(),
                );
            }

            setModalOpen(false);
            setSelectedOrder(null);
            setModalMode("create");
            await loadOrders();

        } catch (error) {

            setModalError(getErrorMessage(error, "Не удалось сохранить заказ."));

        } finally {

            setSaving(false);

        }

    }

    async function updateOrderStatus(order, status) {

        if (
            status === "paid"
            && order.status !== "paid"
            && !confirm(`Подтвердить оплату заказа #${order.id} для "${order.client_email}"?`)
        ) {
            return;
        }

        setPageError("");
        setActionOrderId(order.id);

        try {

            await api.patch(
                `/orders/${order.id}`,
                {
                    status,
                },
                getAuthConfig(),
            );

            await loadOrders();

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось изменить статус заказа."));

        } finally {

            setActionOrderId(null);

        }

    }

    async function deleteOrder(order) {

        if (!confirm(`Удалить заказ клиента "${order.client_email}"?`)) {
            return;
        }

        setPageError("");

        try {

            await api.delete(
                `/orders/${order.id}`,
                getAuthConfig(),
            );

            await loadOrders();

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось удалить заказ."));

        }

    }

    if (loading) {
        return (
            <div style={loadingBox}>
                Загрузка...
            </div>
        );
    }

    return (
        <div style={page}>
            <Sidebar />

            <div style={main}>
                <Header
                    user={user}
                    onLogout={logout}
                />

                <main style={content}>
                    <div style={pageHeader}>
                        <div>
                            <h1 style={title}>
                                Заказы
                            </h1>

                            <p style={subtitle}>
                                Ручной учёт продаж, оплат и продлений VPN-клиентов.
                            </p>
                        </div>

                        <div style={headerActions}>
                            <button
                                onClick={refreshOrders}
                                disabled={refreshing}
                                style={secondaryButton}
                            >
                                {refreshing ? "Обновление..." : "Обновить"}
                            </button>

                            <button
                                onClick={openCreateModal}
                                style={primaryButton}
                            >
                                Новый заказ
                            </button>
                        </div>
                    </div>

                    {pageError && (
                        <div style={errorBox}>
                            {pageError}
                        </div>
                    )}

                    <div style={summaryGrid}>
                        <Summary label="Всего заказов" value={orders.length} />
                        <Summary label="Ожидают оплаты" value={summary.pending} />
                        <Summary label="Оплачено" value={summary.paid} />
                        <Summary label="Выручка" value={formatPrice(summary.revenue, summary.currency)} />
                    </div>

                    <div style={toolbar}>
                        <div style={filters}>
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Клиент, контакт, логин или сервер"
                                style={searchInput}
                            />

                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                                style={select}
                            >
                                <option value="all">Все статусы</option>
                                <option value="pending">Ожидает оплаты</option>
                                <option value="paid">Оплачен</option>
                                <option value="canceled">Отменён</option>
                                <option value="access">Доступ в ЛК</option>
                            </select>
                        </div>

                        <div style={resultCount}>
                            Показано: <b>{filteredOrders.length}</b>
                        </div>
                    </div>

                    {filteredOrders.length === 0 ? (
                        <div style={emptyState}>
                            Заказы не найдены.
                        </div>
                    ) : (
                        <div style={ordersList}>
                            {filteredOrders.map((order) => (
                                <OrderRow
                                    key={order.id}
                                    order={order}
                                    actionLoading={actionOrderId === order.id}
                                    onEdit={() => openEditModal(order)}
                                    onDelete={() => deleteOrder(order)}
                                    onMarkPaid={() => updateOrderStatus(order, "paid")}
                                    onRetryActivation={() => updateOrderStatus(order, "paid")}
                                    onCancel={() => updateOrderStatus(order, "canceled")}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>

            <OrderModal
                open={modalOpen}
                mode={modalMode}
                order={selectedOrder}
                plans={plans}
                servers={servers}
                error={modalError}
                saving={saving}
                onClose={closeModal}
                onSave={saveOrder}
            />
        </div>
    );

}

function Summary({
    label,
    value,
}) {

    return (
        <div style={summaryItem}>
            <div style={summaryValue}>
                {value}
            </div>

            <div style={summaryLabel}>
                {label}
            </div>
        </div>
    );

}

function OrderRow({
    order,
    actionLoading,
    onEdit,
    onDelete,
    onMarkPaid,
    onRetryActivation,
    onCancel,
}) {

    return (
        <div style={orderRow}>
            <div style={orderMain}>
                <div style={rowTop}>
                    <div>
                        <h2 style={clientTitle}>
                            {order.client_email}
                        </h2>

                        <div style={meta}>
                            {order.server_names || order.server_name || "Сервер не выбран"}
                            {" | "}
                            {order.plan_name || "Без тарифа"}
                        </div>

                        {order.customer_contact && (
                            <div style={meta}>
                                Контакт: <b>{order.customer_contact}</b>
                            </div>
                        )}

                        {order.account_token && (
                            <div style={meta}>
                                Кабинет:{" "}
                                <a
                                    href={`/account/${order.account_token}`}
                                    target="_blank"
                                    style={link}
                                >
                                    открыть
                                </a>
                            </div>
                        )}
                    </div>

                    <span
                        style={{
                            ...badge,
                            ...getStatusBadge(order.status),
                        }}
                    >
                        {getStatusLabel(order.status)}
                    </span>
                </div>

                <div style={detailsGrid}>
                    <Detail label="Сумма" value={formatPrice(order.amount, order.currency)} />
                    <Detail label="Срок" value={`${order.duration_days} дн.`} />
                    <Detail label="Трафик" value={order.traffic_gb > 0 ? `${order.traffic_gb} GB` : "Без лимита"} />
                    <Detail label="Оплата" value={formatDate(order.paid_at)} />
                    <Detail label="Доступ выдан" value={formatDate(order.activated_at)} />
                    <Detail label="Выдано серверов" value={formatActivationProgress(order)} />
                </div>

                {order.activation_error && (
                    <div style={activationError}>
                        {order.activation_error}
                    </div>
                )}

                {order.note && (
                    <div style={note}>
                        {order.note}
                    </div>
                )}
            </div>

            <div style={actions}>
                {order.status === "paid" && order.activation_error && (
                    <button
                        onClick={onRetryActivation}
                        disabled={actionLoading}
                        style={getActionStyle(successButton, actionLoading)}
                    >
                        {actionLoading ? "Обработка..." : "Повторить выдачу"}
                    </button>
                )}

                {order.status !== "paid" && order.status !== "access" && (
                    <button
                        onClick={onMarkPaid}
                        disabled={actionLoading}
                        style={getActionStyle(successButton, actionLoading)}
                    >
                        {actionLoading ? "Обработка..." : "Оплачен"}
                    </button>
                )}

                {order.status !== "canceled" && order.status !== "access" && (
                    <button
                        onClick={onCancel}
                        disabled={actionLoading}
                        style={getActionStyle(secondaryButton, actionLoading)}
                    >
                        Отменить
                    </button>
                )}

                <button
                    onClick={onEdit}
                    disabled={actionLoading}
                    style={getActionStyle(secondaryButton, actionLoading)}
                >
                    Редактировать
                </button>

                <button
                    onClick={onDelete}
                    disabled={actionLoading}
                    style={getActionStyle(dangerButton, actionLoading)}
                >
                    Удалить
                </button>
            </div>
        </div>
    );

}

function Detail({
    label,
    value,
}) {

    return (
        <div style={detail}>
            <div style={detailValue}>
                {value}
            </div>

            <div style={detailLabel}>
                {label}
            </div>
        </div>
    );

}

function buildSummary(orders) {

    const paidOrders = orders.filter((order) => order.status === "paid");
    const currency = paidOrders[0]?.currency || "RUB";

    return {
        pending: orders.filter((order) => order.status === "pending").length,
        paid: paidOrders.length,
        revenue: paidOrders.reduce(
            (sum, order) => sum + Number(order.amount || 0),
            0,
        ),
        currency,
    };

}

function getStatusLabel(status) {

    if (status === "paid") {
        return "Оплачен";
    }

    if (status === "canceled") {
        return "Отменён";
    }

    if (status === "access") {
        return "Доступ в ЛК";
    }

    return "Ожидает оплаты";

}

function getStatusBadge(status) {

    if (status === "paid") {
        return successBadge;
    }

    if (status === "canceled") {
        return dangerBadge;
    }

    if (status === "access") {
        return infoBadge;
    }

    return warningBadge;

}

function formatActivationProgress(order) {

    if (order.status === "access") {
        return "-";
    }

    const serverIds = Array.from(new Set([
        ...(Array.isArray(order.server_ids) ? order.server_ids : []),
        order.server_id,
    ].filter(Boolean).map(Number)));

    if (serverIds.length === 0) {
        return "-";
    }

    const activatedServerIds = Array.from(new Set(
        (Array.isArray(order.activated_server_ids)
            ? order.activated_server_ids
            : [])
            .filter(Boolean)
            .map(Number),
    ));
    const completed = order.activated_at && !order.activation_error
        ? serverIds.length
        : activatedServerIds.filter((serverId) => serverIds.includes(serverId)).length;

    return `${completed} из ${serverIds.length}`;

}

function getActionStyle(style, loading) {

    return {
        ...style,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? .65 : 1,
    };

}

function formatPrice(value, currency) {

    const amount = Number(value || 0);

    if (amount === 0) {
        return `0 ${currency || "RUB"}`;
    }

    return `${amount.toLocaleString("ru-RU")} ${currency || "RUB"}`;

}

function formatDate(value) {

    if (!value) {
        return "-";
    }

    return new Date(value).toLocaleDateString("ru-RU");

}

function getAuthConfig() {

    const token = localStorage.getItem("token");

    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };

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

const page = {
    display: "flex",
    minHeight: "100vh",
    background: "#f5f7fb",
    fontFamily: "Arial",
};

const main = {
    flex: 1,
};

const content = {
    padding: 30,
};

const loadingBox = {
    padding: 40,
    fontFamily: "Arial",
};

const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 20,
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

const summaryGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 20,
};

const summaryItem = {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const summaryValue = {
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
};

const summaryLabel = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 13,
};

const toolbar = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
};

const filters = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    flex: 1,
};

const searchInput = {
    width: "min(420px, 100%)",
    minWidth: 240,
    padding: 10,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const select = {
    minWidth: 220,
    padding: 10,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const resultCount = {
    color: "#6b7280",
    fontSize: 14,
};

const ordersList = {
    display: "grid",
    gap: 12,
};

const orderRow = {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const orderMain = {
    minWidth: 320,
    flex: 1,
};

const rowTop = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
};

const clientTitle = {
    margin: "0 0 6px",
    fontSize: 18,
    overflowWrap: "anywhere",
};

const meta = {
    color: "#6b7280",
    fontSize: 14,
};

const link = {
    color: "#2563eb",
    fontWeight: 700,
    textDecoration: "none",
};

const detailsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
};

const detail = {
    padding: 10,
    borderRadius: 8,
    background: "#f9fafb",
};

const detailValue = {
    color: "#111827",
    fontWeight: 700,
};

const detailLabel = {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
};

const note = {
    marginTop: 10,
    color: "#374151",
    fontSize: 14,
};

const activationError = {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 13,
    overflowWrap: "anywhere",
};

const actions = {
    display: "flex",
    alignContent: "flex-start",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
};

const badge = {
    display: "inline-flex",
    padding: "5px 9px",
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

const infoBadge = {
    background: "#dbeafe",
    color: "#1e40af",
};

const primaryButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
};

const successButton = {
    padding: "10px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#16a34a",
    color: "#fff",
    fontSize: 14,
};

const secondaryButton = {
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    cursor: "pointer",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const dangerButton = {
    padding: "10px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#ef4444",
    color: "#fff",
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

const emptyState = {
    padding: 18,
    borderRadius: 8,
    background: "#fff",
    color: "#6b7280",
};
