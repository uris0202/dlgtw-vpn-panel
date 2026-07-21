"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Gauge, Pencil, Plus, RefreshCw, Server, Trash2, WalletCards } from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import PlanModal from "../../components/PlanModal";
import StatCard from "../../components/StatCard";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function PlansPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pageError, setPageError] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [modalError, setModalError] = useState("");
    const [saving, setSaving] = useState(false);

    async function loadPlans() {
        setPageError("");
        const me = await getMe();
        if (!me) {
            router.replace("/login");
            return;
        }
        setUser(me);
        try {
            const response = await api.get("/plans", getAuthConfig());
            setPlans(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            setPageError(getErrorMessage(error, "Не удалось загрузить тарифы."));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadPlans(); }, [router]);

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    async function refreshPlans() {
        setRefreshing(true);
        try { await loadPlans(); } finally { setRefreshing(false); }
    }

    function openCreateModal() {
        setModalMode("create");
        setSelectedPlan(null);
        setModalError("");
        setModalOpen(true);
    }

    function openEditModal(plan) {
        setModalMode("edit");
        setSelectedPlan(plan);
        setModalError("");
        setModalOpen(true);
    }

    function closeModal() {
        if (saving) return;
        setModalOpen(false);
        setSelectedPlan(null);
        setModalError("");
        setModalMode("create");
    }

    async function savePlan(payload) {
        setSaving(true);
        setModalError("");
        try {
            if (modalMode === "edit" && selectedPlan) {
                await api.patch(`/plans/${selectedPlan.id}`, payload, getAuthConfig());
            } else {
                await api.post("/plans", payload, getAuthConfig());
            }
            setModalOpen(false);
            setSelectedPlan(null);
            setModalMode("create");
            await loadPlans();
        } catch (error) {
            setModalError(getErrorMessage(error, "Не удалось сохранить тариф."));
        } finally {
            setSaving(false);
        }
    }

    async function deletePlan(plan) {
        if (!confirm(`Удалить тариф "${plan.name}"?`)) return;
        setPageError("");
        try {
            await api.delete(`/plans/${plan.id}`, getAuthConfig());
            await loadPlans();
        } catch (error) {
            setPageError(getErrorMessage(error, "Не удалось удалить тариф."));
        }
    }

    const activePlans = plans.filter((plan) => plan.is_active);
    const disabledPlans = plans.filter((plan) => !plan.is_active);

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Тарифы"
                description="Планы продаж, стоимость и доступное количество VPN-серверов"
                actions={
                    <>
                        <Button variant="outline" onClick={refreshPlans} disabled={refreshing || loading}>
                            <RefreshCw className={refreshing || loading ? "animate-spin" : ""} />
                            {refreshing ? "Обновление..." : "Обновить"}
                        </Button>
                        <Button onClick={openCreateModal}><Plus />Новый тариф</Button>
                    </>
                }
            />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка тарифов...</Alert>}
                {pageError && <Alert variant="error">{pageError}</Alert>}
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <StatCard title="Всего тарифов" value={plans.length} description="Все созданные предложения" icon={WalletCards} />
                <StatCard title="Активных" value={activePlans.length} description="Доступны для новых заказов" tone="success" />
                <StatCard title="Отключено" value={disabledPlans.length} description="Скрыты от клиентов" tone={disabledPlans.length > 0 ? "warning" : "neutral"} />
            </div>

            {!loading && plans.length === 0 ? (
                <Card className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                    <WalletCards className="size-8 text-muted-foreground" />
                    <div><div className="text-sm font-medium">Тарифы пока не добавлены</div><div className="mt-1 text-sm text-muted-foreground">Создайте первый тариф для оформления заказов.</div></div>
                    <Button onClick={openCreateModal}><Plus />Новый тариф</Button>
                </Card>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {plans.map((plan) => (
                        <PlanCard key={plan.id} plan={plan} onEdit={() => openEditModal(plan)} onDelete={() => deletePlan(plan)} />
                    ))}
                </div>
            )}

            <PlanModal open={modalOpen} mode={modalMode} plan={selectedPlan} error={modalError} saving={saving} onClose={closeModal} onSave={savePlan} />
        </AdminLayout>
    );
}

function PlanCard({ plan, onEdit, onDelete }) {
    return (
        <Card className="flex min-w-0 flex-col p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="m-0 truncate text-base font-semibold" title={plan.name}>{plan.name}</h2>
                    <div className="mt-2 text-2xl font-semibold text-primary">{formatPrice(plan.price, plan.currency)}</div>
                </div>
                <Badge variant={plan.is_active ? "success" : "destructive"}>{plan.is_active ? "Активен" : "Отключен"}</Badge>
            </div>

            <p className="mt-3 mb-0 min-h-10 text-sm leading-5 text-muted-foreground">
                {plan.description || "Описание тарифа не указано."}
            </p>

            <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-muted/30">
                <Metric icon={CalendarDays} label="Срок" value={`${plan.duration_days} дн.`} />
                <Metric icon={Gauge} label="Трафик" value={plan.traffic_gb > 0 ? `${plan.traffic_gb} GB` : "Без лимита"} />
                <Metric icon={Server} label="Серверы" value={formatServerLimit(plan.server_limit)} />
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={onEdit}><Pencil />Редактировать</Button>
                <Button variant="ghost" size="icon" onClick={onDelete} className="text-muted-foreground hover:text-destructive" title="Удалить тариф" aria-label="Удалить тариф"><Trash2 /></Button>
            </div>
        </Card>
    );
}

function Metric({ icon: Icon, label, value }) {
    return (
        <div className="min-w-0 px-3 py-3 text-center">
            <Icon className="mx-auto size-4 text-muted-foreground" />
            <div className="mt-1 truncate text-sm font-semibold" title={value}>{value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
        </div>
    );
}

function formatPrice(price, currency) {
    const value = Number(price || 0);
    return value === 0 ? "Бесплатно" : `${value.toLocaleString("ru-RU")} ${currency || "RUB"}`;
}

function formatServerLimit(value) {
    const count = Number(value || 1);
    return count === 1 ? "1 сервер" : `${count} сервера`;
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
