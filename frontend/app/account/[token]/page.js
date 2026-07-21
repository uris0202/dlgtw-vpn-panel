"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import QRCodeCanvas from "../../../components/QRCodeCanvas";
import api from "../../../lib/api";
import {
    CLIENT_ACCOUNT_PATH,
    clearClientOnboardingToken,
    clearClientToken,
    getClientAuthConfig,
} from "../../../lib/clientAuth";
import { selectServersForPlan } from "../../../lib/serverSelection";

export default function ClientAccountPage() {

    const params = useParams();
    const router = useRouter();
    const accountToken = Array.isArray(params?.token)
        ? params.token[0]
        : params?.token;
    const sessionMode = accountToken === "dashboard";

    const [settings, setSettings] = useState({});
    const [account, setAccount] = useState(null);
    const [subscriptions, setSubscriptions] = useState([]);
    const [orders, setOrders] = useState([]);
    const [plans, setPlans] = useState([]);
    const [servers, setServers] = useState([]);
    const [selectedPlanId, setSelectedPlanId] = useState("");
    const [selectedServerIds, setSelectedServerIds] = useState([]);
    const [payment, setPayment] = useState(null);
    const [paymentHidden, setPaymentHidden] = useState(false);
    const [credentialLogin, setCredentialLogin] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [credentialPassword, setCredentialPassword] = useState("");
    const [credentialPasswordConfirm, setCredentialPasswordConfirm] = useState("");
    const [credentialSaving, setCredentialSaving] = useState(false);
    const [credentialMessage, setCredentialMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {

        if (accountToken) {
            loadAccount();
        }

    }, [accountToken]);

    const selectedPlan = useMemo(
        () => plans.find((plan) => String(plan.id) === String(selectedPlanId)),
        [plans, selectedPlanId],
    );

    const accessState = useMemo(
        () => buildAccessState(account, subscriptions, orders),
        [account, subscriptions, orders],
    );

    async function loadAccount() {

        setError("");

        try {

            const response = await api.get(
                getAccountEndpoint(accountToken, sessionMode),
                sessionMode ? getClientAuthConfig() : undefined,
            );
            const data = response.data || {};
            const loadedPlans = data.plans || [];
            const loadedServers = data.servers || [];
            const firstPlan = loadedPlans[0];
            const accountServerIds = data.account?.server_ids || [];

            setSettings(data.settings || {});
            setAccount(data.account || null);
            setSubscriptions(data.subscriptions || []);
            setOrders(data.orders || []);
            setPlans(loadedPlans);
            setServers(loadedServers);
            setPayment(data.pending_payment || null);
            setCredentialLogin(
                data.account?.account_login
                || data.account?.client_email
                || "",
            );

            if (sessionMode) {
                clearClientToken();
            }

            if (!selectedPlanId && firstPlan) {
                setSelectedPlanId(String(firstPlan.id));
                setSelectedServerIds(
                    selectServersForPlan(
                        accountServerIds,
                        loadedServers,
                        firstPlan.server_limit,
                    ),
                );
            }

        } catch (error) {

            if (error?.response?.status === 401) {
                clearClientToken();
                router.replace("/account");
                return;
            }

            setError(getErrorMessage(error, "Не удалось открыть личный кабинет."));

        } finally {

            setLoading(false);

        }

    }

    function selectPlan(planId) {

        const plan = plans.find((item) => String(item.id) === String(planId));

        setSelectedPlanId(planId);
        setSelectedServerIds((current) =>
            plan
                ? selectServersForPlan(current, servers, plan.server_limit)
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

    async function submitRenew(event) {

        event.preventDefault();

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
                `${getAccountEndpoint(accountToken, sessionMode)}/renew`,
                {
                    plan_id: Number(selectedPlan.id),
                    server_ids: selectedServerIds,
                },
                sessionMode ? getClientAuthConfig() : undefined,
            );

            setPayment(response.data);
            setPaymentHidden(false);
            await loadAccount();

        } catch (error) {

            if (handleSessionError(error, sessionMode, router)) {
                return;
            }

            setError(getErrorMessage(error, "Не удалось создать заказ на продление."));

        } finally {

            setSaving(false);

        }

    }

    async function submitCredentials(event) {

        event.preventDefault();
        setCredentialMessage("");
        setError("");

        if (credentialPassword !== credentialPasswordConfirm) {
            setError("Пароли не совпадают.");
            return;
        }

        setCredentialSaving(true);

        try {

            await api.patch(
                `${getAccountEndpoint(accountToken, sessionMode)}/credentials`,
                {
                    login: credentialLogin.trim(),
                    password: credentialPassword,
                    current_password: currentPassword,
                },
                sessionMode ? getClientAuthConfig() : undefined,
            );

            clearClientToken();
            clearClientOnboardingToken();
            setCredentialPassword("");
            setCredentialPasswordConfirm("");
            setCurrentPassword("");
            setCredentialMessage("Данные входа сохранены.");

            if (!sessionMode) {
                router.replace(CLIENT_ACCOUNT_PATH);
                return;
            }

            await loadAccount();

        } catch (error) {

            if (handleSessionError(error, sessionMode, router)) {
                return;
            }

            setError(getErrorMessage(error, "Не удалось сохранить данные входа."));

        } finally {

            setCredentialSaving(false);

        }

    }

    function handleAccessAction() {

        if (accessState.targetId === "pending-payment" && payment) {
            setPaymentHidden(false);

            window.setTimeout(() => {
                scrollToSection("pending-payment");
            }, 0);

            return;
        }

        scrollToSection(accessState.targetId);

    }

    async function logout() {

        try {
            await api.post("/public/account/logout");
        } finally {
            clearClientToken();
            clearClientOnboardingToken();
            router.replace("/account");
        }

    }

    if (loading) {
        return (
            <div style={loadingBox}>
                Загрузка...
            </div>
        );
    }

    if (error && !account) {
        return (
            <main style={page}>
                <section style={content}>
                    <div style={errorBox}>
                        {error}
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main style={page}>
            <section style={content}>
                <header style={pageHeader}>
                    <div>
                        <h1 style={title}>
                            {settings.panel_name || "DLGTW VPN"}
                        </h1>

                        <p style={subtitle}>
                            Личный кабинет клиента
                        </p>
                    </div>

                    <div style={headerControls}>
                        {settings.support_contact && (
                            <div style={supportBox}>
                                Поддержка: <b>{settings.support_contact}</b>
                            </div>
                        )}

                        {sessionMode && (
                            <button
                                type="button"
                                onClick={logout}
                                style={logoutButton}
                            >
                                Выйти
                            </button>
                        )}
                    </div>
                </header>

                {error && (
                    <div style={errorBox}>
                        {error}
                    </div>
                )}

                <section
                    style={{
                        ...accessBanner,
                        ...getAccessTone(accessState.tone),
                    }}
                >
                    <div>
                        <div style={accessEyebrow}>
                            Состояние доступа
                        </div>

                        <h2 style={accessTitle}>
                            {accessState.title}
                        </h2>

                        <p style={accessDescription}>
                            {accessState.description}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleAccessAction}
                        style={accessButton}
                    >
                        {accessState.actionLabel}
                    </button>
                </section>

                {payment && !paymentHidden && (
                    <PaymentBox
                        payment={payment}
                        onClose={() => setPaymentHidden(true)}
                    />
                )}

                <section style={summaryGrid}>
                    <Summary label="Клиент" value={account?.client_email} />
                    <Summary label="Статус" value={getStatusLabel(account?.status)} />
                    <Summary label="Активно до" value={formatExpiry(account?.expires_at)} />
                    <Summary label="Оплаченных заказов" value={account?.paid_orders || 0} />
                </section>

                {!account?.has_password && (
                    <div style={warningBox}>
                        Задайте логин и пароль для личного кабинета. После этого клиент сможет входить через обычную страницу входа в ЛК без длинной персональной ссылки.
                    </div>
                )}

                <section style={section}>
                    <h2 style={sectionTitle}>
                        Вход в личный кабинет
                    </h2>

                    <form
                        onSubmit={submitCredentials}
                        style={credentialsForm}
                    >
                        <label style={field}>
                            <span style={label}>
                                Логин
                            </span>

                            <input
                                value={credentialLogin}
                                onChange={(event) => setCredentialLogin(event.target.value)}
                                minLength={3}
                                required
                                autoComplete="username"
                                style={input}
                            />
                        </label>

                        {account?.has_password && (
                            <label style={field}>
                                <span style={label}>
                                    Текущий пароль
                                </span>

                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                    required
                                    autoComplete="current-password"
                                    style={input}
                                />
                            </label>
                        )}

                        <label style={field}>
                            <span style={label}>
                                Новый пароль
                            </span>

                            <input
                                type="password"
                                value={credentialPassword}
                                onChange={(event) => setCredentialPassword(event.target.value)}
                                minLength={6}
                                required
                                autoComplete="new-password"
                                style={input}
                            />
                        </label>

                        <label style={field}>
                            <span style={label}>
                                Повторите пароль
                            </span>

                            <input
                                type="password"
                                value={credentialPasswordConfirm}
                                onChange={(event) => setCredentialPasswordConfirm(event.target.value)}
                                minLength={6}
                                required
                                autoComplete="new-password"
                                style={input}
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={credentialSaving}
                            style={{
                                ...primaryButton,
                                opacity: credentialSaving ? .7 : 1,
                                cursor: credentialSaving ? "not-allowed" : "pointer",
                            }}
                        >
                            {credentialSaving ? "Сохранение..." : "Сохранить вход"}
                        </button>

                        {credentialMessage && (
                            <div style={successMessage}>
                                {credentialMessage}
                            </div>
                        )}
                    </form>
                </section>

                <section style={section}>
                    <h2 style={sectionTitle}>
                        Подписка
                    </h2>

                    {subscriptions.length === 0 ? (
                        <div style={emptyState}>
                            Подписка появится после подтверждения оплаты.
                        </div>
                    ) : (
                        <div style={subscriptionGrid}>
                            {subscriptions.map((subscription) => (
                                <SubscriptionCard
                                    key={subscription.server_id}
                                    subscription={subscription}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <section
                    id="renew-access"
                    style={section}
                >
                    <h2 style={sectionTitle}>
                        Продлить доступ
                    </h2>

                    <form
                        onSubmit={submitRenew}
                        style={renewForm}
                    >
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
                                        {plan.duration_days} дн. · {formatTrafficLimit(plan.traffic_gb)} · {formatServerLimit(plan.server_limit)}
                                    </span>
                                </button>
                            ))}
                        </div>

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

                        <button
                            type="submit"
                            disabled={saving}
                            style={{
                                ...primaryButton,
                                opacity: saving ? .7 : 1,
                                cursor: saving ? "not-allowed" : "pointer",
                            }}
                        >
                            {saving ? "Создание заказа..." : "Создать заказ на продление"}
                        </button>
                    </form>
                </section>

                <section style={section}>
                    <h2 style={sectionTitle}>
                        История заказов
                    </h2>

                    <div style={ordersList}>
                        {orders.map((order) => (
                            <OrderHistoryItem
                                key={order.id}
                                order={order}
                            />
                        ))}
                    </div>
                </section>
            </section>
        </main>
    );

}

function Summary({
    label,
    value,
}) {

    return (
        <div style={summaryItem}>
            <div style={summaryValue}>
                {value || "-"}
            </div>

            <div style={summaryLabel}>
                {label}
            </div>
        </div>
    );

}

function SubscriptionCard({
    subscription,
}) {

    return (
        <article style={subscriptionCard}>
            <div style={subscriptionHeader}>
                <div>
                    <h3 style={cardTitle}>
                        {subscription.server_name}
                    </h3>

                    <div style={muted}>
                        {subscription.country || "VPN-сервер"}
                    </div>
                </div>

                <span
                    style={{
                        ...badge,
                        ...(isSubscriptionActive(subscription) ? successBadge : warningBadge),
                    }}
                >
                    {isSubscriptionActive(subscription) ? "Активна" : "Не активна"}
                </span>
            </div>

            <div style={detailsGrid}>
                <Detail label="Активно до" value={formatExpiry(subscription.expiry)} />
                <Detail label="Трафик" value={formatBytes(subscription.traffic)} />
            </div>

            {subscription.error && (
                <div style={warningBox}>
                    {subscription.error}
                </div>
            )}

            <LinkSection
                title="VLESS"
                value={subscription.vless_url}
            />

            <LinkSection
                title="Subscription URL"
                value={subscription.subscription_url}
            />
        </article>
    );

}

function LinkSection({
    title,
    value,
}) {

    const [status, setStatus] = useState("");

    return (
        <div style={linkSection}>
            <div style={linkInfo}>
                <div style={linkTitle}>
                    {title}
                </div>

                <textarea
                    readOnly
                    value={value || "Ссылка недоступна"}
                    style={textarea}
                />

                <button
                    type="button"
                    disabled={!value}
                    onClick={() => copyText(value, setStatus)}
                    style={{
                        ...secondaryButton,
                        opacity: value ? 1 : .65,
                        cursor: value ? "pointer" : "not-allowed",
                    }}
                >
                    Copy
                </button>

                {status && (
                    <span style={copyStatus}>
                        {status}
                    </span>
                )}
            </div>

            <QRCodeCanvas
                value={value}
                size={150}
            />
        </div>
    );

}

function PaymentBox({
    payment,
    onClose,
}) {

    return (
        <section
            id="pending-payment"
            style={paymentBox}
        >
            <div style={paymentHeader}>
                <div>
                    <h2 style={sectionTitle}>
                        Заказ #{payment.id}
                    </h2>

                    <p style={paymentSubtitle}>
                        Переведите оплату по номеру телефона.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    style={secondaryButton}
                >
                    Скрыть
                </button>
            </div>

            <div style={detailsGrid}>
                <Detail label="Тариф" value={payment.plan_name} />
                <Detail label="Серверы" value={payment.server_names} />
                <Detail label="Сумма" value={formatPrice(payment.amount, payment.currency)} />
                <Detail label="Комментарий" value={payment.payment_comment} />
            </div>

            <div style={paymentLine}>
                Номер телефона: <b>{payment.payment_phone || "не указан"}</b>
            </div>

            {payment.payment_recipient && (
                <div style={paymentLine}>
                    Получатель: <b>{payment.payment_recipient}</b>
                </div>
            )}

            {payment.payment_instructions && (
                <p style={instructions}>
                    {payment.payment_instructions}
                </p>
            )}
        </section>
    );

}

function OrderHistoryItem({
    order,
}) {

    return (
        <div style={orderItem}>
            <div>
                <strong>
                    Заказ #{order.id}
                </strong>

                <div style={muted}>
                    {order.plan_name || "Без тарифа"} · {order.server_names || "Сервер не выбран"}
                </div>

                {order.activation_error && (
                    <div style={warningBox}>
                        {order.activation_error}
                    </div>
                )}
            </div>

            <div style={orderRight}>
                <span
                    style={{
                        ...badge,
                        ...getOrderBadge(order.status),
                    }}
                >
                    {getOrderStatusLabel(order.status)}
                </span>

                <div style={muted}>
                    {formatPrice(order.amount, order.currency)}
                </div>
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
                {value || "-"}
            </div>

            <div style={detailLabel}>
                {label}
            </div>
        </div>
    );

}

async function copyText(value, setStatus) {

    if (!value) {
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        setTemporaryStatus(setStatus, "Скопировано.");
    } catch {
        fallbackCopy(value);
        setTemporaryStatus(setStatus, "Скопировано.");
    }

}

function setTemporaryStatus(setStatus, message) {

    setStatus(message);

    window.setTimeout(() => {
        setStatus("");
    }, 2200);

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

function getAccountEndpoint(accountToken, sessionMode) {

    return sessionMode
        ? "/public/account/session"
        : `/public/account/${accountToken}`;

}

function handleSessionError(error, sessionMode, router) {

    if (sessionMode && error?.response?.status === 401) {
        clearClientToken();
        router.replace("/account");
        return true;
    }

    return false;

}

function scrollToSection(sectionId) {

    document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
    });

}

function buildAccessState(account, subscriptions, orders) {

    const activeSubscriptions = (subscriptions || []).filter(isSubscriptionActive);
    const pendingOrder = (orders || []).find((order) => order.status === "pending");

    if (account?.status === "active") {
        return {
            title: "Доступ активен",
            description: `Активно до ${formatExpiry(account.expires_at)}. Доступных серверов: ${activeSubscriptions.length}.`,
            actionLabel: "Продлить доступ",
            targetId: "renew-access",
            tone: "success",
        };
    }

    if (account?.status === "pending") {
        return {
            title: "Оплата ожидает подтверждения",
            description: pendingOrder
                ? `Заказ #${pendingOrder.id} создан. После перевода оплата будет подтверждена администратором.`
                : "После перевода оплата будет подтверждена администратором.",
            actionLabel: "Реквизиты оплаты",
            targetId: "pending-payment",
            tone: "warning",
        };
    }

    if (account?.status === "expired") {
        return {
            title: "Срок доступа закончился",
            description: "Выберите тариф и серверы, чтобы снова пользоваться VPN.",
            actionLabel: "Возобновить доступ",
            targetId: "renew-access",
            tone: "danger",
        };
    }

    return {
        title: "Доступ ещё не подключён",
        description: "Выберите подходящий тариф и серверы для первого подключения.",
        actionLabel: "Выбрать тариф",
        targetId: "renew-access",
        tone: "neutral",
    };

}

function getAccessTone(tone) {

    if (tone === "success") {
        return accessSuccess;
    }

    if (tone === "warning") {
        return accessWarning;
    }

    if (tone === "danger") {
        return accessDanger;
    }

    return accessNeutral;

}

function getStatusLabel(status) {

    if (status === "active") {
        return "Активна";
    }

    if (status === "pending") {
        return "Ожидает оплаты";
    }

    if (status === "expired") {
        return "Истекла";
    }

    return "Новая";

}

function getOrderStatusLabel(status) {

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

function getOrderBadge(status) {

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

function isSubscriptionActive(subscription) {

    if (!subscription.enabled) {
        return false;
    }

    const expiry = Number(subscription.expiry || 0);

    return expiry === 0 || expiry > Date.now();

}

function formatExpiry(value) {

    const timestamp = Number(value || 0);

    if (!timestamp) {
        return "Без срока";
    }

    return new Date(timestamp).toLocaleDateString("ru-RU");

}

function formatPrice(value, currency) {

    const amount = Number(value || 0);

    return `${amount.toLocaleString("ru-RU")} ${currency || "RUB"}`;

}

function formatBytes(value) {

    const bytes = Number(value || 0);

    if (!bytes) {
        return "0 GB";
    }

    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;

}

function formatTrafficLimit(value) {

    const gb = Number(value || 0);

    return gb > 0 ? `${gb} GB` : "без лимита";

}

function formatServerLimit(value) {

    const count = Number(value || 1);

    return count === 1 ? "1 сервер" : `${count} сервера`;

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
    padding: 24,
    background: "#f5f7fb",
    fontFamily: "Arial",
};

const content = {
    maxWidth: 1180,
    margin: "0 auto",
};

const loadingBox = {
    padding: 40,
    fontFamily: "Arial",
};

const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 20,
};

const headerControls = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
};

const title = {
    margin: "0 0 8px",
};

const subtitle = {
    margin: 0,
    color: "#6b7280",
};

const supportBox = {
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    color: "#374151",
};

const logoutButton = {
    padding: "11px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontSize: 14,
};

const accessBanner = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    marginBottom: 18,
    padding: 18,
    border: "1px solid",
    borderRadius: 8,
};

const accessSuccess = {
    borderColor: "#86efac",
    background: "#f0fdf4",
    color: "#166534",
};

const accessWarning = {
    borderColor: "#fcd34d",
    background: "#fffbeb",
    color: "#92400e",
};

const accessDanger = {
    borderColor: "#fca5a5",
    background: "#fef2f2",
    color: "#991b1b",
};

const accessNeutral = {
    borderColor: "#cbd5e1",
    background: "#f8fafc",
    color: "#334155",
};

const accessEyebrow = {
    marginBottom: 5,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
};

const accessTitle = {
    margin: 0,
    fontSize: 22,
};

const accessDescription = {
    margin: "7px 0 0",
    lineHeight: 1.45,
};

const accessButton = {
    padding: "11px 16px",
    border: "none",
    borderRadius: 8,
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
};

const summaryGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginBottom: 22,
};

const summaryItem = {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const summaryValue = {
    color: "#111827",
    fontSize: 22,
    fontWeight: 700,
    overflowWrap: "anywhere",
};

const summaryLabel = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 13,
};

const section = {
    display: "grid",
    gap: 12,
    marginTop: 26,
};

const sectionTitle = {
    margin: 0,
    fontSize: 20,
};

const subscriptionGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 14,
};

const subscriptionCard = {
    display: "grid",
    gap: 14,
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const subscriptionHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
};

const cardTitle = {
    margin: "0 0 5px",
    fontSize: 18,
};

const muted = {
    color: "#6b7280",
    fontSize: 14,
};

const detailsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
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
    overflowWrap: "anywhere",
};

const detailLabel = {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
};

const linkSection = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 14,
    alignItems: "start",
};

const linkInfo = {
    minWidth: 0,
};

const linkTitle = {
    marginBottom: 6,
    color: "#111827",
    fontWeight: 700,
};

const textarea = {
    width: "100%",
    minHeight: 74,
    resize: "vertical",
    boxSizing: "border-box",
    padding: 10,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 13,
    lineHeight: 1.45,
};

const copyStatus = {
    marginLeft: 10,
    color: "#047857",
    fontSize: 13,
};

const renewForm = {
    display: "grid",
    gap: 12,
};

const credentialsForm = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    alignItems: "end",
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const field = {
    display: "grid",
    gap: 6,
};

const label = {
    color: "#374151",
    fontSize: 14,
    fontWeight: 700,
};

const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: 11,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const planGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
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
    fontSize: 23,
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

const ordersList = {
    display: "grid",
    gap: 10,
};

const orderItem = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const orderRight = {
    display: "grid",
    justifyItems: "end",
    gap: 8,
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
    justifySelf: "start",
    padding: "12px 18px",
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontSize: 15,
};

const secondaryButton = {
    marginTop: 8,
    padding: "9px 13px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const paymentBox = {
    display: "grid",
    gap: 14,
    marginBottom: 22,
    padding: 18,
    border: "1px solid #c7d2fe",
    borderRadius: 8,
    background: "#eef2ff",
};

const paymentHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
};

const paymentSubtitle = {
    margin: "6px 0 0",
    color: "#4338ca",
};

const paymentLine = {
    color: "#374151",
    overflowWrap: "anywhere",
};

const instructions = {
    margin: 0,
    color: "#374151",
    lineHeight: 1.45,
};

const errorBox = {
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const successMessage = {
    color: "#047857",
    fontSize: 14,
    fontWeight: 700,
};

const warningBox = {
    padding: 10,
    borderRadius: 8,
    background: "#fef3c7",
    color: "#92400e",
    fontSize: 13,
    overflowWrap: "anywhere",
};

const emptyState = {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    color: "#6b7280",
};
