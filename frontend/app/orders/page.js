"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Check,
    CircleDollarSign,
    Clock3,
    ExternalLink,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    ShoppingCart,
    Trash2,
    XCircle,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import OrderModal from "../../components/OrderModal";
import PageHeading from "../../components/PageHeading";
import StatCard from "../../components/StatCard";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";

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

    const summary = useMemo(() => buildSummary(orders), [orders]);
    const filteredOrders = orders.filter((order) => {
        const statusMatches = statusFilter === "all" || order.status === statusFilter;
        const normalizedQuery = query.trim().toLowerCase();
        const queryMatches = !normalizedQuery || [
            order.client_email,
            order.customer_contact,
            order.account_login,
            order.server_names,
            order.plan_name,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
        return statusMatches && queryMatches;
    });

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    async function refreshOrders() {
        setRefreshing(true);
        try { await loadOrders(); } finally { setRefreshing(false); }
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
        if (saving) return;
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
                await api.patch(`/orders/${selectedOrder.id}`, payload, getAuthConfig());
            } else {
                await api.post("/orders", payload, getAuthConfig());
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
        if (status === "paid" && order.status !== "paid" && !confirm(`Подтвердить оплату заказа #${order.id} для "${order.client_email}"?`)) return;
        setPageError("");
        setActionOrderId(order.id);
        try {
            await api.patch(`/orders/${order.id}`, { status }, getAuthConfig());
            await loadOrders();
        } catch (error) {
            setPageError(getErrorMessage(error, "Не удалось изменить статус заказа."));
        } finally {
            setActionOrderId(null);
        }
    }

    async function deleteOrder(order) {
        if (!confirm(`Удалить заказ клиента "${order.client_email}"?`)) return;
        setPageError("");
        try {
            await api.delete(`/orders/${order.id}`, getAuthConfig());
            await loadOrders();
        } catch (error) {
            setPageError(getErrorMessage(error, "Не удалось удалить заказ."));
        }
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Заказы"
                description="Продажи, ручные оплаты и автоматическая выдача VPN-доступа"
                actions={
                    <>
                        <Button variant="outline" onClick={refreshOrders} disabled={refreshing || loading}>
                            <RefreshCw className={refreshing || loading ? "animate-spin" : ""} />
                            {refreshing ? "Обновление..." : "Обновить"}
                        </Button>
                        <Button onClick={openCreateModal}><Plus />Новый заказ</Button>
                    </>
                }
            />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка заказов...</Alert>}
                {pageError && <Alert variant="error">{pageError}</Alert>}
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Всего заказов" value={orders.length} description="За всё время" icon={ShoppingCart} />
                <StatCard title="Ожидают оплаты" value={summary.pending} description="Требуют подтверждения" tone={summary.pending > 0 ? "warning" : "neutral"} icon={Clock3} />
                <StatCard title="Оплачено" value={summary.paid} description="Доступ выдан или выдаётся" tone="success" />
                <StatCard title="Выручка" value={formatPrice(summary.revenue, summary.currency)} description="По оплаченным заказам" icon={CircleDollarSign} />
            </div>

            <Card className="mb-4 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_auto] lg:items-center">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Клиент, контакт, логин или сервер" className="pl-9" aria-label="Поиск заказов" />
                    </label>
                    <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Статус заказа">
                        <option value="all">Все статусы</option>
                        <option value="pending">Ожидает оплаты</option>
                        <option value="paid">Оплачен</option>
                        <option value="canceled">Отменён</option>
                        <option value="access">Доступ в ЛК</option>
                    </Select>
                    <div className="text-xs text-muted-foreground lg:text-right">Показано {filteredOrders.length} из {orders.length}</div>
                </div>
            </Card>

            {!loading && filteredOrders.length === 0 ? (
                <Card className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
                    <ShoppingCart className="size-8 text-muted-foreground" />
                    <div className="text-sm font-medium">Заказы не найдены</div>
                    <div className="text-sm text-muted-foreground">Измените поиск или создайте новый заказ.</div>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="divide-y divide-border">
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
                </Card>
            )}

            <OrderModal open={modalOpen} mode={modalMode} order={selectedOrder} plans={plans} servers={servers} error={modalError} saving={saving} onClose={closeModal} onSave={saveOrder} />
        </AdminLayout>
    );
}

function OrderRow({ order, actionLoading, onEdit, onDelete, onMarkPaid, onRetryActivation, onCancel }) {
    return (
        <article className="grid gap-4 px-4 py-5 sm:px-5 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="m-0 break-words text-base font-semibold">{order.client_email}</h2>
                            <span className="text-xs text-muted-foreground">#{order.id}</span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                            {order.server_names || order.server_name || "Сервер не выбран"} · {order.plan_name || "Без тарифа"}
                        </div>
                        {order.customer_contact && <div className="mt-1 text-xs text-muted-foreground">Контакт: <span className="font-medium text-foreground">{order.customer_contact}</span></div>}
                    </div>
                    <Badge variant={getStatusVariant(order.status)}>{getStatusLabel(order.status)}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
                    <Detail label="Сумма" value={formatPrice(order.amount, order.currency)} />
                    <Detail label="Срок" value={`${order.duration_days} дн.`} />
                    <Detail label="Трафик" value={order.traffic_gb > 0 ? `${order.traffic_gb} GB` : "Без лимита"} />
                    <Detail label="Оплата" value={formatDate(order.paid_at)} />
                    <Detail label="Доступ выдан" value={formatDate(order.activated_at)} />
                    <Detail label="Серверы" value={formatActivationProgress(order)} />
                </div>

                {order.account_token && (
                    <a href={`/account/${order.account_token}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                        Открыть личный кабинет <ExternalLink className="size-3.5" />
                    </a>
                )}
                {order.activation_error && <Alert variant="error" className="mt-3">{order.activation_error}</Alert>}
                {order.note && <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{order.note}</div>}
            </div>

            <div className="flex flex-wrap items-start gap-2 xl:max-w-64 xl:justify-end">
                {order.status === "paid" && order.activation_error && (
                    <Button size="sm" onClick={onRetryActivation} disabled={actionLoading}><RotateCcw className={actionLoading ? "animate-spin" : ""} />{actionLoading ? "Обработка..." : "Повторить выдачу"}</Button>
                )}
                {order.status !== "paid" && order.status !== "access" && (
                    <Button size="sm" onClick={onMarkPaid} disabled={actionLoading}><Check />{actionLoading ? "Обработка..." : "Оплачен"}</Button>
                )}
                {order.status !== "canceled" && order.status !== "access" && (
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={actionLoading}><XCircle />Отменить</Button>
                )}
                <Button variant="outline" size="sm" onClick={onEdit} disabled={actionLoading}><Pencil />Изменить</Button>
                <Button variant="ghost" size="icon" onClick={onDelete} disabled={actionLoading} className="text-muted-foreground hover:text-destructive" title="Удалить заказ" aria-label="Удалить заказ"><Trash2 /></Button>
            </div>
        </article>
    );
}

function Detail({ label, value }) {
    return <div className="min-w-0"><div className="truncate text-sm font-semibold" title={String(value)}>{value}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div></div>;
}

function buildSummary(orders) {
    const paidOrders = orders.filter((order) => order.status === "paid");
    return {
        pending: orders.filter((order) => order.status === "pending").length,
        paid: paidOrders.length,
        revenue: paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
        currency: paidOrders[0]?.currency || "RUB",
    };
}

function getStatusLabel(status) {
    if (status === "paid") return "Оплачен";
    if (status === "canceled") return "Отменён";
    if (status === "access") return "Доступ в ЛК";
    return "Ожидает оплаты";
}

function getStatusVariant(status) {
    if (status === "paid") return "success";
    if (status === "canceled") return "destructive";
    if (status === "access") return "default";
    return "warning";
}

function formatActivationProgress(order) {
    if (order.status === "access") return "-";
    const serverIds = Array.from(new Set([...(Array.isArray(order.server_ids) ? order.server_ids : []), order.server_id].filter(Boolean).map(Number)));
    if (serverIds.length === 0) return "-";
    const activatedServerIds = Array.from(new Set((Array.isArray(order.activated_server_ids) ? order.activated_server_ids : []).filter(Boolean).map(Number)));
    const completed = order.activated_at && !order.activation_error ? serverIds.length : activatedServerIds.filter((serverId) => serverIds.includes(serverId)).length;
    return `${completed} из ${serverIds.length}`;
}

function formatPrice(value, currency) {
    return `${Number(value || 0).toLocaleString("ru-RU")} ${currency || "RUB"}`;
}

function formatDate(value) {
    return value ? new Date(value).toLocaleDateString("ru-RU") : "-";
}

function getAuthConfig() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.response?.data?.message || error?.message || fallback;
}
