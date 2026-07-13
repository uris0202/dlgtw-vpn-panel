"use client";

import { useState } from "react";

import ClientLinksModal from "./ClientLinksModal";

export default function ClientTable({
    clients,
    accountLinkLoadingEmail = "",
    onEdit,
    onDelete,
    onCreateAccountAccess,
}) {

    const [linksClient, setLinksClient] = useState(null);
    const [copyStatus, setCopyStatus] = useState("");

    return (

        <>

            {copyStatus && (
                <div style={copyStatusBox}>
                    {copyStatus}
                </div>
            )}

            <table
                style={{
                    width: "100%",
                    background: "#fff",
                    borderCollapse: "collapse",
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
                }}
            >

                <thead>

                    <tr
                        style={{
                            background: "#2563eb",
                            color: "#fff",
                        }}
                    >

                        <th style={headCell}>Клиент</th>
                        <th style={headCell}>Группа</th>
                        <th style={headCell}>Трафик</th>
                        <th style={headCell}>Статус</th>
                        <th style={headCell}>Окончание</th>
                        <th style={headCell}>Действия</th>

                    </tr>

                </thead>

                <tbody>

                    {clients.length === 0 && (
                        <tr>
                            <td
                                colSpan={6}
                                style={{
                                    padding: 24,
                                    textAlign: "center",
                                    color: "#6b7280",
                                }}
                            >
                                Клиенты не найдены.
                            </td>
                        </tr>
                    )}

                    {clients.map((client) => (

                        <tr
                            key={client.email}
                            style={{
                                borderBottom: "1px solid #eee",
                            }}
                        >

                            <td style={bodyCell}>
                                {client.email}
                            </td>

                            <td style={bodyCell}>
                                {client.group || "-"}
                            </td>

                            <td style={bodyCell}>
                                {formatTraffic(client.traffic)}
                            </td>

                            <td
                                style={{
                                    ...bodyCell,
                                    textAlign: "center",
                                }}
                            >
                                {client.enabled ? "Активен" : "Отключен"}
                            </td>

                            <td style={bodyCell}>
                                {formatExpiry(client.expiry)}
                            </td>

                            <td style={bodyCell}>

                                <button
                                    onClick={() => setLinksClient(client)}
                                    disabled={!client.vless_url && !client.subscription_url}
                                    style={{
                                        marginRight: 8,
                                        padding: "6px 12px",
                                        border: "none",
                                        borderRadius: 6,
                                        cursor: client.vless_url || client.subscription_url ? "pointer" : "not-allowed",
                                        background: client.vless_url || client.subscription_url ? "#2563eb" : "#9ca3af",
                                        color: "#fff",
                                    }}
                                >
                                    QR
                                </button>

                                <button
                                    onClick={() => copyText(
                                        client.vless_url,
                                        "VLESS ссылка скопирована.",
                                        setCopyStatus,
                                    )}
                                    disabled={!client.vless_url}
                                    style={{
                                        marginRight: 8,
                                        padding: "6px 12px",
                                        border: "none",
                                        borderRadius: 6,
                                        cursor: client.vless_url ? "pointer" : "not-allowed",
                                        background: client.vless_url ? "#10b981" : "#9ca3af",
                                        color: "#fff",
                                    }}
                                >
                                    VLESS
                                </button>

                                <button
                                    onClick={() => copyText(
                                        client.subscription_url,
                                        "Subscription URL скопирован.",
                                        setCopyStatus,
                                    )}
                                    disabled={!client.subscription_url}
                                    style={{
                                        marginRight: 8,
                                        padding: "6px 12px",
                                        border: "none",
                                        borderRadius: 6,
                                        cursor: client.subscription_url ? "pointer" : "not-allowed",
                                        background: client.subscription_url ? "#6366f1" : "#9ca3af",
                                        color: "#fff",
                                    }}
                                >
                                    Sub
                                </button>

                                {onCreateAccountAccess && (
                                    <button
                                        onClick={() => onCreateAccountAccess(client)}
                                        disabled={accountLinkLoadingEmail === client.email}
                                        style={{
                                            marginRight: 8,
                                            padding: "6px 12px",
                                            border: "none",
                                            borderRadius: 6,
                                            cursor: accountLinkLoadingEmail === client.email
                                                ? "not-allowed"
                                                : "pointer",
                                            background: "#0f766e",
                                            color: "#fff",
                                        }}
                                    >
                                        {accountLinkLoadingEmail === client.email ? "..." : "ЛК"}
                                    </button>
                                )}

                                <button
                                    onClick={() => onEdit(client)}
                                    style={{
                                        marginRight: 8,
                                        padding: "6px 12px",
                                        border: "none",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        background: "#f59e0b",
                                        color: "#fff",
                                    }}
                                >
                                    Изменить
                                </button>

                                <button
                                    onClick={() => onDelete(client.email)}
                                    style={{
                                        padding: "6px 12px",
                                        border: "none",
                                        borderRadius: 6,
                                        cursor: "pointer",
                                        background: "#ef4444",
                                        color: "#fff",
                                    }}
                                >
                                    Удалить
                                </button>

                            </td>

                        </tr>

                    ))}

                </tbody>

            </table>

            <ClientLinksModal
                client={linksClient}
                onClose={() => setLinksClient(null)}
            />

        </>

    );

}

async function copyText(value, message, setCopyStatus) {

    if (!value) {
        setTemporaryStatus(setCopyStatus, "Ссылка недоступна для этого клиента.");
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        setTemporaryStatus(setCopyStatus, message);
    } catch {
        fallbackCopy(value);
        setTemporaryStatus(setCopyStatus, message);
    }

}

function setTemporaryStatus(setCopyStatus, message) {

    setCopyStatus(message);

    window.setTimeout(() => {
        setCopyStatus("");
    }, 2200);

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

function formatTraffic(value) {

    const bytes = Number(value || 0);

    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

}

function formatExpiry(value) {

    if (!value || value === 0) {
        return "Без срока";
    }

    return new Date(value).toLocaleDateString("ru-RU");

}

const headCell = {
    padding: 12,
    textAlign: "left",
};

const bodyCell = {
    padding: 12,
};

const copyStatusBox = {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 14,
};
