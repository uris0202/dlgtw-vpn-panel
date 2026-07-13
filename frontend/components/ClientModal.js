"use client";

import { useEffect, useState } from "react";

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
            limitServerSelection(
                current,
                serverOptions,
                currentServerId,
                Number(plan.server_limit || 1),
            )
        );

    }

    return (

        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
                padding: 20,
            }}
        >

            <form
                onSubmit={handleSubmit}
                style={{
                    width: "100%",
                    maxWidth: 460,
                    background: "#fff",
                    borderRadius: 12,
                    padding: 25,
                    boxShadow: "0 10px 35px rgba(0,0,0,.25)",
                }}
            >

                <h2 style={{ marginTop: 0, marginBottom: 20 }}>
                    {isEdit ? "Редактирование клиента" : "Новый клиент"}
                </h2>

                <label style={label}>Имя клиента / псевдоним</label>

                <input
                    type="text"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={saving}
                    required
                    autoComplete="off"
                    placeholder="Например: testing"
                    style={input}
                />

                {!isEdit && (
                    <>
                        {planOptions.length > 0 && (
                            <>
                                <label style={label}>Тариф</label>

                                <select
                                    value={selectedPlanId}
                                    onChange={(event) => selectPlan(event.target.value)}
                                    disabled={saving}
                                    style={input}
                                >
                                    <option value="">Без тарифа</option>
                                    {planOptions.map((plan) => (
                                        <option
                                            key={plan.id}
                                            value={plan.id}
                                        >
                                            {plan.name} · {formatServerLimit(plan.server_limit)} · {plan.duration_days} дн. · {plan.traffic_gb > 0 ? `${plan.traffic_gb} GB` : "без лимита"} · {formatPlanPrice(plan)}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}

                        <label style={label}>VPN-серверы</label>

                        <div style={groupBox}>

                            {serverOptions.map((server) => (
                                <label
                                    key={server.id}
                                    style={checkboxRow}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedServerIds.includes(Number(server.id))}
                                        onChange={() => toggleServer(server.id)}
                                        disabled={saving || isServerDisabled(
                                            Number(server.id),
                                            selectedServerIds,
                                            selectedPlanServerLimit,
                                        )}
                                    />

                                    {server.name}
                                </label>
                            ))}

                        </div>

                        {selectedPlanServerLimit && (
                            <div style={fieldHint}>
                                По выбранному тарифу можно выбрать серверов: {selectedPlanServerLimit}.
                            </div>
                        )}

                        <label style={label}>Inbound ID в 3X-UI</label>

                        <input
                            type="number"
                            min="1"
                            value={inboundId}
                            onChange={(event) => setInboundId(event.target.value)}
                            disabled={saving}
                            required
                            placeholder={String(defaultSettings.default_inbound_id ?? 1)}
                            style={input}
                        />

                        <div style={fieldHint}>
                            Обычно это 1, если на выбранном 3X-UI сервере один VLESS inbound.
                        </div>
                    </>
                )}

                <label style={label}>Группа</label>

                <div style={groupBox}>

                    <label style={checkboxRow}>
                        <input
                            type="checkbox"
                            checked={group === ""}
                            onChange={(event) => {
                                if (event.target.checked) {
                                    setGroup("");
                                }
                            }}
                            disabled={saving}
                        />

                        Без группы
                    </label>

                    {groupChoices.length === 0 && (
                        <div style={emptyGroups}>
                            Существующих групп пока нет.
                        </div>
                    )}

                    {groupChoices.map((option) => (
                        <label
                            key={option}
                            style={checkboxRow}
                        >
                            <input
                                type="checkbox"
                                checked={group === option}
                                onChange={(event) => {
                                    setGroup(event.target.checked ? option : "");
                                }}
                                disabled={saving}
                            />

                            {option}
                        </label>
                    ))}

                </div>

                <label style={label}>Комментарий</label>

                <input
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    disabled={saving}
                    style={input}
                />

                <label style={label}>
                    {isEdit ? "Продлить на дней" : "Срок действия, дней"}
                </label>

                <input
                    type="number"
                    min="0"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                    disabled={saving}
                    placeholder={isEdit ? "Не менять" : String(defaultSettings.default_client_days ?? 30)}
                    style={input}
                />

                <label style={label}>Лимит трафика, GB</label>

                <input
                    type="number"
                    min="0"
                    value={totalGB}
                    onChange={(event) => setTotalGB(event.target.value)}
                    disabled={saving}
                    placeholder={isEdit ? "Не менять" : String(defaultSettings.default_traffic_gb ?? 0)}
                    style={input}
                />

                {isEdit && (
                    <label
                        style={{
                            display: "flex",
                            gap: 10,
                            marginTop: 15,
                            alignItems: "center",
                        }}
                    >

                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => setEnabled(event.target.checked)}
                            disabled={saving}
                        />

                        Включен

                    </label>
                )}

                {error && (
                    <div
                        style={{
                            marginTop: 18,
                            padding: 12,
                            borderRadius: 8,
                            background: "#fee2e2",
                            color: "#991b1b",
                            fontSize: 14,
                        }}
                    >
                        {error}
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 10,
                        marginTop: 25,
                    }}
                >

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={secondaryButton}
                    >
                        Отмена
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

        </div>

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

function limitServerSelection(current, serverOptions, currentServerId, limit) {

    const fallback = getDefaultServerIds(serverOptions, currentServerId);
    const selected = current.length > 0 ? current : fallback;

    return selected.slice(0, Math.max(1, limit));

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
