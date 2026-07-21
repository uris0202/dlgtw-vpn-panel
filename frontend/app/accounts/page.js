"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Copy,
    ExternalLink,
    KeyRound,
    Power,
    PowerOff,
    ReceiptText,
    RefreshCw,
    Search,
    UserRoundCog,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import StatCard from "../../components/StatCard";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
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

    useEffect(() => { loadAccounts(); }, [router]);

    const filteredAccounts = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return accounts;
        return accounts.filter((account) => [
            account.client_email,
            account.customer_contact,
            account.account_login,
            ...(account.server_names || []),
        ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
    }, [accounts, query]);

    const summary = useMemo(() => buildSummary(accounts), [accounts]);

    async function loadAccounts({ silent = false } = {}) {
        if (!silent) setLoading(true);
        setPageError("");
        try {
            const me = await getMe();
            if (!me) {
                router.replace("/login?next=/accounts");
                return;
            }
            setUser(me);
            const response = await api.get("/accounts", getAuthConfig());
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
        await loadAccounts({ silent: true });
    }

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login?next=/accounts");
    }

    async function copyAccountLink(account) {
        const accountUrl = `${window.location.origin}/account/${account.account_token}`;
        try { await navigator.clipboard.writeText(accountUrl); } catch { fallbackCopy(accountUrl); }
        showMessage(`Ссылка кабинета клиента "${account.client_email}" скопирована.`);
    }

    async function resetCredentials(account) {
        if (!confirm(`Сбросить логин и пароль клиента "${account.client_email}"?`)) return;
        const key = `reset-${account.account_token}`;
        setActionKey(key);
        setPageError("");
        setPageMessage("");
        try {
            const response = await api.post(`/accounts/${account.account_token}/reset-credentials`, {}, getAuthConfig());
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
        if (!confirm(`${enabled ? "Включить" : "Отключить"} VPN на всех серверах клиента "${account.client_email}"?`)) return;
        const key = `${enabled ? "enable" : "disable"}-${account.account_token}`;
        setActionKey(key);
        setPageError("");
        setPageMessage("");
        try {
            const response = await api.patch(`/accounts/${account.account_token}/vpn-access`, { enabled }, getAuthConfig());
            const errors = response.data.errors || [];
            setAccounts((current) => current.map((item) => item.account_token === account.account_token ? { ...item, vpn_enabled: enabled } : item));
            showMessage(errors.length > 0
                ? `VPN удалось ${actionLabel} не на всех серверах: ${errors.join("; ")}`
                : `VPN-доступ клиента ${enabled ? "включён" : "отключён"} на всех связанных серверах.`);
        } catch (error) {
            setPageError(getErrorMessage(error, "Не удалось изменить VPN-доступ."));
        } finally {
            setActionKey("");
        }
    }

    function replaceAccount(originalAccountToken, updatedAccount) {
        setAccounts((current) => current.map((account) => account.account_token === originalAccountToken ? { ...account, ...updatedAccount } : account));
    }

    function showMessage(message) {
        setPageMessage(message);
        window.setTimeout(() => setPageMessage(""), 4000);
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Кабинеты клиентов"
                description="Доступ в личный кабинет, учётные данные и управление VPN"
                actions={
                    <Button variant="outline" onClick={refreshAccounts} disabled={refreshing || loading}>
                        <RefreshCw className={refreshing || loading ? "animate-spin" : ""} />
                        {refreshing ? "Обновление..." : "Обновить"}
                    </Button>
                }
            />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка кабинетов...</Alert>}
                {pageError && <Alert variant="error">{pageError}</Alert>}
                {pageMessage && <Alert variant="success">{pageMessage}</Alert>}
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Всего кабинетов" value={accounts.length} description="Связаны с VPN-клиентами" icon={UserRoundCog} />
                <StatCard title="Настроен вход" value={summary.configured} description="Есть логин и пароль" tone="success" />
                <StatCard title="Без пароля" value={summary.withoutPassword} description="Клиент ещё не настроил вход" tone={summary.withoutPassword > 0 ? "warning" : "neutral"} icon={KeyRound} />
                <StatCard title="Ожидают оплаты" value={summary.pending} description="Есть неоплаченные заказы" tone={summary.pending > 0 ? "warning" : "neutral"} icon={ReceiptText} />
            </div>

            <Card className="mb-4 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
                    <label className="relative block">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, контакт, логин или сервер" className="pl-9" aria-label="Поиск кабинетов" />
                    </label>
                    <div className="text-xs text-muted-foreground lg:text-right">Показано {filteredAccounts.length} из {accounts.length}</div>
                </div>
            </Card>

            {!loading && filteredAccounts.length === 0 ? (
                <Card className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
                    <UserRoundCog className="size-8 text-muted-foreground" />
                    <div className="text-sm font-medium">Кабинеты не найдены</div>
                    <div className="text-sm text-muted-foreground">Кабинет появится после выдачи доступа клиенту.</div>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="divide-y divide-border">
                        {filteredAccounts.map((account) => (
                            <AccountRow
                                key={account.account_token}
                                account={account}
                                actionKey={actionKey}
                                onCopy={() => copyAccountLink(account)}
                                onOpen={() => window.open(`/account/${account.account_token}`, "_blank", "noopener,noreferrer")}
                                onOrders={() => router.push(`/orders?q=${encodeURIComponent(account.client_email)}`)}
                                onReset={() => resetCredentials(account)}
                                onDisable={() => updateVpnAccess(account, false)}
                                onEnable={() => updateVpnAccess(account, true)}
                            />
                        ))}
                    </div>
                </Card>
            )}
        </AdminLayout>
    );
}

function AccountRow({ account, actionKey, onCopy, onOpen, onOrders, onReset, onDisable, onEnable }) {
    const accountBusy = actionKey.endsWith(account.account_token);
    const credentialsConfigured = account.has_password && account.account_login;

    return (
        <article className="grid gap-4 px-4 py-5 sm:px-5 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="m-0 break-words text-base font-semibold">{account.client_email || "Без имени"}</h2>
                        <div className="mt-1 text-sm text-muted-foreground">{account.customer_contact || "Контакт не указан"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant={credentialsConfigured ? "success" : "warning"}>{credentialsConfigured ? "Вход настроен" : "Без пароля"}</Badge>
                        {account.vpn_enabled !== undefined && <Badge variant={account.vpn_enabled ? "success" : "destructive"}>{account.vpn_enabled ? "VPN включён" : "VPN отключён"}</Badge>}
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-4">
                    <Detail label="Логин" value={account.account_login || "Не задан"} />
                    <Detail label="Серверы" value={(account.server_names || []).join(", ") || "Не привязаны"} />
                    <Detail label="Заказы" value={`${account.orders_count || 0} · оплачено ${account.paid_orders || 0}`} />
                    <Detail label="Последний тариф" value={account.latest_plan_name || "Без тарифа"} />
                </div>

                {(account.pending_orders > 0 || account.activation_errors > 0) && (
                    <Alert variant={account.activation_errors > 0 ? "error" : "info"} className="mt-3">
                        {account.pending_orders > 0 ? `Ожидают оплаты: ${account.pending_orders}. ` : ""}
                        {account.activation_errors > 0 ? `Ошибок выдачи: ${account.activation_errors}.` : ""}
                    </Alert>
                )}
            </div>

            <div className="flex flex-wrap items-start gap-2 xl:max-w-96 xl:justify-end">
                <Button size="sm" onClick={onOpen}><ExternalLink />Открыть ЛК</Button>
                <Button variant="outline" size="sm" onClick={onCopy}><Copy />Ссылка</Button>
                <Button variant="outline" size="sm" onClick={onOrders}><ReceiptText />Заказы</Button>
                <Button variant="outline" size="sm" onClick={onReset} disabled={accountBusy || !credentialsConfigured} title={!credentialsConfigured ? "Сначала клиент должен настроить вход" : "Сбросить логин и пароль"}><KeyRound />Сбросить вход</Button>
                {account.vpn_enabled === false ? (
                    <Button size="sm" onClick={onEnable} disabled={accountBusy}><Power className={actionKey === `enable-${account.account_token}` ? "animate-pulse" : ""} />{actionKey === `enable-${account.account_token}` ? "Включение..." : "Включить VPN"}</Button>
                ) : (
                    <Button variant="destructive" size="sm" onClick={onDisable} disabled={accountBusy}><PowerOff />{actionKey === `disable-${account.account_token}` ? "Отключение..." : "Отключить VPN"}</Button>
                )}
            </div>
        </article>
    );
}

function Detail({ label, value }) {
    return <div className="min-w-0"><div className="truncate text-sm font-semibold" title={String(value)}>{value}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div></div>;
}

function buildSummary(accounts) {
    return {
        configured: accounts.filter((account) => account.has_password && account.account_login).length,
        withoutPassword: accounts.filter((account) => !account.has_password || !account.account_login).length,
        pending: accounts.filter((account) => account.pending_orders > 0).length,
    };
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
