"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    CalendarDays,
    CheckCircle2,
    Copy,
    CreditCard,
    KeyRound,
    Loader2,
    LogOut,
    QrCode,
    ReceiptText,
    Save,
    Server as ServerIcon,
    TriangleAlert,
    UserRound,
    WifiOff,
    X,
} from "lucide-react";

import PublicHeader from "../../../components/PublicHeader";
import QRCodeCanvas from "../../../components/QRCodeCanvas";
import { Alert } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input, Textarea } from "../../../components/ui/input";
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
    const accountToken = Array.isArray(params?.token) ? params.token[0] : params?.token;
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
        if (accountToken) loadAccount();
    }, [accountToken]);

    const selectedPlan = useMemo(() => plans.find((plan) => String(plan.id) === String(selectedPlanId)), [plans, selectedPlanId]);
    const accessState = useMemo(() => buildAccessState(account, subscriptions, orders), [account, subscriptions, orders]);

    async function loadAccount() {
        setError("");
        try {
            const response = await api.get(getAccountEndpoint(accountToken, sessionMode), sessionMode ? getClientAuthConfig() : undefined);
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
            setCredentialLogin(data.account?.account_login || data.account?.client_email || "");
            if (sessionMode) clearClientToken();
            if (!selectedPlanId && firstPlan) {
                setSelectedPlanId(String(firstPlan.id));
                setSelectedServerIds(selectServersForPlan(accountServerIds, loadedServers, firstPlan.server_limit));
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
        setSelectedPlanId(String(planId));
        setSelectedServerIds((current) => plan ? selectServersForPlan(current, servers, plan.server_limit) : current);
    }

    function toggleServer(serverId) {
        const normalizedServerId = Number(serverId);
        const limit = Number(selectedPlan?.server_limit || 1);
        setSelectedServerIds((current) => {
            if (current.includes(normalizedServerId)) return current.filter((item) => item !== normalizedServerId);
            if (current.length >= limit) return limit === 1 ? [normalizedServerId] : current;
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
            const response = await api.post(`${getAccountEndpoint(accountToken, sessionMode)}/renew`, {
                plan_id: Number(selectedPlan.id),
                server_ids: selectedServerIds,
            }, sessionMode ? getClientAuthConfig() : undefined);
            setPayment(response.data);
            setPaymentHidden(false);
            await loadAccount();
        } catch (error) {
            if (handleSessionError(error, sessionMode, router)) return;
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
            await api.patch(`${getAccountEndpoint(accountToken, sessionMode)}/credentials`, {
                login: credentialLogin.trim(),
                password: credentialPassword,
                current_password: currentPassword,
            }, sessionMode ? getClientAuthConfig() : undefined);
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
            if (handleSessionError(error, sessionMode, router)) return;
            setError(getErrorMessage(error, "Не удалось сохранить данные входа."));
        } finally {
            setCredentialSaving(false);
        }
    }

    function handleAccessAction() {
        if (accessState.targetId === "pending-payment" && payment) {
            setPaymentHidden(false);
            window.setTimeout(() => scrollToSection("pending-payment"), 0);
            return;
        }
        scrollToSection(accessState.targetId);
    }

    async function logout() {
        try { await api.post("/public/account/logout"); } finally {
            clearClientToken();
            clearClientOnboardingToken();
            router.replace("/account");
        }
    }

    if (loading) {
        return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Загрузка кабинета...</div>;
    }

    if (error && !account) {
        return <div className="min-h-screen bg-background"><PublicHeader panelName={settings.panel_name || "DLGTW VPN"} /><main className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><Alert variant="error">{error}</Alert></main></div>;
    }

    const accessTone = getAccessTone(accessState.tone);
    const AccessIcon = accessTone.icon;

    return (
        <div className="min-h-screen bg-background">
            <PublicHeader
                panelName={settings.panel_name || "DLGTW VPN"}
                actions={
                    <div className="flex items-center gap-2">
                        {settings.support_contact && <span className="hidden text-sm text-muted-foreground md:inline">Поддержка: <span className="font-medium text-foreground">{settings.support_contact}</span></span>}
                        {sessionMode && <Button type="button" variant="ghost" onClick={logout}><LogOut />Выйти</Button>}
                    </div>
                }
            />

            <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-9">
                <div className="mb-6"><h1 className="m-0 text-2xl font-semibold">Личный кабинет</h1><p className="mt-1.5 mb-0 text-sm text-muted-foreground">Подписки, подключение и продление VPN-доступа</p></div>
                {error && <Alert variant="error" className="mb-5">{error}</Alert>}

                <section className={`mb-5 grid gap-4 rounded-lg border p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${accessTone.className}`}>
                    <div className="flex size-10 items-center justify-center rounded-md bg-white/70"><AccessIcon className="size-5" /></div>
                    <div className="min-w-0"><div className="text-xs font-semibold uppercase">Состояние доступа</div><h2 className="mt-1 mb-0 text-lg font-semibold">{accessState.title}</h2><p className="mt-1 mb-0 text-sm opacity-85">{accessState.description}</p></div>
                    <Button type="button" onClick={handleAccessAction} className="w-full sm:w-auto">{accessState.actionLabel}</Button>
                </section>

                {payment && !paymentHidden && <PaymentBox payment={payment} onClose={() => setPaymentHidden(true)} />}

                <Card className="mb-5 overflow-hidden">
                    <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
                        <Summary icon={UserRound} label="Клиент" value={account?.client_email} />
                        <Summary icon={CheckCircle2} label="Статус" value={getStatusLabel(account?.status)} />
                        <Summary icon={CalendarDays} label="Активно до" value={formatExpiry(account?.expires_at)} />
                        <Summary icon={ReceiptText} label="Оплачено заказов" value={account?.paid_orders || 0} />
                    </div>
                </Card>

                {!account?.has_password && <Alert className="mb-5">Задайте логин и пароль. После этого входить в кабинет можно будет без длинной персональной ссылки.</Alert>}

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
                    <div className="grid gap-5">
                        <section>
                            <div className="mb-3"><h2 className="m-0 text-base font-semibold">Подписка</h2><p className="mt-1 mb-0 text-sm text-muted-foreground">QR-коды и ссылки для подключения к доступным серверам</p></div>
                            {subscriptions.length === 0 ? (
                                <Card className="flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center"><QrCode className="size-8 text-muted-foreground" /><div className="text-sm font-medium">Подписка ещё не активна</div><div className="text-sm text-muted-foreground">Ссылки появятся после подтверждения оплаты.</div></Card>
                            ) : (
                                <div className="grid gap-4 2xl:grid-cols-2">
                                    {subscriptions.map((subscription) => <SubscriptionCard key={subscription.server_id} subscription={subscription} />)}
                                </div>
                            )}
                        </section>

                        <Card id="renew-access" className="scroll-mt-5 overflow-hidden">
                            <div className="border-b border-border px-5 py-4"><h2 className="m-0 text-base font-semibold">Продлить доступ</h2><p className="mt-1 mb-0 text-sm text-muted-foreground">Выберите тариф и нужные VPN-серверы</p></div>
                            <form onSubmit={submitRenew} className="grid gap-5 p-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {plans.map((plan) => {
                                        const selected = String(plan.id) === String(selectedPlanId);
                                        return (
                                            <button key={plan.id} type="button" onClick={() => selectPlan(plan.id)} className={`min-h-28 rounded-md border p-4 text-left transition-colors ${selected ? "border-primary bg-[#eff4ff] ring-1 ring-primary" : "border-border bg-card hover:border-[#98a2b3]"}`}>
                                                <span className="flex items-start justify-between gap-3"><span className="font-semibold">{plan.name}</span>{selected && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white"><CheckCircle2 className="size-3.5" /></span>}</span>
                                                <span className="mt-2 block text-lg font-semibold text-primary">{formatPrice(plan.price, plan.currency)}</span>
                                                <span className="mt-1 block text-xs text-muted-foreground">{plan.duration_days} дн. · {formatTrafficLimit(plan.traffic_gb)} · {formatServerLimit(plan.server_limit)}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    {servers.map((server) => {
                                        const selected = selectedServerIds.includes(Number(server.id));
                                        const limit = Number(selectedPlan?.server_limit || 1);
                                        const disabled = limit > 1 && selectedServerIds.length >= limit && !selected;
                                        return (
                                            <label key={server.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-[#eff4ff] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
                                                <input type="checkbox" checked={selected} onChange={() => toggleServer(server.id)} disabled={disabled} className="size-4 accent-primary" />
                                                <ServerIcon className="size-4 text-muted-foreground" />
                                                <span className="min-w-0"><span className="block truncate font-medium">{server.name}</span><span className="block truncate text-xs text-muted-foreground">{server.country}</span></span>
                                            </label>
                                        );
                                    })}
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-xs text-muted-foreground">{selectedPlan ? `Выбрано ${selectedServerIds.length} из ${selectedPlan.server_limit} серверов` : "Выберите тариф"}</span>
                                    <Button type="submit" disabled={saving || plans.length === 0}>{saving ? <Loader2 className="animate-spin" /> : <CreditCard />}{saving ? "Создание заказа..." : "Создать заказ на продление"}</Button>
                                </div>
                            </form>
                        </Card>

                        <Card className="overflow-hidden">
                            <div className="border-b border-border px-5 py-4"><h2 className="m-0 text-base font-semibold">История заказов</h2></div>
                            {orders.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Заказов пока нет.</div> : <div className="divide-y divide-border">{orders.map((order) => <OrderHistoryItem key={order.id} order={order} />)}</div>}
                        </Card>
                    </div>

                    <Card className="overflow-hidden xl:sticky xl:top-5">
                        <div className="border-b border-border px-5 py-4"><div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /><h2 className="m-0 text-base font-semibold">Вход в кабинет</h2></div><p className="mt-1 mb-0 text-sm text-muted-foreground">Изменение логина и пароля клиента</p></div>
                        <form onSubmit={submitCredentials} className="grid gap-4 p-5">
                            <Field label="Логин"><Input value={credentialLogin} onChange={(event) => setCredentialLogin(event.target.value)} minLength={3} required autoComplete="username" /></Field>
                            {account?.has_password && <Field label="Текущий пароль"><Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /></Field>}
                            <Field label="Новый пароль"><Input type="password" value={credentialPassword} onChange={(event) => setCredentialPassword(event.target.value)} minLength={6} required autoComplete="new-password" /></Field>
                            <Field label="Повторите пароль"><Input type="password" value={credentialPasswordConfirm} onChange={(event) => setCredentialPasswordConfirm(event.target.value)} minLength={6} required autoComplete="new-password" /></Field>
                            {credentialMessage && <Alert variant="success">{credentialMessage}</Alert>}
                            <Button type="submit" disabled={credentialSaving} className="w-full">{credentialSaving ? <Loader2 className="animate-spin" /> : <Save />}{credentialSaving ? "Сохранение..." : "Сохранить вход"}</Button>
                        </form>
                    </Card>
                </div>
            </main>
        </div>
    );
}

function Summary({ icon: Icon, label, value }) {
    return <div className="min-w-0 p-4 sm:p-5"><Icon className="size-4 text-muted-foreground" /><div className="mt-2 truncate text-sm font-semibold" title={String(value || "-")}>{value || "-"}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div></div>;
}

function SubscriptionCard({ subscription }) {
    return (
        <Card className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
                <div className="min-w-0"><h3 className="m-0 truncate text-base font-semibold">{subscription.server_name}</h3><div className="mt-1 text-xs text-muted-foreground">{subscription.country || "VPN-сервер"}</div></div>
                <Badge variant={isSubscriptionActive(subscription) ? "success" : "warning"}>{isSubscriptionActive(subscription) ? "Активна" : "Не активна"}</Badge>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border"><DetailBox label="Активно до" value={formatExpiry(subscription.expiry)} /><DetailBox label="Трафик" value={formatBytes(subscription.traffic)} /></div>
            {subscription.error && <Alert variant="error" className="m-4">{subscription.error}</Alert>}
            <LinkSection title="VLESS" value={subscription.vless_url} />
            <LinkSection title="Subscription URL" value={subscription.subscription_url} />
        </Card>
    );
}

function LinkSection({ title, value }) {
    const [status, setStatus] = useState("");
    return (
        <div className="grid gap-3 border-t border-border p-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</div><Textarea readOnly value={value || "Ссылка недоступна"} className="min-h-20 font-mono text-[11px] leading-4" /><div className="mt-2 flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={!value} onClick={() => copyText(value, setStatus)}><Copy />Копировать</Button>{status && <span className="text-xs font-medium text-[#067647]">{status}</span>}</div></div>
            <div className="justify-self-center sm:justify-self-end"><QRCodeCanvas value={value} size={132} /></div>
        </div>
    );
}

function PaymentBox({ payment, onClose }) {
    return (
        <Card id="pending-payment" className="mb-5 scroll-mt-5 overflow-hidden border-[#fedf89]">
            <div className="flex items-start justify-between gap-4 border-b border-[#fedf89] bg-[#fffaeb] px-5 py-4"><div><div className="flex items-center gap-2"><CreditCard className="size-4 text-[#b54708]" /><h2 className="m-0 text-base font-semibold">Оплата заказа #{payment.id}</h2></div><p className="mt-1 mb-0 text-sm text-[#b54708]">Переведите указанную сумму и используйте точный комментарий.</p></div><Button type="button" variant="ghost" size="icon" onClick={onClose} title="Скрыть" aria-label="Скрыть"><X /></Button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Тариф" value={payment.plan_name} /><Detail label="Серверы" value={payment.server_names} /><Detail label="Сумма" value={formatPrice(payment.amount, payment.currency)} /><Detail label="Комментарий" value={payment.payment_comment} /></div>
            <div className="grid gap-2 border-t border-border px-5 py-4 text-sm"><div>Номер телефона: <b>{payment.payment_phone || "не указан"}</b></div>{payment.payment_recipient && <div>Получатель: <b>{payment.payment_recipient}</b></div>}{payment.payment_instructions && <p className="m-0 text-muted-foreground">{payment.payment_instructions}</p>}</div>
        </Card>
    );
}

function OrderHistoryItem({ order }) {
    return (
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><div className="font-semibold">Заказ #{order.id}</div><div className="mt-1 text-sm text-muted-foreground">{order.plan_name || "Без тарифа"} · {order.server_names || "Сервер не выбран"}</div>{order.activation_error && <div className="mt-2 text-xs text-[#b42318]">{order.activation_error}</div>}</div>
            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1"><Badge variant={getOrderVariant(order.status)}>{getOrderStatusLabel(order.status)}</Badge><div className="text-sm font-semibold">{formatPrice(order.amount, order.currency)}</div></div>
        </div>
    );
}

function Field({ label, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function Detail({ label, value }) {
    return <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-semibold">{value || "-"}</div></div>;
}

function DetailBox({ label, value }) {
    return <div className="min-w-0 p-3 text-center"><div className="truncate text-sm font-semibold" title={String(value)}>{value}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div></div>;
}

async function copyText(value, setStatus) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); } catch { fallbackCopy(value); }
    setTemporaryStatus(setStatus, "Скопировано.");
}

function setTemporaryStatus(setStatus, message) {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
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
    return sessionMode ? "/public/account/session" : `/public/account/${accountToken}`;
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
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildAccessState(account, subscriptions, orders) {
    const activeSubscriptions = (subscriptions || []).filter(isSubscriptionActive);
    const pendingOrder = (orders || []).find((order) => order.status === "pending");
    if (account?.status === "active") return { title: "Доступ активен", description: `Активно до ${formatExpiry(account.expires_at)}. Доступных серверов: ${activeSubscriptions.length}.`, actionLabel: "Продлить доступ", targetId: "renew-access", tone: "success" };
    if (account?.status === "pending") return { title: "Оплата ожидает подтверждения", description: pendingOrder ? `Заказ #${pendingOrder.id} создан. После перевода оплата будет подтверждена администратором.` : "После перевода оплата будет подтверждена администратором.", actionLabel: "Реквизиты оплаты", targetId: "pending-payment", tone: "warning" };
    if (account?.status === "expired") return { title: "Срок доступа закончился", description: "Выберите тариф и серверы, чтобы снова пользоваться VPN.", actionLabel: "Возобновить доступ", targetId: "renew-access", tone: "danger" };
    return { title: "Доступ ещё не подключён", description: "Выберите подходящий тариф и серверы для первого подключения.", actionLabel: "Выбрать тариф", targetId: "renew-access", tone: "neutral" };
}

function getAccessTone(tone) {
    if (tone === "success") return { className: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]", icon: CheckCircle2 };
    if (tone === "warning") return { className: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]", icon: TriangleAlert };
    if (tone === "danger") return { className: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]", icon: WifiOff };
    return { className: "border-border bg-muted text-foreground", icon: ServerIcon };
}

function getStatusLabel(status) {
    if (status === "active") return "Активна";
    if (status === "pending") return "Ожидает оплаты";
    if (status === "expired") return "Истекла";
    return "Новая";
}

function getOrderStatusLabel(status) {
    if (status === "paid") return "Оплачен";
    if (status === "canceled") return "Отменён";
    if (status === "access") return "Доступ в ЛК";
    return "Ожидает оплаты";
}

function getOrderVariant(status) {
    if (status === "paid") return "success";
    if (status === "canceled") return "destructive";
    if (status === "access") return "default";
    return "warning";
}

function isSubscriptionActive(subscription) {
    if (!subscription.enabled) return false;
    const expiry = Number(subscription.expiry || 0);
    return expiry === 0 || expiry > Date.now();
}

function formatExpiry(value) {
    const timestamp = Number(value || 0);
    return timestamp ? new Date(timestamp).toLocaleDateString("ru-RU") : "Без срока";
}

function formatPrice(value, currency) {
    return `${Number(value || 0).toLocaleString("ru-RU")} ${currency || "RUB"}`;
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    return bytes ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : "0 GB";
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
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}
