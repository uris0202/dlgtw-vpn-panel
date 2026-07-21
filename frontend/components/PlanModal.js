"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input, Select, Textarea } from "./ui/input";

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
        if (!open) return;

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

    if (!open) return null;

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
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
            onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
        >
            <form
                onSubmit={submit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="plan-modal-title"
                className="max-h-[94vh] w-full overflow-y-auto rounded-t-lg bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
                    <div>
                        <h2 id="plan-modal-title" className="m-0 text-lg font-semibold">
                            {isEdit ? "Редактирование тарифа" : "Новый тариф"}
                        </h2>
                        <p className="mt-1 mb-0 text-sm text-muted-foreground">
                            Цена, срок и количество доступных VPN-серверов
                        </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={saving} aria-label="Закрыть" title="Закрыть">
                        <X />
                    </Button>
                </div>

                <div className="grid gap-5 px-5 py-5 sm:px-6">
                    <Field label="Название">
                        <Input value={name} onChange={(event) => setName(event.target.value)} required disabled={saving} autoFocus />
                    </Field>

                    <Field label="Описание" optional>
                        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} rows={3} />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Срок, дней">
                            <Input type="number" min="0" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required disabled={saving} />
                        </Field>
                        <Field label="Трафик, GB">
                            <Input type="number" min="0" value={trafficGb} onChange={(event) => setTrafficGb(event.target.value)} required disabled={saving} />
                        </Field>
                        <Field label="VPN-серверов">
                            <Input type="number" min="1" value={serverLimit} onChange={(event) => setServerLimit(event.target.value)} required disabled={saving} />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Цена">
                            <Input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} required disabled={saving} />
                        </Field>
                        <Field label="Валюта">
                            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={saving}>
                                <option value="RUB">RUB</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="KZT">KZT</option>
                            </Select>
                        </Field>
                    </div>

                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
                        <input
                            type="checkbox"
                            checked={isActive}
                            onChange={(event) => setIsActive(event.target.checked)}
                            disabled={saving}
                            className="size-4 accent-primary"
                        />
                        Активен для продажи
                    </label>

                    {error && <Alert variant="error">{error}</Alert>}
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
    return (
        <label className="grid gap-1.5">
            <span className="text-sm font-medium">
                {label}
                {optional && <span className="ml-1 font-normal text-muted-foreground">(необязательно)</span>}
            </span>
            {children}
        </label>
    );
}
