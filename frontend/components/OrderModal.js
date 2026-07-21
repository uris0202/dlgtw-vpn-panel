"use client";

import { useEffect, useState } from "react";
import { Loader2, Server, X } from "lucide-react";

import { selectServersForPlan } from "../lib/serverSelection";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input, Select, Textarea } from "./ui/input";

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
        if (!open) return;

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
        setSelectedServerIds(firstPlan ? selectServersForPlan([], servers, firstPlan.server_limit) : []);
        setPlanId(firstPlan ? String(firstPlan.id) : "");
        setDurationDays(String(firstPlan?.duration_days ?? 30));
        setTrafficGb(String(firstPlan?.traffic_gb ?? 0));
        setAmount(String(firstPlan?.price ?? 0));
        setCurrency(firstPlan?.currency || "RUB");
        setStatus("pending");
        setNote("");
        setFormError("");
    }, [open, isEdit, order, plans, servers]);

    if (!open) return null;

    const selectedPlan = plans.find((item) => String(item.id) === String(planId));
    const isAccessStatus = status === "access";
    const selectedPlanServerLimit = selectedPlan ? Number(selectedPlan.server_limit || 1) : null;

    function selectPlan(value) {
        setPlanId(String(value));
        const plan = plans.find((item) => String(item.id) === String(value));
        if (!plan) return;

        setDurationDays(String(plan.duration_days ?? 30));
        setTrafficGb(String(plan.traffic_gb ?? 0));
        setAmount(String(plan.price ?? 0));
        setCurrency(plan.currency || "RUB");
        setSelectedServerIds((current) => selectServersForPlan(current, servers, Number(plan.server_limit || 1)));
    }

    function toggleServer(serverId) {
        const normalizedServerId = Number(serverId);
        setSelectedServerIds((current) => {
            if (current.includes(normalizedServerId)) {
                return current.filter((item) => item !== normalizedServerId);
            }
            if (selectedPlanServerLimit && current.length >= selectedPlanServerLimit) {
                return selectedPlanServerLimit === 1 ? [normalizedServerId] : current;
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
            setNote((current) => current || "Доступ в ЛК для существующего клиента.");
            return;
        }
        if (!planId && plans[0]) selectPlan(plans[0].id);
    }

    function submit(event) {
        event.preventDefault();
        setFormError("");

        const plan = plans.find((item) => String(item.id) === String(planId));
        if (status !== "access" && !plan) {
            setFormError("Выберите тариф для заказа.");
            return;
        }
        if (status !== "access" && selectedPlanServerLimit && selectedServerIds.length !== selectedPlanServerLimit) {
            setFormError(`По выбранному тарифу нужно выбрать серверов: ${selectedPlanServerLimit}.`);
            return;
        }

        onSave({
            client_email: clientEmail.trim(),
            customer_contact: customerContact.trim(),
            server_id: selectedServerIds[0] || null,
            server_ids: selectedPlanServerLimit ? selectedServerIds.slice(0, selectedPlanServerLimit) : selectedServerIds,
            plan_id: planId ? Number(planId) : null,
            plan_name: plan?.name || order?.plan_name || "",
            duration_days: Number(durationDays),
            traffic_gb: Number(trafficGb),
            amount: Number(amount),
            currency: currency.trim().toUpperCase(),
            status,
            note: note.trim(),
        });
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
            onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
        >
            <form
                onSubmit={submit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="order-modal-title"
                className="max-h-[96vh] w-full overflow-y-auto rounded-t-lg bg-card shadow-2xl sm:max-w-3xl sm:rounded-lg"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
                    <div>
                        <h2 id="order-modal-title" className="m-0 text-lg font-semibold">
                            {isEdit ? "Редактирование заказа" : "Новый заказ"}
                        </h2>
                        <p className="mt-1 mb-0 text-sm text-muted-foreground">Клиент, тариф и серверы для выдачи доступа</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={saving} aria-label="Закрыть" title="Закрыть">
                        <X />
                    </Button>
                </div>

                <div className="grid gap-5 px-5 py-5 sm:px-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Клиент">
                            <Input value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="Имя клиента / псевдоним" required disabled={saving} autoFocus />
                        </Field>
                        <Field label="Контакт клиента" optional>
                            <Input value={customerContact} onChange={(event) => setCustomerContact(event.target.value)} placeholder="Telegram или телефон" disabled={saving} />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                        <Field label="Тариф">
                            <Select value={planId} onChange={(event) => selectPlan(event.target.value)} disabled={saving || isAccessStatus} required={!isAccessStatus}>
                                {isAccessStatus ? <option value="">Тариф не нужен для доступа в ЛК</option> : <option value="" disabled>Выберите тариф</option>}
                                {plans.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} · {formatServerLimit(plan.server_limit)} · {formatPrice(plan.price, plan.currency)}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Статус">
                            <Select value={status} onChange={(event) => changeStatus(event.target.value)} disabled={saving}>
                                <option value="pending">Ожидает оплаты</option>
                                <option value="paid">Оплачен</option>
                                <option value="canceled">Отменён</option>
                                <option value="access">Доступ в ЛК</option>
                            </Select>
                        </Field>
                    </div>

                    <fieldset className="grid gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <legend className="text-sm font-medium">VPN-серверы</legend>
                            {selectedPlanServerLimit && <Badge variant="outline">Выбрано {selectedServerIds.length} из {selectedPlanServerLimit}</Badge>}
                        </div>
                        <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
                            {servers.length === 0 && <div className="text-sm text-muted-foreground">Серверы пока не добавлены.</div>}
                            {servers.map((server) => {
                                const disabled = saving || (!selectedPlan && !isAccessStatus) || isServerDisabled(Number(server.id), selectedServerIds, selectedPlanServerLimit);
                                return (
                                    <label key={server.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-[#eff4ff] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55">
                                        <input type="checkbox" checked={selectedServerIds.includes(Number(server.id))} onChange={() => toggleServer(server.id)} disabled={disabled} className="size-4 accent-primary" />
                                        <Server className="size-4 text-muted-foreground" />
                                        <span className="min-w-0 truncate">{server.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {!selectedPlan && !isAccessStatus && <p className="m-0 text-xs text-muted-foreground">Сначала выберите тариф.</p>}
                    </fieldset>

                    <div className="grid gap-4 sm:grid-cols-4">
                        <Field label="Срок, дней">
                            <Input type="number" min="0" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required disabled={saving || Boolean(planId) || isAccessStatus} />
                        </Field>
                        <Field label="Трафик, GB">
                            <Input type="number" min="0" value={trafficGb} onChange={(event) => setTrafficGb(event.target.value)} required disabled={saving || Boolean(planId) || isAccessStatus} />
                        </Field>
                        <Field label="Сумма">
                            <Input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={saving || Boolean(planId) || isAccessStatus} />
                        </Field>
                        <Field label="Валюта">
                            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={saving || Boolean(planId) || isAccessStatus}>
                                <option value="RUB">RUB</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="KZT">KZT</option>
                            </Select>
                        </Field>
                    </div>

                    <Field label="Комментарий" optional>
                        <Textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} rows={3} />
                    </Field>

                    {(error || formError) && <Alert variant="error">{error || formError}</Alert>}
                </div>

                <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-5 py-4 sm:px-6">
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
                    <Button type="submit" disabled={saving}>
                        {saving && <Loader2 className="animate-spin" />}
                        {saving ? "Сохранение..." : "Сохранить"}
                    </Button>
                </div>
            </form>
        </div>
    );
}

function Field({ label, optional = false, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}{optional && <span className="ml-1 font-normal text-muted-foreground">(необязательно)</span>}</span>{children}</label>;
}

function formatPrice(price, currency) {
    const value = Number(price || 0);
    return value === 0 ? "бесплатно" : `${value.toLocaleString("ru-RU")} ${currency || "RUB"}`;
}

function getOrderServerIds(order) {
    if (Array.isArray(order.server_ids) && order.server_ids.length > 0) return order.server_ids.map(Number);
    return order.server_id ? [Number(order.server_id)] : [];
}

function formatServerLimit(value) {
    const count = Number(value || 1);
    return count === 1 ? "1 сервер" : `${count} сервера`;
}

function isServerDisabled(serverId, selectedServerIds, selectedPlanServerLimit) {
    if (!selectedPlanServerLimit || selectedPlanServerLimit === 1) return false;
    return selectedServerIds.length >= selectedPlanServerLimit && !selectedServerIds.includes(serverId);
}
