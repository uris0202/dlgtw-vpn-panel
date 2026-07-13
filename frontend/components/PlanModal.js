"use client";

import { useEffect, useState } from "react";

export default function PlanModal({
    open,
    mode = "create",
    plan = null,
    error,
    saving,
    onClose,
    onSave,
}) {

    const isEdit = mode === "edit";

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [durationDays, setDurationDays] = useState("30");
    const [trafficGb, setTrafficGb] = useState("0");
    const [serverLimit, setServerLimit] = useState("1");
    const [price, setPrice] = useState("0");
    const [currency, setCurrency] = useState("RUB");
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {

        if (!open) {
            return;
        }

        if (isEdit && plan) {
            setName(plan.name || "");
            setDescription(plan.description || "");
            setDurationDays(String(plan.duration_days ?? 30));
            setTrafficGb(String(plan.traffic_gb ?? 0));
            setServerLimit(String(plan.server_limit ?? 1));
            setPrice(String(plan.price ?? 0));
            setCurrency(plan.currency || "RUB");
            setIsActive(Boolean(plan.is_active));
            return;
        }

        setName("");
        setDescription("");
        setDurationDays("30");
        setTrafficGb("0");
        setServerLimit("1");
        setPrice("0");
        setCurrency("RUB");
        setIsActive(true);

    }, [open, isEdit, plan]);

    if (!open) {
        return null;
    }

    function submit(event) {

        event.preventDefault();

        onSave({
            name: name.trim(),
            description: description.trim(),
            duration_days: Number(durationDays),
            traffic_gb: Number(trafficGb),
            server_limit: Number(serverLimit),
            price: Number(price),
            currency: currency.trim().toUpperCase(),
            is_active: isActive,
        });

    }

    return (
        <div style={overlay}>
            <form
                onSubmit={submit}
                style={modal}
            >
                <h2 style={title}>
                    {isEdit ? "Редактирование тарифа" : "Новый тариф"}
                </h2>

                <label style={label}>Название</label>
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    disabled={saving}
                    style={input}
                />

                <label style={label}>Описание</label>
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={saving}
                    rows={3}
                    style={textarea}
                />

                <div style={grid}>
                    <label style={field}>
                        <span style={label}>Срок, дней</span>
                        <input
                            type="number"
                            min="0"
                            value={durationDays}
                            onChange={(event) => setDurationDays(event.target.value)}
                            required
                            disabled={saving}
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
                            disabled={saving}
                            style={input}
                        />
                    </label>
                </div>

                <label style={label}>Количество VPN-серверов</label>
                <input
                    type="number"
                    min="1"
                    value={serverLimit}
                    onChange={(event) => setServerLimit(event.target.value)}
                    required
                    disabled={saving}
                    style={input}
                />

                <div style={grid}>
                    <label style={field}>
                        <span style={label}>Цена</span>
                        <input
                            type="number"
                            min="0"
                            value={price}
                            onChange={(event) => setPrice(event.target.value)}
                            required
                            disabled={saving}
                            style={input}
                        />
                    </label>

                    <label style={field}>
                        <span style={label}>Валюта</span>
                        <select
                            value={currency}
                            onChange={(event) => setCurrency(event.target.value)}
                            disabled={saving}
                            style={input}
                        >
                            <option value="RUB">RUB</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="KZT">KZT</option>
                        </select>
                    </label>
                </div>

                <label style={checkboxRow}>
                    <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(event) => setIsActive(event.target.checked)}
                        disabled={saving}
                    />
                    Активен для продажи
                </label>

                {error && (
                    <div style={errorBox}>
                        {error}
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
    maxWidth: 560,
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
    fontSize: 14,
    background: "#fff",
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

const checkboxRow = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    fontSize: 14,
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
