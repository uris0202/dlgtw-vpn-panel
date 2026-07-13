"use client";

import { useEffect, useState } from "react";

export default function OrderModal({
    open,
    mode = "create",
    order = null,
    plans = [],
    servers = [],
    error,
    saving,
    onClose,
    onSave,
}) {

    const isEdit = mode === "edit";

    const [clientEmail, setClientEmail] = useState("");
    const [customerContact, setCustomerContact] = useState("");
    const [selectedServerIds, setSelectedServerIds] = useState([]);
    const [planId, setPlanId] = useState("");
    const [durationDays, setDurationDays] = useState("30");
    const [trafficGb, setTrafficGb] = useState("0");
    const [amount, setAmount] = useState("0");
    const [currency, setCurrency] = useState("RUB");
    const [status, setStatus] = useState("pending");
    const [note, setNote] = useState("");
    const [formError, setFormError] = useState("");

    useEffect(() => {

        if (!open) {
            return;
        }

        if (isEdit && order) {
            setClientEmail(order.client_email || "");
            setCustomerContact(order.customer_contact || "");
            setSelectedServerIds(getOrderServerIds(order));
            setPlanId(order.plan_id ? String(order.plan_id) : "");
            setDurationDays(String(order.duration_days ?? 30));
            setTrafficGb(String(order.traffic_gb ?? 0));
            setAmount(String(order.amount ?? 0));
            setCurrency(order.currency || "RUB");
            setStatus(order.status || "pending");
            setNote(order.note || "");
            setFormError("");
            return;
        }

        const firstPlan = plans[0];

        setClientEmail("");
        setCustomerContact("");
        setSelectedServerIds([]);
        setPlanId(firstPlan ? String(firstPlan.id) : "");
        setDurationDays(String(firstPlan?.duration_days ?? 30));
        setTrafficGb(String(firstPlan?.traffic_gb ?? 0));
        setAmount(String(firstPlan?.price ?? 0));
        setCurrency(firstPlan?.currency || "RUB");
        setStatus("pending");
        setNote("");
        setFormError("");

    }, [open, isEdit, order, plans]);

    if (!open) {
        return null;
    }

    const selectedPlan = plans.find((item) => String(item.id) === String(planId));
    const isAccessStatus = status === "access";
    const selectedPlanServerLimit = selectedPlan
        ? Number(selectedPlan.server_limit || 1)
        : null;

    function selectPlan(value) {

        setPlanId(value);

        const plan = plans.find((item) => String(item.id) === String(value));

        if (!plan) {
            return;
        }

        setDurationDays(String(plan.duration_days ?? 30));
        setTrafficGb(String(plan.traffic_gb ?? 0));
        setAmount(String(plan.price ?? 0));
        setCurrency(plan.currency || "RUB");
        setSelectedServerIds((current) =>
            limitServerSelection(
                current,
                Number(plan.server_limit || 1),
            )
        );

    }

    function toggleServer(serverId) {

        const normalizedServerId = Number(serverId);

        setSelectedServerIds((current) => {

            if (current.includes(normalizedServerId)) {
                return current.filter((item) => item !== normalizedServerId);
            }

            if (selectedPlanServerLimit && current.length >= selectedPlanServerLimit) {
                if (selectedPlanServerLimit === 1) {
                    return [normalizedServerId];
                }

                return current;
            }

            return [...current, normalizedServerId];

        });

    }

    function changeStatus(value) {

        setStatus(value);

        if (value === "access") {
            setPlanId("");
            setDurationDays("0");
            setTrafficGb("0");
            setAmount("0");
            setCurrency("RUB");
            setFormError("");
            setNote((current) =>
                current || "Доступ в ЛК для существующего клиента."
            );
            return;
        }

        if (!planId && plans[0]) {
            selectPlan(plans[0].id);
        }

    }

    function submit(event) {

        event.preventDefault();
        setFormError("");

        const selectedPlan = plans.find((item) => String(item.id) === String(planId));

        if (status !== "access" && !selectedPlan) {
            setFormError("Выберите тариф для заказа.");
            return;
        }

        if (
            status !== "access"
            && selectedPlanServerLimit
            && selectedServerIds.length !== selectedPlanServerLimit
        ) {
            setFormError(`По выбранному тарифу нужно выбрать серверов: ${selectedPlanServerLimit}.`);
            return;
        }

        onSave({
            client_email: clientEmail.trim(),
            customer_contact: customerContact.trim(),
            server_id: selectedServerIds[0] || null,
            server_ids: selectedPlanServerLimit
                ? selectedServerIds.slice(0, selectedPlanServerLimit)
                : selectedServerIds,
            plan_id: planId ? Number(planId) : null,
            plan_name: selectedPlan?.name || order?.plan_name || "",
            duration_days: Number(durationDays),
            traffic_gb: Number(trafficGb),
            amount: Number(amount),
            currency: currency.trim().toUpperCase(),
            status,
            note: note.trim(),
        });

    }

    return (
        <div style={overlay}>
            <form
                onSubmit={submit}
                style={modal}
            >
                <h2 style={title}>
                    {isEdit ? "Редактирование заказа" : "Новый заказ"}
                </h2>

                <label style={label}>Клиент</label>
                <input
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                    placeholder="Имя клиента / псевдоним"
                    required
                    disabled={saving}
                    style={input}
                />

                <label style={label}>Контакт клиента</label>
                <input
                    value={customerContact}
                    onChange={(event) => setCustomerContact(event.target.value)}
                    placeholder="Telegram или телефон"
                    disabled={saving}
                    style={input}
                />

                <label style={field}>
                    <span style={label}>Тариф</span>
                    <select
                        value={planId}
                        onChange={(event) => selectPlan(event.target.value)}
                        disabled={saving || isAccessStatus}
                        required={!isAccessStatus}
                        style={input}
                    >
                        {isAccessStatus ? (
                            <option value="">Тариф не нужен для доступа в ЛК</option>
                        ) : (
                            <option value="" disabled>Выберите тариф</option>
                        )}
                        {plans.map((plan) => (
                            <option
                                key={plan.id}
                                value={plan.id}
                            >
                                {plan.name} · {formatServerLimit(plan.server_limit)} · {formatPrice(plan.price, plan.currency)}
                            </option>
                        ))}
                    </select>
                </label>

                <label style={label}>VPN-серверы</label>
                <div style={serverBox}>
                    {servers.length === 0 && (
                        <div style={emptyText}>
                            Серверы пока не добавлены.
                        </div>
                    )}

                    {servers.map((server) => (
                        <label
                            key={server.id}
                            style={checkboxRow}
                        >
                            <input
                                type="checkbox"
                                checked={selectedServerIds.includes(Number(server.id))}
                                onChange={() => toggleServer(server.id)}
                                disabled={
                                    saving
                                    || (!selectedPlan && !isAccessStatus)
                                    || isServerDisabled(
                                        Number(server.id),
                                        selectedServerIds,
                                        selectedPlanServerLimit,
                                    )
                                }
                            />

                            {server.name}
                        </label>
                    ))}
                </div>

                {selectedPlanServerLimit && (
                    <div style={hint}>
                        По выбранному тарифу можно выбрать серверов: {selectedPlanServerLimit}.
                    </div>
                )}

                {!selectedPlan && !isAccessStatus && (
                    <div style={hint}>
                        Сначала выберите тариф.
                    </div>
                )}

                <div style={grid}>
                    <label style={field}>
                        <span style={label}>Срок, дней</span>
                        <input
                            type="number"
                            min="0"
                            value={durationDays}
                            onChange={(event) => setDurationDays(event.target.value)}
                            required
                            disabled={saving || Boolean(planId) || isAccessStatus}
                            style={input}
                        />
                    </label>

                    <label style={field}>
                        <span style={label}>Трафик, GB</span>
                        <input
                            type="number"
                            min="0"
                            value={trafficGb}
                            onChange={(event) => setTrafficGb(event.target.value)}
                            required
                            disabled={saving || Boolean(planId) || isAccessStatus}
                            style={input}
                        />
                    </label>
                </div>

                <div style={grid}>
                    <label style={field}>
                        <span style={label}>Сумма</span>
                        <input
                            type="number"
                            min="0"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            required
                            disabled={saving || Boolean(planId) || isAccessStatus}
                            style={input}
                        />
                    </label>

                    <label style={field}>
                        <span style={label}>Валюта</span>
                        <select
                            value={currency}
                            onChange={(event) => setCurrency(event.target.value)}
                            disabled={saving || Boolean(planId) || isAccessStatus}
                            style={input}
                        >
                            <option value="RUB">RUB</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="KZT">KZT</option>
                        </select>
                    </label>
                </div>

                <label style={label}>Статус</label>
                <select
                    value={status}
                    onChange={(event) => changeStatus(event.target.value)}
                    disabled={saving}
                    style={input}
                >
                    <option value="pending">Ожидает оплаты</option>
                    <option value="paid">Оплачен</option>
                    <option value="canceled">Отменён</option>
                    <option value="access">Доступ в ЛК</option>
                </select>

                <label style={label}>Комментарий</label>
                <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={saving}
                    rows={3}
                    style={textarea}
                />

                {(error || formError) && (
                    <div style={errorBox}>
                        {error || formError}
                    </div>
                )}

                <div style={actions}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={secondaryButton}
                    >
                        Отмена
                    </button>

                    <button
                        type="submit"
                        disabled={saving}
                        style={primaryButton}
                    >
                        {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            </form>
        </div>
    );

}

function formatPrice(price, currency) {

    const value = Number(price || 0);

    if (value === 0) {
        return "бесплатно";
    }

    return `${value.toLocaleString("ru-RU")} ${currency || "RUB"}`;

}

function getOrderServerIds(order) {

    if (Array.isArray(order.server_ids) && order.server_ids.length > 0) {
        return order.server_ids.map(Number);
    }

    if (order.server_id) {
        return [Number(order.server_id)];
    }

    return [];

}

function formatServerLimit(value) {

    const count = Number(value || 1);

    if (count === 1) {
        return "1 сервер";
    }

    return `${count} сервера`;

}

function limitServerSelection(current, limit) {

    return current.slice(0, Math.max(1, limit));

}

function isServerDisabled(serverId, selectedServerIds, selectedPlanServerLimit) {

    if (!selectedPlanServerLimit) {
        return false;
    }

    if (selectedPlanServerLimit === 1) {
        return false;
    }

    return (
        selectedServerIds.length >= selectedPlanServerLimit
        && !selectedServerIds.includes(serverId)
    );

}

const overlay = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    background: "rgba(0,0,0,.45)",
};

const modal = {
    width: "100%",
    maxWidth: 620,
    padding: 24,
    borderRadius: 10,
    background: "#fff",
    boxShadow: "0 10px 35px rgba(0,0,0,.25)",
};

const title = {
    marginTop: 0,
    marginBottom: 20,
};

const label = {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 700,
};

const field = {
    display: "block",
};

const input = {
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 15,
    padding: 10,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const textarea = {
    ...input,
    resize: "vertical",
    minHeight: 82,
};

const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
};

const serverBox = {
    display: "grid",
    gap: 8,
    marginBottom: 10,
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#f9fafb",
};

const checkboxRow = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
};

const emptyText = {
    color: "#6b7280",
    fontSize: 13,
};

const hint = {
    marginBottom: 15,
    color: "#6b7280",
    fontSize: 13,
};

const errorBox = {
    marginTop: 18,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const actions = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 24,
};

const primaryButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 7,
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
};

const secondaryButton = {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
};
