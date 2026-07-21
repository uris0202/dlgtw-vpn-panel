"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";


export default function AccountsPage() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionKey, setActionKey] = useState("");
    const [pageError, setPageError] = useState("");
    const [pageMessage, setPageMessage] = useState("");

    useEffect(() => {

        loadAccounts();

    }, [router]);

    const filteredAccounts = useMemo(() => {

        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
            return accounts;
        }

        return accounts.filter((account) => [
            account.client_email,
            account.customer_contact,
            account.account_login,
            ...(account.server_names || []),
        ].some((value) =>
            String(value || "").toLowerCase().includes(normalizedQuery)
        ));

    }, [accounts, query]);

    const summary = useMemo(
        () => buildSummary(accounts),
        [accounts],
    );

    async function loadAccounts({ silent = false } = {}) {

        if (!silent) {
            setLoading(true);
        }

        setPageError("");

        try {

            const me = await getMe();

            if (!me) {
                router.replace("/login?next=/accounts");
                return;
            }

            setUser(me);

            const response = await api.get(
                "/accounts",
                getAuthConfig(),
            );

            setAccounts(Array.isArray(response.data) ? response.data : []);

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось загрузить кабинеты."));

        } finally {

            setLoading(false);
            setRefreshing(false);

        }

    }

    async function refreshAccounts() {

        setRefreshing(true);
        setPageMessage("");

        await loadAccounts({
            silent: true,
        });

    }

    function logout() {

        localStorage.removeItem("token");
        router.replace("/login?next=/accounts");

    }

    async function copyAccountLink(account) {

        const accountUrl = `${window.location.origin}/account/${account.account_token}`;

        try {
            await navigator.clipboard.writeText(accountUrl);
        } catch {
            fallbackCopy(accountUrl);
        }

        showMessage(`Ссылка кабинета клиента "${account.client_email}" скопирована.`);

    }

    async function resetCredentials(account) {

        if (!confirm(`Сбросить логин и пароль клиента "${account.client_email}"?`)) {
            return;
        }

        const key = `reset-${account.account_token}`;

        setActionKey(key);
        setPageError("");
        setPageMessage("");

        try {

            const response = await api.post(
                `/accounts/${account.account_token}/reset-credentials`,
                {},
                getAuthConfig(),
            );

            replaceAccount(account.account_token, response.data);
            showMessage("Логин и пароль сброшены. Старая ссылка и клиентские сессии отозваны — скопируйте клиенту новую ссылку.");

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось сбросить данные входа."));

        } finally {

            setActionKey("");

        }

    }

    async function updateVpnAccess(account, enabled) {

        const actionLabel = enabled ? "включить" : "отключить";

        if (!confirm(`${enabled ? "Включить" : "Отключить"} VPN на всех серверах клиента "${account.client_email}"?`)) {
            return;
        }

        const key = `${enabled ? "enable" : "disable"}-${account.account_token}`;

        setActionKey(key);
        setPageError("");
        setPageMessage("");

        try {

            const response = await api.patch(
                `/accounts/${account.account_token}/vpn-access`,
                {
                    enabled,
                },
                getAuthConfig(),
            );
            const errors = response.data.errors || [];

            setAccounts((current) => current.map((item) =>
                item.account_token === account.account_token
                    ? {
                        ...item,
                        vpn_enabled: enabled,
                    }
                    : item
            ));

            showMessage(
                errors.length > 0
                    ? `VPN удалось ${actionLabel} не на всех серверах: ${errors.join("; ")}`
                    : `VPN-доступ клиента ${enabled ? "включён" : "отключён"} на всех связанных серверах.`,
            );

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось изменить VPN-доступ."));

        } finally {

            setActionKey("");

        }

    }

    function replaceAccount(originalAccountToken, updatedAccount) {

        setAccounts((current) => current.map((account) =>
            account.account_token === originalAccountToken
                ? {
                    ...account,
                    ...updatedAccount,
                }
                : account
        ));

    }

    function showMessage(message) {

        setPageMessage(message);

        window.setTimeout(() => {
            setPageMessage("");
        }, 4000);

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
                                Личные кабинеты
                            </h1>

                            <p style={subtitle}>
                                Доступ клиентов, вход в кабинет и связанные VPN-серверы.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={refreshAccounts}
                            disabled={refreshing}
                            style={getButtonState(secondaryButton, refreshing)}
                        >
                            {refreshing ? "Обновление..." : "Обновить"}
                        </button>
                    </div>

                    {pageError && (
                        <div style={errorBox}>
                            {pageError}
                        </div>
                    )}

                    {pageMessage && (
                        <div style={successBox}>
                            {pageMessage}
                        </div>
                    )}

                    <div style={summaryGrid}>
                        <Summary label="Всего кабинетов" value={accounts.length} />
                        <Summary label="Настроен вход" value={summary.configured} />
                        <Summary label="Без пароля" value={summary.withoutPassword} />
                        <Summary label="Ожидают оплаты" value={summary.pending} />
                    </div>

                    <div style={toolbar}>
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Имя, контакт, логин или сервер"
                            style={searchInput}
                        />

                        <div style={resultCount}>
                            Показано: <b>{filteredAccounts.length}</b>
                        </div>
                    </div>

                    {filteredAccounts.length === 0 ? (
                        <div style={emptyState}>
                            Личные кабинеты не найдены.
                        </div>
                    ) : (
                        <div style={accountsList}>
                            {filteredAccounts.map((account) => (
                                <AccountRow
                                    key={account.account_token}
                                    account={account}
                                    actionKey={actionKey}
                                    onCopy={() => copyAccountLink(account)}
                                    onOpen={() => window.open(
                                        `/account/${account.account_token}`,
                                        "_blank",
                                        "noopener,noreferrer",
                                    )}
                                    onOrders={() => router.push(
                                        `/orders?q=${encodeURIComponent(account.client_email)}`
                                    )}
                                    onReset={() => resetCredentials(account)}
                                    onDisable={() => updateVpnAccess(account, false)}
                                    onEnable={() => updateVpnAccess(account, true)}
                                />
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );

}


function AccountRow({
    account,
    actionKey,
    onCopy,
    onOpen,
    onOrders,
    onReset,
    onDisable,
    onEnable,
}) {

    const accountBusy = actionKey.endsWith(account.account_token);
    const credentialsConfigured = account.has_password && account.account_login;

    return (
        <article style={accountRow}>
            <div style={accountMain}>
                <div style={rowHeader}>
                    <div>
                        <h2 style={clientName}>
                            {account.client_email || "Без имени"}
                        </h2>

                        <div style={meta}>
                            {account.customer_contact || "Контакт не указан"}
                        </div>
                    </div>

                    <div style={badges}>
                        <span
                            style={{
                                ...badge,
                                ...(credentialsConfigured ? successBadge : warningBadge),
                            }}
                        >
                            {credentialsConfigured ? "Вход настроен" : "Без пароля"}
                        </span>

                        {account.vpn_enabled !== undefined && (
                            <span
                                style={{
                                    ...badge,
                                    ...(account.vpn_enabled ? successBadge : dangerBadge),
                                }}
                            >
                                {account.vpn_enabled ? "VPN включён" : "VPN отключён"}
                            </span>
                        )}
                    </div>
                </div>

                <div style={detailsGrid}>
                    <Detail
                        label="Логин"
                        value={account.account_login || "Не задан"}
                    />
                    <Detail
                        label="Серверы"
                        value={(account.server_names || []).join(", ") || "Не привязаны"}
                    />
                    <Detail
                        label="Заказы"
                        value={`${account.orders_count || 0} · оплачено ${account.paid_orders || 0}`}
                    />
                    <Detail
                        label="Последний тариф"
                        value={account.latest_plan_name || "Без тарифа"}
                    />
                </div>

                {(account.pending_orders > 0 || account.activation_errors > 0) && (
                    <div style={attentionLine}>
                        {account.pending_orders > 0
                            ? `Ожидают оплаты: ${account.pending_orders}. `
                            : ""}
                        {account.activation_errors > 0
                            ? `Ошибок выдачи: ${account.activation_errors}.`
                            : ""}
                    </div>
                )}
            </div>

            <div style={actions}>
                <button type="button" onClick={onOpen} style={primaryButton}>
                    Открыть ЛК
                </button>

                <button type="button" onClick={onCopy} style={secondaryButton}>
                    Копировать ссылку
                </button>

                <button type="button" onClick={onOrders} style={secondaryButton}>
                    Заказы
                </button>

                <button
                    type="button"
                    onClick={onReset}
                    disabled={accountBusy || !credentialsConfigured}
                    style={getButtonState(secondaryButton, accountBusy || !credentialsConfigured)}
                >
                    Сбросить вход
                </button>

                <button
                    type="button"
                    onClick={onDisable}
                    disabled={accountBusy}
                    style={getButtonState(dangerButton, accountBusy)}
                >
                    {actionKey === `disable-${account.account_token}`
                        ? "Отключение..."
                        : "Отключить VPN"}
                </button>

                <button
                    type="button"
                    onClick={onEnable}
                    disabled={accountBusy}
                    style={getButtonState(successButton, accountBusy)}
                >
                    {actionKey === `enable-${account.account_token}`
                        ? "Включение..."
                        : "Включить VPN"}
                </button>
            </div>
        </article>
    );

}


function Summary({ label, value }) {
    return (
        <div style={summaryItem}>
            <div style={summaryValue}>{value}</div>
            <div style={summaryLabel}>{label}</div>
        </div>
    );
}


function Detail({ label, value }) {
    return (
        <div style={detail}>
            <div style={detailValue}>{value}</div>
            <div style={detailLabel}>{label}</div>
        </div>
    );
}


function buildSummary(accounts) {
    return {
        configured: accounts.filter((account) =>
            account.has_password && account.account_login
        ).length,
        withoutPassword: accounts.filter((account) =>
            !account.has_password || !account.account_login
        ).length,
        pending: accounts.filter((account) => account.pending_orders > 0).length,
    };
}


function getButtonState(style, disabled) {
    return {
        ...style,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? .6 : 1,
    };
}


function getAuthConfig() {
    return {
        headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
    };
}


function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") {
        return detail;
    }

    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    }

    return error?.message || fallback;
}


function fallbackCopy(value) {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}


const page = {
    display: "flex",
    minHeight: "100vh",
    background: "#f5f7fb",
    fontFamily: "Arial",
};

const main = { flex: 1 };
const content = { padding: 30 };
const loadingBox = { padding: 40, fontFamily: "Arial" };

const pageHeader = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 20,
};

const title = { margin: "0 0 8px" };
const subtitle = { margin: 0, color: "#6b7280" };

const summaryGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 18,
};

const summaryItem = {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const summaryValue = { color: "#111827", fontSize: 24, fontWeight: 700 };
const summaryLabel = { marginTop: 6, color: "#6b7280", fontSize: 13 };

const toolbar = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
};

const searchInput = {
    width: "min(560px, 100%)",
    padding: 11,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    fontSize: 14,
};

const resultCount = { color: "#6b7280", fontSize: 14 };
const accountsList = { display: "grid", gap: 12 };

const accountRow = {
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

const accountMain = { minWidth: 300, flex: 1 };

const rowHeader = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
};

const clientName = { margin: "0 0 5px", fontSize: 18, overflowWrap: "anywhere" };
const meta = { color: "#6b7280", fontSize: 14, overflowWrap: "anywhere" };
const badges = { display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" };

const badge = {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
};

const successBadge = { background: "#dcfce7", color: "#166534" };
const warningBadge = { background: "#fef3c7", color: "#92400e" };
const dangerBadge = { background: "#fee2e2", color: "#991b1b" };

const detailsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 9,
};

const detail = { padding: 10, borderRadius: 8, background: "#f9fafb" };
const detailValue = { color: "#111827", fontWeight: 700, overflowWrap: "anywhere" };
const detailLabel = { marginTop: 4, color: "#6b7280", fontSize: 12 };

const attentionLine = {
    marginTop: 10,
    padding: 9,
    borderRadius: 8,
    background: "#fff7ed",
    color: "#9a3412",
    fontSize: 13,
};

const actions = {
    display: "flex",
    alignContent: "flex-start",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: 390,
};

const buttonBase = {
    padding: "9px 12px",
    borderRadius: 8,
    fontSize: 13,
    whiteSpace: "nowrap",
};

const primaryButton = { ...buttonBase, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" };
const secondaryButton = { ...buttonBase, border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: "pointer" };
const successButton = { ...buttonBase, border: "none", background: "#16a34a", color: "#fff", cursor: "pointer" };
const dangerButton = { ...buttonBase, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer" };

const errorBox = {
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const successBox = {
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#dcfce7",
    color: "#166534",
    fontSize: 14,
};

const emptyState = {
    padding: 18,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    color: "#6b7280",
};
