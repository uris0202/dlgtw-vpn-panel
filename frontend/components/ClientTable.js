"use client";

import { useState } from "react";
import {
    Copy,
    KeyRound,
    Pencil,
    QrCode,
    Trash2,
    UserRoundCog,
} from "lucide-react";

import ClientLinksModal from "./ClientLinksModal";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

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
                <Alert variant="success" className="mb-3">{copyStatus}</Alert>
            )}

            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-sm">
                        <thead className="bg-[#f8f9fb] text-left text-xs font-semibold text-muted-foreground">
                            <tr className="border-b border-border">
                                <th className="px-4 py-3">Клиент</th>
                                <th className="px-4 py-3">Группа</th>
                                <th className="px-4 py-3">Трафик</th>
                                <th className="px-4 py-3">Статус</th>
                                <th className="px-4 py-3">Окончание</th>
                                <th className="px-4 py-3 text-right">Действия</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border">
                            {clients.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        Клиенты не найдены.
                                    </td>
                                </tr>
                            )}

                            {clients.map((client) => (
                                <tr key={client.email} className="transition-colors hover:bg-[#fafbfc]">
                                    <td className="max-w-64 px-4 py-3.5">
                                        <div className="truncate font-medium text-foreground" title={client.email}>{client.email}</div>
                                        {client.comment && (
                                            <div className="mt-0.5 truncate text-xs text-muted-foreground" title={client.comment}>{client.comment}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3.5 text-muted-foreground">{client.group || "-"}</td>
                                    <td className="px-4 py-3.5 font-medium tabular-nums">{formatTraffic(client.traffic)}</td>
                                    <td className="px-4 py-3.5">
                                        <Badge variant={client.enabled ? "success" : "secondary"}>
                                            {client.enabled ? "Активен" : "Отключен"}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3.5 text-muted-foreground">{formatExpiry(client.expiry)}</td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center justify-end gap-1">
                                            <ActionButton
                                                title="QR и ссылки"
                                                disabled={!client.vless_url && !client.subscription_url}
                                                onClick={() => setLinksClient(client)}
                                                icon={QrCode}
                                            />
                                            <ActionButton
                                                title="Копировать VLESS"
                                                disabled={!client.vless_url}
                                                onClick={() => copyText(client.vless_url, "VLESS ссылка скопирована.", setCopyStatus)}
                                                icon={KeyRound}
                                            />
                                            <ActionButton
                                                title="Копировать Subscription URL"
                                                disabled={!client.subscription_url}
                                                onClick={() => copyText(client.subscription_url, "Subscription URL скопирован.", setCopyStatus)}
                                                icon={Copy}
                                            />
                                            {onCreateAccountAccess && (
                                                <ActionButton
                                                    title="Получить ссылку на личный кабинет"
                                                    disabled={accountLinkLoadingEmail === client.email}
                                                    onClick={() => onCreateAccountAccess(client)}
                                                    icon={UserRoundCog}
                                                    loading={accountLinkLoadingEmail === client.email}
                                                />
                                            )}
                                            <ActionButton title="Изменить клиента" onClick={() => onEdit(client)} icon={Pencil} />
                                            <ActionButton
                                                title="Удалить клиента"
                                                onClick={() => onDelete(client.email)}
                                                icon={Trash2}
                                                destructive
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ClientLinksModal client={linksClient} onClose={() => setLinksClient(null)} />
        </>
    );
}

function ActionButton({ title, icon: Icon, destructive = false, loading = false, ...props }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            title={title}
            aria-label={title}
            className={destructive ? "text-destructive hover:bg-[#fef3f2] hover:text-destructive" : "text-muted-foreground"}
            {...props}
        >
            <Icon className={loading ? "animate-pulse" : ""} />
        </Button>
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
    window.setTimeout(() => setCopyStatus(""), 2200);
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
