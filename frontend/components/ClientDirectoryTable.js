"use client";

import { ChevronRight, CircleHelp, Wifi, WifiOff } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { formatClientExpiry } from "../lib/clientDirectory";

export function DirectoryPresence({ client }) {
    const Icon = client.presence === "online" ? Wifi : client.presence === "offline" ? WifiOff : CircleHelp;
    return <Badge variant={client.presence === "online" ? "success" : client.presence === "offline" ? "secondary" : "outline"}>
        <Icon className="size-3" />{client.presence === "unknown" ? "Нет полных данных" : `Онлайн: ${client.onlineCount} / ${client.serverCount}`}
    </Badge>;
}

export default function ClientDirectoryTable({ clients, onOpen, busy, ordersAvailable = true }) {
    if (!clients.length) return <div className="border-y border-border py-16 text-center text-sm text-muted-foreground">Клиенты не найдены.</div>;
    return <>
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
            <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b border-border bg-[#f8f9fb] text-xs text-muted-foreground"><tr>
                    {["Клиент", "Серверы", "Подключение", "Трафик", "Ближайшее окончание", ""].map((title) => <th key={title} className="px-4 py-3 font-semibold">{title}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-border">{clients.map((client) => <tr key={client.name} className="hover:bg-[#fafbfc]">
                    <td className="max-w-60 px-4 py-4"><button type="button" className="block max-w-full truncate text-left font-medium text-primary hover:underline" title={client.name} onClick={() => onOpen(client.name)} disabled={busy}>{client.name}</button><div className="mt-1 truncate text-xs text-muted-foreground">{client.groups.join(", ") || "Без группы"}</div></td>
                    <td className="max-w-64 px-4 py-4"><div className="break-words">{client.profiles.map((profile) => profile.server_name).join(", ") || "Нет данных 3X-UI"}</div><div className="mt-1 text-xs text-muted-foreground">{ordersAvailable ? `По оплате: ${client.paidServerIds.size} · Выдано вручную: ${client.manualServerIds.size}` : "Данные заказов недоступны"}</div></td>
                    <td className="px-4 py-4"><DirectoryPresence client={client} /></td>
                    <td className="whitespace-nowrap px-4 py-4 tabular-nums">{(client.traffic / 1024 ** 3).toFixed(2)} GB</td>
                    <td className="px-4 py-4 text-muted-foreground">{summaryExpiry(client)}</td>
                    <td className="px-3 py-4"><Button variant="ghost" size="icon" title={`Карточка клиента ${client.name}`} aria-label={`Карточка клиента ${client.name}`} onClick={() => onOpen(client.name)} disabled={busy}><ChevronRight /></Button></td>
                </tr>)}</tbody>
            </table>
        </div>
        <div className="grid gap-3 lg:hidden">{clients.map((client) => <article key={client.name} className="min-w-0 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2"><button type="button" className="min-w-0 break-words text-left text-base font-semibold text-primary" onClick={() => onOpen(client.name)} disabled={busy}>{client.name}</button><Button variant="ghost" size="icon" className="shrink-0" title={`Карточка клиента ${client.name}`} aria-label={`Карточка клиента ${client.name}`} onClick={() => onOpen(client.name)} disabled={busy}><ChevronRight /></Button></div>
            <DirectoryPresence client={client} />
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Серверы</dt><dd className="break-words">{client.profiles.map((profile) => profile.server_name).join(", ") || "Нет данных 3X-UI"}</dd>
                <dt className="text-muted-foreground">По оплате</dt><dd>{ordersAvailable ? client.paidServerIds.size : "Нет данных"}</dd>
                <dt className="text-muted-foreground">Трафик</dt><dd>{(client.traffic / 1024 ** 3).toFixed(2)} GB</dd>
                <dt className="text-muted-foreground">Окончание</dt><dd className="break-words">{summaryExpiry(client)}</dd>
            </dl>
        </article>)}</div>
    </>;
}

function summaryExpiry(client) {
    if (client.nearestExpiry) return formatClientExpiry(client.nearestExpiry);
    return client.profiles.length && client.profiles.every((profile) => Number(profile.expiry) === 0) ? "Без срока" : "Нет общей даты";
}
