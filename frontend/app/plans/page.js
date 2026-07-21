"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import PlanModal from "../../components/PlanModal";

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

            const response = await api.get(
                "/plans",
                getAuthConfig(),
            );

            setPlans(Array.isArray(response.data) ? response.data : []);

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось загрузить тарифы."));

        } finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        loadPlans();

    }, [router]);

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    async function refreshPlans() {

        setRefreshing(true);

        try {
            await loadPlans();
        } finally {
            setRefreshing(false);
        }

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

        if (saving) {
            return;
        }

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
                await api.patch(
                    `/plans/${selectedPlan.id}`,
                    payload,
                    getAuthConfig(),
                );
            } else {
                await api.post(
                    "/plans",
                    payload,
                    getAuthConfig(),
                );
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

        if (!confirm(`Удалить тариф "${plan.name}"?`)) {
            return;
        }

        setPageError("");

        try {

            await api.delete(
                `/plans/${plan.id}`,
                getAuthConfig(),
            );

            await loadPlans();

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось удалить тариф."));

        }

    }

    if (loading) {
        return (
            <div style={loadingBox}>
                Загрузка...
            </div>
        );
    }

    const activePlans = plans.filter((plan) => plan.is_active);
    const disabledPlans = plans.filter((plan) => !plan.is_active);

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
                                Тарифы
                            </h1>

                            <p style={subtitle}>
                                Планы продаж для новых VPN-клиентов.
                            </p>
                        </div>

                        <div style={headerActions}>
                            <button
                                onClick={refreshPlans}
                                disabled={refreshing}
                                style={secondaryButton}
                            >
                                {refreshing ? "Обновление..." : "Обновить"}
                            </button>

                            <button
                                onClick={openCreateModal}
                                style={primaryButton}
                            >
                                Новый тариф
                            </button>
                        </div>
                    </div>

                    {pageError && (
                        <div style={errorBox}>
                            {pageError}
                        </div>
                    )}

                    <div style={summaryGrid}>
                        <Summary label="Всего тарифов" value={plans.length} />
                        <Summary label="Активных" value={activePlans.length} />
                        <Summary label="Отключено" value={disabledPlans.length} />
                    </div>

                    {plans.length === 0 ? (
                        <div style={emptyState}>
                            Тарифы пока не добавлены.
                        </div>
                    ) : (
                        <div style={grid}>
                            {plans.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    onEdit={() => openEditModal(plan)}
                                    onDelete={() => deletePlan(plan)}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>

            <PlanModal
                open={modalOpen}
                mode={modalMode}
                plan={selectedPlan}
                error={modalError}
                saving={saving}
                onClose={closeModal}
                onSave={savePlan}
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

function PlanCard({
    plan,
    onEdit,
    onDelete,
}) {

    return (
        <div style={planCard}>
            <div style={planHeader}>
                <div>
                    <h2 style={planTitle}>
                        {plan.name}
                    </h2>

                    <div style={price}>
                        {formatPrice(plan.price, plan.currency)}
                    </div>
                </div>

                <span
                    style={{
                        ...badge,
                        ...(plan.is_active ? successBadge : dangerBadge),
                    }}
                >
                    {plan.is_active ? "Активен" : "Отключен"}
                </span>
            </div>

            {plan.description && (
                <p style={description}>
                    {plan.description}
                </p>
            )}

            <div style={metrics}>
                <Metric label="Срок" value={`${plan.duration_days} дн.`} />
                <Metric label="Трафик" value={plan.traffic_gb > 0 ? `${plan.traffic_gb} GB` : "Без лимита"} />
                <Metric label="Серверов" value={formatServerLimit(plan.server_limit)} />
            </div>

            <div style={actions}>
                <button
                    onClick={onEdit}
                    style={secondaryButton}
                >
                    Редактировать
                </button>

                <button
                    onClick={onDelete}
                    style={dangerButton}
                >
                    Удалить
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
        <div style={metricItem}>
            <div style={metricValue}>
                {value}
            </div>

            <div style={metricLabel}>
                {label}
            </div>
        </div>
    );

}

function formatPrice(price, currency) {

    const value = Number(price || 0);

    if (value === 0) {
        return "Бесплатно";
    }

    return `${value.toLocaleString("ru-RU")} ${currency || "RUB"}`;

}

function formatServerLimit(value) {

    const count = Number(value || 1);

    if (count === 1) {
        return "1 сервер";
    }

    return `${count} сервера`;

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
    fontSize: 26,
    fontWeight: 700,
    color: "#111827",
};

const summaryLabel = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 13,
};

const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
};

const planCard = {
    display: "grid",
    gap: 14,
    padding: 18,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const planHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
};

const planTitle = {
    margin: "0 0 6px",
    fontSize: 20,
};

const price = {
    color: "#111827",
    fontSize: 24,
    fontWeight: 700,
};

const description = {
    margin: 0,
    color: "#4b5563",
    fontSize: 14,
    lineHeight: 1.45,
};

const metrics = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
};

const metricItem = {
    padding: 10,
    borderRadius: 8,
    background: "#f9fafb",
};

const metricValue = {
    fontSize: 17,
    fontWeight: 700,
    color: "#111827",
};

const metricLabel = {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
};

const actions = {
    display: "flex",
    gap: 10,
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

const dangerBadge = {
    background: "#fee2e2",
    color: "#991b1b",
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

const secondaryButton = {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    cursor: "pointer",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const dangerButton = {
    padding: "10px 16px",
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
