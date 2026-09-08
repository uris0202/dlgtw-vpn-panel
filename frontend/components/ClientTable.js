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
import { cn } from "../lib/utils";

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

            <div className="grid gap-3 lg:hidden">
                {clients.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                        Клиенты не найдены.
                    </div>
                ) : (
                    clients.map((client) => (
                        <MobileClientCard
                            key={client.email}
                            client={client}
                            accountLinkLoading={accountLinkLoadingEmail === client.email}
                            showAccountAction={Boolean(onCreateAccountAccess)}
                            onOpenLinks={() => setLinksClient(client)}
                            onCopyVless={() => copyText(client.vless_url, "VLESS ссылка скопирована.", setCopyStatus)}
                            onCopySubscription={() => copyText(client.subscription_url, "Subscription URL скопирован.", setCopyStatus)}
                            onCreateAccount={() => onCreateAccountAccess?.(client)}
                            onEdit={() => onEdit(client)}
                            onDelete={() => onDelete(client.email)}
                        />
                    ))
                )}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:block">
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

function MobileClientCard({
    client,
    accountLinkLoading,
    showAccountAction,
    onOpenLinks,
    onCopyVless,
    onCopySubscription,
    onCreateAccount,
    onEdit,
    onDelete,
}) {
    return (
        <article className="overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-start justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                    <h2 className="m-0 break-words text-base font-semibold text-foreground">
                        {client.email}
                    </h2>
                    {client.comment && (
                        <p className="mt-1 mb-0 break-words text-xs text-muted-foreground">
                            {client.comment}
                        </p>
                    )}
                </div>
                <Badge variant={client.enabled ? "success" : "secondary"}>
                    {client.enabled ? "Активен" : "Отключен"}
                </Badge>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-y border-border bg-[#f8f9fb]">
                <MobileDetail label="Группа" value={client.group || "Без группы"} />
                <MobileDetail label="Трафик" value={formatTraffic(client.traffic)} />
                <MobileDetail label="Окончание" value={formatExpiry(client.expiry)} />
            </div>

            <div className="grid grid-cols-1 gap-2 p-3 min-[360px]:grid-cols-2 sm:grid-cols-3">
                <MobileActionButton
                    label="QR и ссылки"
                    title="QR и ссылки"
                    disabled={!client.vless_url && !client.subscription_url}
                    onClick={onOpenLinks}
                    icon={QrCode}
                    primary
                />
                <MobileActionButton
                    label="VLESS"
                    title="Копировать VLESS"
                    disabled={!client.vless_url}
                    onClick={onCopyVless}
                    icon={KeyRound}
                />
                <MobileActionButton
                    label="Подписка"
                    title="Копировать Subscription URL"
                    disabled={!client.subscription_url}
                    onClick={onCopySubscription}
                    icon={Copy}
                />
                {showAccountAction && (
                    <MobileActionButton
                        label={accountLinkLoading ? "Получение..." : "Кабинет"}
                        title="Получить ссылку на личный кабинет"
                        disabled={accountLinkLoading}
                        onClick={onCreateAccount}
                        icon={UserRoundCog}
                        loading={accountLinkLoading}
                    />
                )}
                <MobileActionButton
                    label="Изменить"
                    title="Изменить клиента"
                    onClick={onEdit}
                    icon={Pencil}
                />
                <MobileActionButton
                    label="Удалить"
                    title="Удалить клиента"
                    onClick={onDelete}
                    icon={Trash2}
                    destructive
                />
            </div>
        </article>
    );
}

function MobileDetail({ label, value }) {
    return (
        <div className="min-w-0 px-2 py-3 text-center">
            <div className="truncate text-xs font-semibold text-foreground" title={value}>{value}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</div>
        </div>
    );
}

function MobileActionButton({
    label,
    title,
    icon: Icon,
    destructive = false,
    primary = false,
    loading = false,
    ...props
}) {
    return (
        <Button
            type="button"
            variant={primary ? "default" : "outline"}
            size="sm"
            title={title}
            aria-label={title}
            className={cn(
                "h-10 w-full min-w-0 justify-start px-2.5",
                destructive && "border-[#fecdca] text-destructive hover:bg-[#fef3f2] hover:text-destructive",
            )}
            {...props}
        >
            <Icon className={loading ? "animate-pulse" : ""} />
            <span>{label}</span>
        </Button>
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
