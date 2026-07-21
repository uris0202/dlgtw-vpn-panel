"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    Check,
    Copy,
    CreditCard,
    ExternalLink,
    Loader2,
    Server as ServerIcon,
    ShoppingCart,
    UserRound,
} from "lucide-react";

import PublicHeader from "../../components/PublicHeader";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";
import { selectServersForPlan } from "../../lib/serverSelection";

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

    useEffect(() => { loadCheckout(); }, []);

    const selectedPlan = useMemo(() => plans.find((plan) => String(plan.id) === String(selectedPlanId)), [plans, selectedPlanId]);
    const selectedServerNames = useMemo(() => servers.filter((server) => selectedServerIds.includes(Number(server.id))).map((server) => server.name), [servers, selectedServerIds]);

    async function loadCheckout() {
        setError("");
        try {
            const savedAccountToken = localStorage.getItem(ACCOUNT_TOKEN_STORAGE_KEY) || "";
            const savedRequestId = getOrCreateRequestId();
            const response = await api.get("/public/checkout");
            const loadedPlans = response.data.plans || [];
            const loadedServers = response.data.servers || [];
            setSettings(response.data.settings || {});
            setPlans(loadedPlans);
            setServers(loadedServers);
            setRequestId(savedRequestId);
            const firstPlan = loadedPlans[0];
            if (firstPlan) {
                setSelectedPlanId(String(firstPlan.id));
                setSelectedServerIds(selectServersForPlan([], loadedServers, firstPlan.server_limit));
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

    async function submitOrder(event) {
        event.preventDefault();
        if (accountRestoring) return;
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
            const response = await api.post("/public/orders", {
                client_email: clientEmail.trim(),
                customer_contact: customerContact.trim(),
                request_id: requestId || getOrCreateRequestId(),
                plan_id: Number(selectedPlan.id),
                server_ids: selectedServerIds,
            });
            setOrder(response.data);
            if (response.data.account_token) {
                localStorage.setItem(ACCOUNT_TOKEN_STORAGE_KEY, response.data.account_token);
                setExistingAccountToken(response.data.account_token);
            }
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось создать заказ."));
        } finally {
            setSaving(false);
        }
    }

    async function copyPaymentValue(value, field) {
        if (!value) return;
        try { await navigator.clipboard.writeText(String(value)); } catch { fallbackCopy(String(value)); }
        setCopyStatus(field);
        window.setTimeout(() => setCopyStatus(""), 1800);
    }

    if (loading) {
        return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Загрузка тарифов...</div>;
    }

    if (order) {
        return (
            <div className="min-h-screen bg-background">
                <PublicHeader panelName={settings?.panel_name || "DLGTW VPN"} />
                <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
                    <div className="mb-6 flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#ecfdf3] text-[#067647]"><Check className="size-5" /></div>
                        <div><h1 className="m-0 text-2xl font-semibold">Заказ #{order.id} создан</h1><p className="mt-1.5 mb-0 text-sm text-muted-foreground">Переведите указанную сумму. После подтверждения платежа доступ будет выдан автоматически.</p></div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <Card className="overflow-hidden">
                            <div className="border-b border-border px-5 py-4"><h2 className="m-0 text-base font-semibold">Оплата переводом</h2><p className="mt-1 mb-0 text-sm text-muted-foreground">Используйте точный комментарий, чтобы мы нашли платёж.</p></div>
                            <div className="grid gap-3 p-5">
                                <PaymentValue label="Номер телефона" value={order.payment_phone || "не указан"} copied={copyStatus === "phone"} onCopy={order.payment_phone ? () => copyPaymentValue(order.payment_phone, "phone") : null} />
                                <PaymentValue label="Сумма перевода" value={formatPrice(order.amount, order.currency)} copied={copyStatus === "amount"} onCopy={() => copyPaymentValue(order.amount, "amount")} />
                                <PaymentValue label="Комментарий" value={order.payment_comment} copied={copyStatus === "comment"} onCopy={() => copyPaymentValue(order.payment_comment, "comment")} />
                                {order.payment_recipient && <div className="text-sm text-muted-foreground">Получатель: <span className="font-medium text-foreground">{order.payment_recipient}</span></div>}
                                {order.payment_instructions && <Alert>{order.payment_instructions}</Alert>}
                                {order.support_contact && <div className="text-sm text-muted-foreground">Поддержка: <span className="font-medium text-foreground">{order.support_contact}</span></div>}
                            </div>
                        </Card>

                        <div className="grid content-start gap-4">
                            <Card className="p-5">
                                <h2 className="m-0 text-base font-semibold">Ваш заказ</h2>
                                <div className="mt-4 grid gap-3">
                                    <Detail label="Тариф" value={order.plan_name} />
                                    <Detail label="Серверы" value={order.server_names} />
                                    <Detail label="Сумма" value={formatPrice(order.amount, order.currency)} />
                                </div>
                            </Card>
                            {order.account_token && (
                                <Card className="p-5">
                                    <div className="flex items-center gap-2 font-semibold"><UserRound className="size-4 text-primary" />Личный кабинет</div>
                                    <p className="mt-2 mb-4 text-sm leading-5 text-muted-foreground">Отслеживайте оплату, получите VPN-ссылки и задайте постоянный логин.</p>
                                    <Button asChild className="w-full"><Link href={buildAccountUrl(order.account_token)}>Открыть кабинет <ExternalLink /></Link></Button>
                                </Card>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const submitDisabled = saving || accountRestoring || plans.length === 0;

    return (
        <div className="min-h-screen bg-background">
            <PublicHeader panelName={settings?.panel_name || "DLGTW VPN"} />
            <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-9">
                <div className="mb-6"><h1 className="m-0 text-2xl font-semibold">Купить VPN</h1><p className="mt-1.5 mb-0 text-sm text-muted-foreground">Выберите тариф и серверы, затем создайте заявку на подключение.</p></div>

                <div className="mb-5 grid gap-3">
                    {error && <Alert variant="error">{error}</Alert>}
                    {existingAccountToken && <Alert variant="info">У вас уже есть личный кабинет. <Link href={buildAccountUrl(existingAccountToken)} className="font-medium underline">Открыть кабинет</Link></Alert>}
                    {accountRestoring && <Alert>Проверяем предыдущий заказ...</Alert>}
                </div>

                <form onSubmit={submitOrder} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                    <Card className="overflow-hidden">
                        <CheckoutSection number="1" title="Тариф">
                            {plans.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Сейчас нет доступных тарифов.</div> : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {plans.map((plan) => {
                                        const selected = String(plan.id) === String(selectedPlanId);
                                        return (
                                            <button key={plan.id} type="button" onClick={() => selectPlan(plan.id)} className={`min-h-32 rounded-md border p-4 text-left transition-colors ${selected ? "border-primary bg-[#eff4ff] ring-1 ring-primary" : "border-border bg-card hover:border-[#98a2b3]"}`}>
                                                <span className="flex items-start justify-between gap-3"><span className="font-semibold">{plan.name}</span>{selected && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white"><Check className="size-3.5" /></span>}</span>
                                                <span className="mt-3 block text-xl font-semibold text-primary">{formatPrice(plan.price, plan.currency)}</span>
                                                <span className="mt-1.5 block text-xs text-muted-foreground">{plan.duration_days} дн. · {formatTraffic(plan.traffic_gb)} · {formatServerLimit(plan.server_limit)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </CheckoutSection>

                        <CheckoutSection number="2" title="VPN-серверы">
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
                            {selectedPlan && <div className="mt-3 text-xs text-muted-foreground">Выбрано {selectedServerIds.length} из {selectedPlan.server_limit} серверов.</div>}
                        </CheckoutSection>

                        <CheckoutSection number="3" title="Данные клиента" last>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Имя клиента / псевдоним">
                                    <Input value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} required autoComplete="off" placeholder="Например: alex" />
                                </Field>
                                <Field label="Контакт для связи">
                                    <Input value={customerContact} onChange={(event) => setCustomerContact(event.target.value)} required placeholder="Telegram или телефон" />
                                </Field>
                            </div>
                        </CheckoutSection>
                    </Card>

                    <Card className="p-5 lg:sticky lg:top-5">
                        <div className="flex items-center gap-2"><ShoppingCart className="size-4 text-primary" /><h2 className="m-0 text-base font-semibold">Ваш заказ</h2></div>
                        <div className="mt-4 grid gap-4">
                            <Detail label="Тариф" value={selectedPlan?.name || "Не выбран"} />
                            <Detail label="Серверы" value={selectedServerNames.length > 0 ? selectedServerNames.join(", ") : "Не выбраны"} />
                            <div className="border-t border-border pt-4"><div className="text-xs text-muted-foreground">К оплате</div><div className="mt-1 text-2xl font-semibold">{selectedPlan ? formatPrice(selectedPlan.price, selectedPlan.currency) : "-"}</div></div>
                            <Button type="submit" size="lg" disabled={submitDisabled} className="w-full">
                                {saving || accountRestoring ? <Loader2 className="animate-spin" /> : <CreditCard />}
                                {saving ? "Создание заказа..." : accountRestoring ? "Проверка заказа..." : "Перейти к оплате"}
                            </Button>
                        </div>
                    </Card>
                </form>
            </main>
        </div>
    );
}

function CheckoutSection({ number, title, children, last = false }) {
    return <section className={`px-5 py-5 sm:px-6 ${last ? "" : "border-b border-border"}`}><div className="mb-4 flex items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-white">{number}</span><h2 className="m-0 text-base font-semibold">{title}</h2></div>{children}</section>;
}

function Field({ label, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function Detail({ label, value }) {
    return <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-semibold">{value || "-"}</div></div>;
}

function PaymentValue({ label, value, copied, onCopy }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-3">
            <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 break-words text-sm font-semibold">{value || "-"}</div></div>
            <Button type="button" variant="outline" size="sm" disabled={!onCopy} onClick={onCopy || undefined}><Copy />{copied ? "Скопировано" : "Копировать"}</Button>
        </div>
    );
}

function getOrCreateRequestId() {
    const currentRequestId = localStorage.getItem(REQUEST_ID_STORAGE_KEY);
    if (currentRequestId) return currentRequestId;
    const requestId = createRequestId();
    localStorage.setItem(REQUEST_ID_STORAGE_KEY, requestId);
    return requestId;
}

function createRequestId() {
    return typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    return `${Number(value || 0).toLocaleString("ru-RU")} ${currency || "RUB"}`;
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
    return typeof window === "undefined" ? `/account/${accountToken}` : `${window.location.origin}/account/${accountToken}`;
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}
