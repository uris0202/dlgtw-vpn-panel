"use client";

import { useEffect, useMemo, useState } from "react";

import api from "../../lib/api";

const ACCOUNT_TOKEN_STORAGE_KEY = "dlgtw_checkout_account_token";
const REQUEST_ID_STORAGE_KEY = "dlgtw_checkout_request_id";

export default function BuyPage() {

    const [settings, setSettings] = useState(null);
    const [plans, setPlans] = useState([]);
    const [servers, setServers] = useState([]);
    const [selectedPlanId, setSelectedPlanId] = useState("");
    const [selectedServerIds, setSelectedServerIds] = useState([]);
    const [clientEmail, setClientEmail] = useState("");
    const [customerContact, setCustomerContact] = useState("");
    const [order, setOrder] = useState(null);
    const [requestId, setRequestId] = useState("");
    const [existingAccountToken, setExistingAccountToken] = useState("");
    const [copyStatus, setCopyStatus] = useState("");
    const [accountRestoring, setAccountRestoring] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {

        loadCheckout();

    }, []);

    const selectedPlan = useMemo(
        () => plans.find((plan) => String(plan.id) === String(selectedPlanId)),
        [plans, selectedPlanId],
    );

    const selectedServerNames = useMemo(
        () => servers
            .filter((server) => selectedServerIds.includes(Number(server.id)))
            .map((server) => server.name),
        [servers, selectedServerIds],
    );

    async function loadCheckout() {

        setError("");

        try {

            const savedAccountToken = localStorage.getItem(ACCOUNT_TOKEN_STORAGE_KEY) || "";
            const savedRequestId = getOrCreateRequestId();
            const response = await api.get("/public/checkout");

            setSettings(response.data.settings || {});
            setPlans(response.data.plans || []);
            setServers(response.data.servers || []);
            setRequestId(savedRequestId);

            const firstPlan = response.data.plans?.[0];

            if (firstPlan) {
                setSelectedPlanId(String(firstPlan.id));
            }

            if (savedAccountToken) {
                setAccountRestoring(true);
                restoreStoredAccount(savedAccountToken);
            }

        } catch (error) {

            setError(getErrorMessage(error, "Не удалось загрузить тарифы."));

        } finally {

            setLoading(false);

        }

    }

    async function restoreStoredAccount(savedAccountToken) {

        try {

            const response = await api.get(`/public/account/${savedAccountToken}`);
            const restoredAccountToken = response.data?.account?.account_token;

            if (!restoredAccountToken) {
                localStorage.removeItem(ACCOUNT_TOKEN_STORAGE_KEY);
                return;
            }

            setExistingAccountToken(restoredAccountToken);

            if (response.data.pending_payment) {
                setOrder(response.data.pending_payment);
                return;
            }

            const nextRequestId = createRequestId();

            localStorage.setItem(REQUEST_ID_STORAGE_KEY, nextRequestId);
            setRequestId(nextRequestId);

        } catch {

            localStorage.removeItem(ACCOUNT_TOKEN_STORAGE_KEY);

        } finally {

            setAccountRestoring(false);

        }

    }

    function selectPlan(planId) {

        const plan = plans.find((item) => String(item.id) === String(planId));

        setSelectedPlanId(planId);
        setSelectedServerIds((current) =>
            plan
                ? current.slice(0, Number(plan.server_limit || 1))
                : current
        );

    }

    function toggleServer(serverId) {

        const normalizedServerId = Number(serverId);
        const limit = Number(selectedPlan?.server_limit || 1);

        setSelectedServerIds((current) => {

            if (current.includes(normalizedServerId)) {
                return current.filter((item) => item !== normalizedServerId);
            }

            if (current.length >= limit) {
                if (limit === 1) {
                    return [normalizedServerId];
                }

                return current;
            }

            return [...current, normalizedServerId];

        });

    }

    async function submitOrder(event) {

        event.preventDefault();

        if (accountRestoring) {
            return;
        }

        if (!selectedPlan) {
            setError("Выберите тариф.");
            return;
        }

        if (selectedServerIds.length !== Number(selectedPlan.server_limit || 1)) {
            setError(`По выбранному тарифу нужно выбрать серверов: ${selectedPlan.server_limit}.`);
            return;
        }

        setSaving(true);
        setError("");

        try {

            const response = await api.post(
                "/public/orders",
                {
                    client_email: clientEmail.trim(),
                    customer_contact: customerContact.trim(),
                    request_id: requestId || getOrCreateRequestId(),
                    plan_id: Number(selectedPlan.id),
                    server_ids: selectedServerIds,
                },
            );

            setOrder(response.data);

            if (response.data.account_token) {
                localStorage.setItem(
                    ACCOUNT_TOKEN_STORAGE_KEY,
                    response.data.account_token,
                );
                setExistingAccountToken(response.data.account_token);
            }

        } catch (error) {

            setError(getErrorMessage(error, "Не удалось создать заказ."));

        } finally {

            setSaving(false);

        }

    }

    async function copyPaymentValue(value, field) {

        if (!value) {
            return;
        }

        try {
            await navigator.clipboard.writeText(String(value));
        } catch {
            fallbackCopy(String(value));
        }

        setCopyStatus(field);

        window.setTimeout(() => {
            setCopyStatus("");
        }, 1800);

    }

    if (loading) {
        return (
            <div style={loadingBox}>
                Загрузка...
            </div>
        );
    }

    if (order) {
        return (
            <main style={page}>
                <section style={content}>
                    <h1 style={title}>
                        Заказ #{order.id}
                    </h1>

                    <p style={subtitle}>
                        Переведите оплату по номеру телефона. После подтверждения платежа доступ будет выдан автоматически.
                    </p>

                    <div style={summary}>
                        <Detail label="Тариф" value={order.plan_name} />
                        <Detail label="Серверы" value={order.server_names} />
                        <Detail label="Сумма" value={formatPrice(order.amount, order.currency)} />
                        <Detail label="Комментарий к платежу" value={order.payment_comment} />
                        {order.account_token && (
                            <Detail
                                label="Личный кабинет"
                                value={(
                                    <a
                                        href={buildAccountUrl(order.account_token)}
                                        style={link}
                                    >
                                        Открыть кабинет
                                    </a>
                                )}
                            />
                        )}
                    </div>

                    <section style={paymentBox}>
                        <h2 style={sectionTitle}>
                            Оплата переводом
                        </h2>

                        <div style={paymentValues}>
                            <PaymentValue
                                label="Номер телефона"
                                value={order.payment_phone || "не указан"}
                                copied={copyStatus === "phone"}
                                onCopy={order.payment_phone
                                    ? () => copyPaymentValue(order.payment_phone, "phone")
                                    : null}
                            />

                            <PaymentValue
                                label="Сумма перевода"
                                value={formatPrice(order.amount, order.currency)}
                                copied={copyStatus === "amount"}
                                onCopy={() => copyPaymentValue(order.amount, "amount")}
                            />

                            <PaymentValue
                                label="Комментарий"
                                value={order.payment_comment}
                                copied={copyStatus === "comment"}
                                onCopy={() => copyPaymentValue(order.payment_comment, "comment")}
                            />
                        </div>

                        {order.payment_recipient && (
                            <div style={paymentLine}>
                                Получатель: <b>{order.payment_recipient}</b>
                            </div>
                        )}

                        {order.payment_instructions && (
                            <p style={instructions}>
                                {order.payment_instructions}
                            </p>
                        )}

                        {order.support_contact && (
                            <div style={paymentLine}>
                                Поддержка: <b>{order.support_contact}</b>
                            </div>
                        )}
                    </section>

                    {order.account_token && (
                        <section style={accountNotice}>
                            <div>
                                <b>Личный кабинет уже создан.</b>

                                <div style={accountNoticeText}>
                                    В кабинете можно отслеживать оплату, получить VPN-ссылки и задать логин с паролем.
                                </div>
                            </div>

                            <a
                                href={buildAccountUrl(order.account_token)}
                                style={primaryLink}
                            >
                                Открыть личный кабинет
                            </a>
                        </section>
                    )}
                </section>
            </main>
        );
    }

    return (
        <main style={page}>
            <section style={content}>
                <h1 style={title}>
                    {settings?.panel_name || "DLGTW VPN"}
                </h1>

                <p style={subtitle}>
                    Выберите тариф, серверы и создайте заявку на подключение.
                </p>

                {error && (
                    <div style={errorBox}>
                        {error}
                    </div>
                )}

                {existingAccountToken && (
                    <div style={existingAccountNotice}>
                        <span>
                            У вас уже есть личный кабинет.
                        </span>

                        <a
                            href={buildAccountUrl(existingAccountToken)}
                            style={noticeLink}
                        >
                            Открыть
                        </a>
                    </div>
                )}

                {accountRestoring && (
                    <div style={restoringNotice}>
                        Проверяем предыдущий заказ...
                    </div>
                )}

                <form
                    onSubmit={submitOrder}
                    style={form}
                >
                    <section style={section}>
                        <h2 style={sectionTitle}>
                            <span style={stepNumber}>1</span>
                            Тариф
                        </h2>

                        {plans.length === 0 ? (
                            <div style={emptyState}>
                                Сейчас нет доступных тарифов.
                            </div>
                        ) : (
                            <div style={planGrid}>
                                {plans.map((plan) => (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => selectPlan(plan.id)}
                                        style={{
                                            ...planButton,
                                            borderColor: String(plan.id) === String(selectedPlanId)
                                                ? "#2563eb"
                                                : "#e5e7eb",
                                        }}
                                    >
                                        <span style={planName}>
                                            {plan.name}
                                        </span>

                                        <span style={planPrice}>
                                            {formatPrice(plan.price, plan.currency)}
                                        </span>

                                        <span style={planMeta}>
                                            {plan.duration_days} дн. · {formatTraffic(plan.traffic_gb)} · {formatServerLimit(plan.server_limit)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={section}>
                        <h2 style={sectionTitle}>
                            <span style={stepNumber}>2</span>
                            VPN-серверы
                        </h2>

                        <div style={serverBox}>
                            {servers.map((server) => (
                                <label
                                    key={server.id}
                                    style={checkboxRow}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedServerIds.includes(Number(server.id))}
                                        onChange={() => toggleServer(server.id)}
                                    />

                                    {server.name} · {server.country}
                                </label>
                            ))}
                        </div>

                        {selectedPlan && (
                            <div style={hint}>
                                По тарифу нужно выбрать серверов: {selectedPlan.server_limit}.
                            </div>
                        )}
                    </section>

                    <section style={section}>
                        <h2 style={sectionTitle}>
                            <span style={stepNumber}>3</span>
                            Данные клиента
                        </h2>

                        <div style={fieldGrid}>
                            <label style={field}>
                                <span style={label}>
                                    Имя клиента / псевдоним
                                </span>

                                <input
                                    value={clientEmail}
                                    onChange={(event) => setClientEmail(event.target.value)}
                                    required
                                    autoComplete="off"
                                    placeholder="Например: alex"
                                    style={input}
                                />
                            </label>

                            <label style={field}>
                                <span style={label}>
                                    Контакт для связи
                                </span>

                                <input
                                    value={customerContact}
                                    onChange={(event) => setCustomerContact(event.target.value)}
                                    required
                                    placeholder="Telegram или телефон"
                                    style={input}
                                />
                            </label>
                        </div>
                    </section>

                    <div style={checkoutSummary}>
                        <div>
                            <div style={checkoutPlanName}>
                                {selectedPlan?.name || "Тариф не выбран"}
                            </div>

                            <div style={checkoutMeta}>
                                {selectedServerNames.length > 0
                                    ? selectedServerNames.join(", ")
                                    : "Выберите VPN-серверы"}
                            </div>
                        </div>

                        <div style={checkoutTotal}>
                            {selectedPlan
                                ? formatPrice(selectedPlan.price, selectedPlan.currency)
                                : "-"}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving || accountRestoring || plans.length === 0}
                        style={{
                            ...primaryButton,
                            opacity: saving || accountRestoring || plans.length === 0 ? .7 : 1,
                            cursor: saving || accountRestoring || plans.length === 0 ? "not-allowed" : "pointer",
                        }}
                    >
                        {saving
                            ? "Создание заказа..."
                            : accountRestoring
                                ? "Проверка заказа..."
                                : "Перейти к оплате"}
                    </button>
                </form>
            </section>
        </main>
    );

}

function Detail({
    label,
    value,
}) {

    return (
        <div style={detail}>
            <div style={detailValue}>
                {value || "-"}
            </div>

            <div style={detailLabel}>
                {label}
            </div>
        </div>
    );

}

function PaymentValue({
    label,
    value,
    copied,
    onCopy,
}) {

    return (
        <div style={paymentValue}>
            <div>
                <div style={paymentValueLabel}>
                    {label}
                </div>

                <div style={paymentValueText}>
                    {value || "-"}
                </div>
            </div>

            <button
                type="button"
                disabled={!onCopy}
                onClick={onCopy || undefined}
                style={{
                    ...copyButton,
                    opacity: onCopy ? 1 : .55,
                    cursor: onCopy ? "pointer" : "not-allowed",
                }}
            >
                {copied ? "Скопировано" : "Копировать"}
            </button>
        </div>
    );

}

function getOrCreateRequestId() {

    const currentRequestId = localStorage.getItem(REQUEST_ID_STORAGE_KEY);

    if (currentRequestId) {
        return currentRequestId;
    }

    const requestId = createRequestId();

    localStorage.setItem(REQUEST_ID_STORAGE_KEY, requestId);

    return requestId;

}

function createRequestId() {

    return typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;

}

function fallbackCopy(value) {

    const textareaElement = document.createElement("textarea");

    textareaElement.value = value;
    textareaElement.style.position = "fixed";
    textareaElement.style.left = "-9999px";

    document.body.appendChild(textareaElement);
    textareaElement.focus();
    textareaElement.select();

    document.execCommand("copy");
    document.body.removeChild(textareaElement);

}

function formatPrice(value, currency) {

    const amount = Number(value || 0);

    return `${amount.toLocaleString("ru-RU")} ${currency || "RUB"}`;

}

function formatTraffic(value) {

    const gb = Number(value || 0);

    return gb > 0 ? `${gb} GB` : "без лимита";

}

function formatServerLimit(value) {

    const count = Number(value || 1);

    return count === 1 ? "1 сервер" : `${count} сервера`;

}

function buildAccountUrl(accountToken) {

    if (typeof window === "undefined") {
        return `/account/${accountToken}`;
    }

    return `${window.location.origin}/account/${accountToken}`;

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
    minHeight: "100vh",
    background: "#f5f7fb",
    fontFamily: "Arial",
    padding: 24,
};

const content = {
    maxWidth: 980,
    margin: "0 auto",
};

const loadingBox = {
    padding: 40,
    fontFamily: "Arial",
};

const title = {
    margin: "0 0 8px",
};

const subtitle = {
    margin: "0 0 24px",
    color: "#6b7280",
};

const form = {
    display: "grid",
    gap: 24,
};

const section = {
    display: "grid",
    gap: 12,
};

const sectionTitle = {
    display: "flex",
    alignItems: "center",
    gap: 9,
    margin: 0,
    fontSize: 20,
};

const stepNumber = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    flex: "0 0 28px",
    borderRadius: 8,
    background: "#111827",
    color: "#fff",
    fontSize: 14,
};

const planGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
};

const planButton = {
    display: "grid",
    gap: 8,
    textAlign: "left",
    padding: 16,
    border: "2px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
};

const planName = {
    fontSize: 18,
    fontWeight: 700,
    color: "#111827",
};

const planPrice = {
    fontSize: 24,
    fontWeight: 700,
    color: "#2563eb",
};

const planMeta = {
    color: "#6b7280",
    fontSize: 14,
};

const serverBox = {
    display: "grid",
    gap: 8,
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
};

const checkboxRow = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
};

const hint = {
    color: "#6b7280",
    fontSize: 13,
};

const emptyState = {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    color: "#6b7280",
};

const fieldGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
};

const field = {
    display: "grid",
    gap: 6,
};

const label = {
    fontSize: 14,
    fontWeight: 700,
    color: "#374151",
};

const input = {
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    fontSize: 15,
};

const primaryButton = {
    justifySelf: "end",
    padding: "12px 18px",
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontSize: 15,
};

const checkoutSummary = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    padding: 16,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
};

const checkoutPlanName = {
    color: "#111827",
    fontWeight: 700,
};

const checkoutMeta = {
    marginTop: 5,
    color: "#6b7280",
    fontSize: 14,
};

const checkoutTotal = {
    color: "#111827",
    fontSize: 24,
    fontWeight: 700,
};

const errorBox = {
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const existingAccountNotice = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
    padding: 12,
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    background: "#eff6ff",
    color: "#1e40af",
    fontSize: 14,
};

const restoringNotice = {
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 14,
};

const noticeLink = {
    color: "#1d4ed8",
    fontWeight: 700,
    textDecoration: "none",
};

const summary = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
    marginBottom: 24,
};

const detail = {
    padding: 14,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const detailValue = {
    color: "#111827",
    fontWeight: 700,
    overflowWrap: "anywhere",
};

const detailLabel = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 13,
};

const paymentBox = {
    display: "grid",
    gap: 14,
    padding: 18,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
};

const paymentValues = {
    display: "grid",
    gap: 10,
};

const paymentValue = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    padding: 12,
    borderRadius: 8,
    background: "#f9fafb",
};

const paymentValueLabel = {
    color: "#6b7280",
    fontSize: 12,
};

const paymentValueText = {
    marginTop: 4,
    color: "#111827",
    fontSize: 17,
    fontWeight: 700,
    overflowWrap: "anywhere",
};

const copyButton = {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 13,
};

const paymentLine = {
    marginTop: 10,
    color: "#374151",
    overflowWrap: "anywhere",
};

const instructions = {
    marginTop: 12,
    color: "#374151",
    lineHeight: 1.45,
};

const accountNotice = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: 14,
};

const accountNoticeText = {
    marginTop: 6,
    lineHeight: 1.4,
};

const primaryLink = {
    display: "inline-flex",
    padding: "11px 15px",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    textDecoration: "none",
    whiteSpace: "nowrap",
};

const link = {
    color: "#2563eb",
    fontWeight: 700,
    textDecoration: "none",
};
