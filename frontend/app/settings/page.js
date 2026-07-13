"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function SettingsPage() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [form, setForm] = useState(getEmptyForm());

    useEffect(() => {

        loadSettings();

    }, []);

    async function loadSettings() {

        setError("");

        try {

            const me = await getMe();

            if (!me) {
                router.replace("/login");
                return;
            }

            setUser(me);

            const response = await api.get(
                "/settings",
                getAuthConfig(),
            );

            setForm(settingsToForm(response.data));

        } catch (error) {

            setError(getErrorMessage(error, "Не удалось загрузить настройки."));

        } finally {

            setLoading(false);

        }

    }

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    function updateField(field, value) {

        setSuccess("");

        setForm((current) => ({
            ...current,
            [field]: value,
        }));

    }

    async function saveSettings(event) {

        event.preventDefault();

        setSaving(true);
        setError("");
        setSuccess("");

        try {

            const response = await api.patch(
                "/settings",
                {
                    panel_name: form.panel_name.trim(),
                    default_client_days: Number(form.default_client_days),
                    default_traffic_gb: Number(form.default_traffic_gb),
                    default_inbound_id: Number(form.default_inbound_id),
                    subscription_port: Number(form.subscription_port),
                    subscription_path: form.subscription_path.trim(),
                    support_contact: form.support_contact.trim(),
                    payment_phone: form.payment_phone.trim(),
                    payment_recipient: form.payment_recipient.trim(),
                    payment_instructions: form.payment_instructions.trim(),
                },
                getAuthConfig(),
            );

            setForm(settingsToForm(response.data));
            setSuccess("Настройки сохранены.");

        } catch (error) {

            setError(getErrorMessage(error, "Не удалось сохранить настройки."));

        } finally {

            setSaving(false);

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
                                Настройки
                            </h1>

                            <p style={subtitle}>
                                Базовые параметры панели, новых клиентов и subscription ссылок.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div style={errorBox}>
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={successBox}>
                            {success}
                        </div>
                    )}

                    <form
                        onSubmit={saveSettings}
                        style={formLayout}
                    >
                        <section style={section}>
                            <h2 style={sectionTitle}>
                                Панель
                            </h2>

                            <div style={fieldGrid}>
                                <Field
                                    label="Название панели"
                                    value={form.panel_name}
                                    onChange={(value) => updateField("panel_name", value)}
                                    disabled={saving}
                                />

                                <Field
                                    label="Контакт поддержки"
                                    value={form.support_contact}
                                    onChange={(value) => updateField("support_contact", value)}
                                    disabled={saving}
                                    placeholder="@support или email"
                                    required={false}
                                />
                            </div>
                        </section>

                        <section style={section}>
                            <h2 style={sectionTitle}>
                                Новые клиенты
                            </h2>

                            <div style={fieldGrid}>
                                <Field
                                    label="Срок по умолчанию, дней"
                                    type="number"
                                    min="0"
                                    value={form.default_client_days}
                                    onChange={(value) => updateField("default_client_days", value)}
                                    disabled={saving}
                                />

                                <Field
                                    label="Лимит трафика по умолчанию, GB"
                                    type="number"
                                    min="0"
                                    value={form.default_traffic_gb}
                                    onChange={(value) => updateField("default_traffic_gb", value)}
                                    disabled={saving}
                                />

                                <Field
                                    label="Inbound ID по умолчанию"
                                    type="number"
                                    min="1"
                                    value={form.default_inbound_id}
                                    onChange={(value) => updateField("default_inbound_id", value)}
                                    disabled={saving}
                                />
                            </div>
                        </section>

                        <section style={section}>
                            <h2 style={sectionTitle}>
                                Subscription URL
                            </h2>

                            <div style={fieldGrid}>
                                <Field
                                    label="Порт подписки"
                                    type="number"
                                    min="1"
                                    max="65535"
                                    value={form.subscription_port}
                                    onChange={(value) => updateField("subscription_port", value)}
                                    disabled={saving}
                                />

                                <Field
                                    label="Путь подписки"
                                    value={form.subscription_path}
                                    onChange={(value) => updateField("subscription_path", value)}
                                    disabled={saving}
                                    placeholder="subs"
                                />
                            </div>

                            <div style={hint}>
                                Пример: https://server-ip:{form.subscription_port}/{normalizePath(form.subscription_path)}/subId
                            </div>
                        </section>

                        <section style={section}>
                            <h2 style={sectionTitle}>
                                Оплата переводом
                            </h2>

                            <div style={fieldGrid}>
                                <Field
                                    label="Номер телефона для оплаты"
                                    value={form.payment_phone}
                                    onChange={(value) => updateField("payment_phone", value)}
                                    disabled={saving}
                                    placeholder="+7..."
                                    required={false}
                                />

                                <Field
                                    label="Получатель"
                                    value={form.payment_recipient}
                                    onChange={(value) => updateField("payment_recipient", value)}
                                    disabled={saving}
                                    placeholder="Имя получателя"
                                    required={false}
                                />
                            </div>

                            <TextareaField
                                label="Инструкция для клиента"
                                value={form.payment_instructions}
                                onChange={(value) => updateField("payment_instructions", value)}
                                disabled={saving}
                                placeholder="Например: переведите сумму по номеру телефона и напишите в поддержку номер заказа."
                            />
                        </section>

                        <div style={actions}>
                            <button
                                type="button"
                                onClick={loadSettings}
                                disabled={saving}
                                style={secondaryButton}
                            >
                                Сбросить
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
                </main>
            </div>
        </div>
    );

}

function Field({
    label,
    value,
    onChange,
    type = "text",
    disabled = false,
    placeholder = "",
    required = true,
    min,
    max,
}) {

    return (
        <label style={field}>
            <span style={labelStyle}>
                {label}
            </span>

            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                min={min}
                max={max}
                required={required}
                style={input}
            />
        </label>
    );

}

function TextareaField({
    label,
    value,
    onChange,
    disabled = false,
    placeholder = "",
}) {

    return (
        <label style={field}>
            <span style={labelStyle}>
                {label}
            </span>

            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                rows={4}
                style={textarea}
            />
        </label>
    );

}

function getEmptyForm() {

    return {
        panel_name: "DLGTW VPN",
        default_client_days: "30",
        default_traffic_gb: "0",
        default_inbound_id: "1",
        subscription_port: "2096",
        subscription_path: "subs",
        support_contact: "",
        payment_phone: "",
        payment_recipient: "",
        payment_instructions: "",
    };

}

function settingsToForm(settings) {

    return {
        panel_name: settings.panel_name || "DLGTW VPN",
        default_client_days: String(settings.default_client_days ?? 30),
        default_traffic_gb: String(settings.default_traffic_gb ?? 0),
        default_inbound_id: String(settings.default_inbound_id ?? 1),
        subscription_port: String(settings.subscription_port ?? 2096),
        subscription_path: settings.subscription_path || "subs",
        support_contact: settings.support_contact || "",
        payment_phone: settings.payment_phone || "",
        payment_recipient: settings.payment_recipient || "",
        payment_instructions: settings.payment_instructions || "",
    };

}

function normalizePath(path) {

    return (path || "subs").trim().replace(/^\/+|\/+$/g, "") || "subs";

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
    marginBottom: 22,
};

const title = {
    margin: "0 0 8px",
};

const subtitle = {
    margin: 0,
    color: "#6b7280",
};

const formLayout = {
    display: "grid",
    gap: 22,
    maxWidth: 920,
};

const section = {
    display: "grid",
    gap: 14,
};

const sectionTitle = {
    margin: 0,
    fontSize: 20,
};

const fieldGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
};

const field = {
    display: "grid",
    gap: 6,
};

const labelStyle = {
    color: "#374151",
    fontSize: 14,
    fontWeight: 700,
};

const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 15,
};

const textarea = {
    ...input,
    minHeight: 104,
    resize: "vertical",
};

const hint = {
    padding: 12,
    borderRadius: 8,
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: 14,
    overflowWrap: "anywhere",
};

const actions = {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
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

const errorBox = {
    maxWidth: 920,
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const successBox = {
    maxWidth: 920,
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: "#dcfce7",
    color: "#166534",
    fontSize: 14,
};
