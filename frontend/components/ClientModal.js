"use client";

import { useEffect, useState } from "react";
import {
    Save,
    UserPlus,
    X,
} from "lucide-react";

import { selectServersForPlan } from "../lib/serverSelection";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/input";

export default function ClientModal({
    open,
    mode = "create",
    client,
    groupOptions = [],
    serverOptions = [],
    planOptions = [],
    currentServerId = null,
    defaultSettings = {},
    error,
    saving,
    onClose,
    onSave,
}) {

    const isEdit = mode === "edit";

    const [email, setEmail] = useState("");
    const [inboundId, setInboundId] = useState("1");
    const [selectedServerIds, setSelectedServerIds] = useState([]);
    const [selectedPlanId, setSelectedPlanId] = useState("");
    const [group, setGroup] = useState("");
    const [comment, setComment] = useState("");
    const [days, setDays] = useState("30");
    const [totalGB, setTotalGB] = useState("0");
    const [enabled, setEnabled] = useState(true);

    const groupChoices = group
        ? Array.from(new Set([...groupOptions, group]))
        : groupOptions;
    const selectedPlan = planOptions.find((item) => String(item.id) === String(selectedPlanId));
    const selectedPlanServerLimit = selectedPlan
        ? Number(selectedPlan.server_limit || 1)
        : null;

    useEffect(() => {

        if (!open) {
            return;
        }

        if (isEdit && client) {
            setEmail(client.email || "");
            setInboundId("1");
            setSelectedServerIds(currentServerId ? [Number(currentServerId)] : []);
            setSelectedPlanId("");
            setGroup(client.group || "");
            setComment(client.comment || "");
            setDays("");
            setTotalGB("");
            setEnabled(Boolean(client.enabled));
            return;
        }

        setEmail("");
        setInboundId(String(defaultSettings.default_inbound_id ?? 1));
        setSelectedServerIds(getDefaultServerIds(serverOptions, currentServerId));
        setSelectedPlanId("");
        setGroup("");
        setComment("");
        setDays(String(defaultSettings.default_client_days ?? 30));
        setTotalGB(String(defaultSettings.default_traffic_gb ?? 0));
        setEnabled(true);

    }, [open, isEdit, client, serverOptions, currentServerId, defaultSettings]);

    if (!open) {
        return null;
    }

    function handleSubmit(event) {

        event.preventDefault();

        const payload = {
            group: group.trim(),
            comment: comment.trim(),
            days: days === "" ? null : Number(days),
            total_gb: totalGB === "" ? null : Number(totalGB),
        };

        if (isEdit) {
            payload.email = email.trim();
            payload.enable = enabled;
        } else {
            payload.email = email.trim();
            payload.inbound_id = inboundId === ""
                ? Number(defaultSettings.default_inbound_id ?? 1)
                : Number(inboundId);
            payload.server_ids = selectedPlanServerLimit
                ? selectedServerIds.slice(0, selectedPlanServerLimit)
                : selectedServerIds;
            payload.days = days === ""
                ? Number(defaultSettings.default_client_days ?? 30)
                : Number(days);
            payload.total_gb = totalGB === ""
                ? Number(defaultSettings.default_traffic_gb ?? 0)
                : Number(totalGB);
        }

        onSave(payload);

    }

    function toggleServer(serverId) {

        const normalizedServerId = Number(serverId);

        setSelectedServerIds((current) => {

            if (current.includes(normalizedServerId)) {
                if (current.length === 1) {
                    return current;
                }

                return current.filter((item) => item !== normalizedServerId);
            }

            if (selectedPlanServerLimit && current.length >= selectedPlanServerLimit) {
                if (selectedPlanServerLimit === 1) {
                    return [normalizedServerId];
                }

                return current;
            }

            return [...current, normalizedServerId];

        });

    }

    function selectPlan(planId) {

        setSelectedPlanId(planId);

        const plan = planOptions.find((item) => String(item.id) === String(planId));

        if (!plan) {
            return;
        }

        setDays(String(plan.duration_days ?? defaultSettings.default_client_days ?? 30));
        setTotalGB(String(plan.traffic_gb ?? defaultSettings.default_traffic_gb ?? 0));
        setSelectedServerIds((current) =>
            selectServersForPlan(
                current,
                serverOptions,
                Number(plan.server_limit || 1),
            )
        );

    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
            <form
                onSubmit={handleSubmit}
                className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card shadow-2xl"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#eff4ff] text-primary">
                            <UserPlus className="size-4" />
                        </div>
                        <div>
                            <h2 className="m-0 text-base font-semibold">{isEdit ? "Редактирование клиента" : "Новый клиент"}</h2>
                            <p className="mt-1 mb-0 text-xs text-muted-foreground">Параметры доступа к VPN и срок действия</p>
                        </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={saving} title="Закрыть" aria-label="Закрыть"><X /></Button>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2">
                    <Field label="Имя клиента / псевдоним" className="sm:col-span-2">
                        <Input type="text" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} required autoComplete="off" placeholder="Например: testing" />
                    </Field>

                    {!isEdit && (
                        <>
                            {planOptions.length > 0 && (
                                <Field label="Тариф" className="sm:col-span-2">
                                    <Select value={selectedPlanId} onChange={(event) => selectPlan(event.target.value)} disabled={saving}>
                                        <option value="">Без тарифа</option>
                                        {planOptions.map((plan) => (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name} · {formatServerLimit(plan.server_limit)} · {plan.duration_days} дн. · {plan.traffic_gb > 0 ? `${plan.traffic_gb} GB` : "без лимита"} · {formatPlanPrice(plan)}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            )}

                            <Field label="VPN-серверы" className="sm:col-span-2">
                                <div className="grid gap-2 rounded-md border border-border bg-[#f8f9fb] p-3 sm:grid-cols-2">
                                    {serverOptions.map((server) => (
                                        <CheckRow key={server.id} disabled={saving || isServerDisabled(Number(server.id), selectedServerIds, selectedPlanServerLimit)}>
                                            <input
                                                type="checkbox"
                                                checked={selectedServerIds.includes(Number(server.id))}
                                                onChange={() => toggleServer(server.id)}
                                                disabled={saving || isServerDisabled(Number(server.id), selectedServerIds, selectedPlanServerLimit)}
                                                className="size-4 accent-[#155eef]"
                                            />
                                            {server.name}
                                        </CheckRow>
                                    ))}
                                </div>
                                {selectedPlanServerLimit && <span className="text-xs font-normal text-muted-foreground">По тарифу доступно серверов: {selectedPlanServerLimit}.</span>}
                            </Field>

                            <Field label="Inbound ID в 3X-UI" className="sm:col-span-2">
                                <Input type="number" min="1" value={inboundId} onChange={(event) => setInboundId(event.target.value)} disabled={saving} required placeholder={String(defaultSettings.default_inbound_id ?? 1)} />
                                <span className="text-xs font-normal text-muted-foreground">Обычно 1, если на сервере один VLESS inbound.</span>
                            </Field>
                        </>
                    )}

                    <Field label="Группа" className="sm:col-span-2">
                        <div className="grid gap-2 rounded-md border border-border bg-[#f8f9fb] p-3 sm:grid-cols-2">
                            <CheckRow>
                                <input
                                    type="checkbox"
                                    checked={group === ""}
                                    onChange={(event) => event.target.checked && setGroup("")}
                                    disabled={saving}
                                    className="size-4 accent-[#155eef]"
                                />
                                Без группы
                            </CheckRow>
                            {groupChoices.length === 0 && <div className="text-xs font-normal text-muted-foreground">Существующих групп пока нет.</div>}
                            {groupChoices.map((option) => (
                                <CheckRow key={option}>
                                    <input
                                        type="checkbox"
                                        checked={group === option}
                                        onChange={(event) => setGroup(event.target.checked ? option : "")}
                                        disabled={saving}
                                        className="size-4 accent-[#155eef]"
                                    />
                                    {option}
                                </CheckRow>
                            ))}
                        </div>
                    </Field>

                    <Field label="Комментарий" className="sm:col-span-2">
                        <Input value={comment} onChange={(event) => setComment(event.target.value)} disabled={saving} />
                    </Field>
                    <Field label={isEdit ? "Продлить на дней" : "Срок действия, дней"}>
                        <Input type="number" min="0" value={days} onChange={(event) => setDays(event.target.value)} disabled={saving} placeholder={isEdit ? "Не менять" : String(defaultSettings.default_client_days ?? 30)} />
                    </Field>
                    <Field label="Лимит трафика, GB">
                        <Input type="number" min="0" value={totalGB} onChange={(event) => setTotalGB(event.target.value)} disabled={saving} placeholder={isEdit ? "Не менять" : String(defaultSettings.default_traffic_gb ?? 0)} />
                    </Field>

                    {isEdit && (
                        <CheckRow className="sm:col-span-2">
                            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={saving} className="size-4 accent-[#155eef]" />
                            Клиент включён
                        </CheckRow>
                    )}

                    {error && <Alert variant="error" className="sm:col-span-2">{error}</Alert>}
                </div>

                <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-5 py-4">
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
                    <Button type="submit" disabled={saving}><Save />{saving ? "Сохранение..." : "Сохранить"}</Button>
                </div>
            </form>
        </div>
    );

}

function Field({ label, className = "", children }) {
    return (
        <label className={`grid gap-1.5 text-sm font-medium ${className}`}>
            <span>{label}</span>
            {children}
        </label>
    );
}

function CheckRow({ className = "", disabled = false, children }) {
    return (
        <label className={`flex min-h-8 items-center gap-2 text-sm font-normal ${disabled ? "text-muted-foreground" : ""} ${className}`}>
            {children}
        </label>
    );
}

function getDefaultServerIds(serverOptions, currentServerId) {

    if (currentServerId) {
        return [Number(currentServerId)];
    }

    if (serverOptions.length > 0) {
        return [Number(serverOptions[0].id)];
    }

    return [];

}

function formatPlanPrice(plan) {

    if (!plan.price) {
        return "бесплатно";
    }

    return `${Number(plan.price).toLocaleString("ru-RU")} ${plan.currency || "RUB"}`;

}

function formatServerLimit(value) {

    const count = Number(value || 1);

    if (count === 1) {
        return "1 сервер";
    }

    return `${count} сервера`;

}

function isServerDisabled(serverId, selectedServerIds, selectedPlanServerLimit) {

    if (!selectedPlanServerLimit) {
        return false;
    }

    if (selectedPlanServerLimit === 1) {
        return false;
    }

    return (
        selectedServerIds.length >= selectedPlanServerLimit
        && !selectedServerIds.includes(serverId)
    );

}

const label = {
    display: "block",
    marginBottom: 5,
    fontSize: 14,
    fontWeight: 600,
};

const input = {
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 15,
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
    fontSize: 14,
};

const groupBox = {
    display: "grid",
    gap: 8,
    marginBottom: 15,
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#f9fafb",
};

const checkboxRow = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
};

const emptyGroups = {
    color: "#6b7280",
    fontSize: 13,
};

const fieldHint = {
    marginTop: -8,
    marginBottom: 15,
    color: "#6b7280",
    fontSize: 13,
};

const primaryButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
};

const secondaryButton = {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    cursor: "pointer",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};
