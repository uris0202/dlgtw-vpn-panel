"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Stethoscope, X } from "lucide-react";
import api from "../lib/api";
import useDialogLifecycle from "../lib/useDialogLifecycle";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const layers = [
    ["website", "Сайт · HTTPS"], ["panel_api", "API панели · /health"],
    ["subscription", "Содержимое клиентской подписки"], ["xui_api", "API 3X-UI"],
    ["xray_runtime", "Процесс Xray · по данным 3X-UI"], ["relay_config", "Сохранённый маршрут и HAProxy"],
    ["edge_sni_sync", "HAProxy Edge · автоматическая SNI Map"],
    ["management_tls", "Защита канала управления"], ["vpn_session", "VPN-рукопожатие и передача данных"],
];

export function DiagnosticBadge({ state }) {
    const variants = { ok: "success", error: "destructive", warning: "warning" };
    const labels = { ok: "Успешно", error: "Ошибка", warning: "Внимание", not_checked: "Не проверено", disabled: "Отключено" };
    return <Badge variant={variants[state] || "outline"}>{labels[state] || "Нет данных"}</Badge>;
}

export default function ServerDiagnosticsModal({ server, onClose, onReport }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [authRequired, setAuthRequired] = useState(false);
    const [revision, setRevision] = useState(0);
    useDialogLifecycle(Boolean(server), onClose);

    useEffect(() => {
        if (!server) return undefined;
        const controller = new AbortController();
        setReport(null);
        setLoading(true);
        setError("");
        setAuthRequired(false);
        api.get(`/servers/${server.id}/diagnostics`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, signal: controller.signal,
        }).then(({ data }) => {
            setReport(data);
            onReport?.(server.id, data);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            const expired = failure?.response?.status === 401 || failure?.response?.status === 403;
            setAuthRequired(expired);
            const detail = failure?.response?.data?.detail;
            setError(expired ? "Сессия администратора истекла. Требуется повторный вход." : typeof detail === "string" ? detail : "Не удалось получить диагностику.");
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [server, revision, onReport]);

    if (!server) return null;

    function download() {
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `vpn-diagnostics-server-${server.id}.json`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-labelledby="server-diagnostics-title" className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-lg bg-card shadow-2xl sm:max-w-3xl sm:rounded-lg">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                    <div className="min-w-0"><h2 id="server-diagnostics-title" className="m-0 flex items-center gap-2 text-lg font-semibold"><Stethoscope className="size-5 shrink-0 text-muted-foreground" />Диагностика</h2><p className="mt-1 mb-0 break-words text-sm text-muted-foreground">{server.name}</p></div>
                    <Button type="button" variant="ghost" size="icon" onClick={onClose} title="Закрыть" aria-label="Закрыть" autoFocus><X /></Button>
                </div>
                <div className="min-h-48 overflow-y-auto overscroll-contain px-5 py-5" aria-busy={loading}>
                    {loading && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Выполняются проверки...</div>}
                    {error && <Alert variant="error"><div className="grid gap-3">{error}{authRequired && <Button asChild variant="outline" size="sm"><Link href="/login?next=/servers">Войти заново</Link></Button>}</div></Alert>}
                    {report && <>
                        <Alert className="mb-5">VPN-рукопожатие и передача данных не проверялись. Открытый TCP-порт не означает, что VPN работает.</Alert>
                        <div className="mb-4 text-xs leading-5 text-muted-foreground"><div>{new Date(report.checked_at).toLocaleString("ru-RU")}</div><div className="mt-1">{report.vantage}</div></div>
                        <div className="divide-y divide-border border-y border-border">{layers.map(([key, title]) => <CheckRow key={key} title={title} result={report.checks?.[key]} />)}</div>
                        <PortSection title="VPN-порты зарубежного узла · TCP" items={report.vpn_ports} />
                        <PortSection title="Единый публичный вход · TLS/SNI" items={report.entry_ports} />
                        <section className="mt-6"><h3 className="m-0 text-base font-semibold">Аудит REALITY</h3>
                            {!report.inbounds?.length ? <p className="text-sm text-muted-foreground">Данные VLESS inbounds не получены.</p> : report.inbounds.map((inbound) => <div key={inbound.id} className="mt-3 border-t border-border pt-3">
                                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="m-0 text-sm font-semibold">Inbound #{inbound.id} · порт {inbound.port}</h4><DiagnosticBadge state={inbound.enabled ? inbound.audit.state : "disabled"} /></div>
                                <div className="mt-1 text-xs text-muted-foreground">{inbound.audit.network} · {inbound.audit.security}</div>
                                <p className="mb-2 text-xs leading-5 text-muted-foreground">{inbound.audit.summary}</p>
                                <div className="divide-y divide-border">{inbound.audit.findings?.map((finding, index) => <div key={index} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between"><span className="min-w-0 break-words text-sm">{finding.summary}</span><span className="shrink-0"><DiagnosticBadge state={finding.state} /></span></div>)}</div>
                            </div>)}
                        </section>
                        <section className="mt-6 border-t border-border pt-4"><h3 className="m-0 text-sm font-semibold">Границы проверки</h3><ul className="mb-0 grid gap-2 pl-4 text-xs leading-5 text-muted-foreground">{report.limits?.map((limit) => <li key={limit}>{limit}</li>)}</ul></section>
                    </>}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
                    <Button type="button" variant="outline" onClick={download} disabled={!report || loading}><Download />Отчёт</Button>
                    <Button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Проверить снова</Button>
                </div>
            </div>
        </div>
    );
}

function CheckRow({ title, result }) {
    return <div className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div className="min-w-0"><div className="text-sm font-medium">{title}</div><p className="mt-1 mb-0 break-words text-xs leading-5 text-muted-foreground">{result?.summary || "Проверка не выполнялась."}</p>{result?.version && <div className="mt-1 text-xs font-medium">Xray {result.version}</div>}{result?.checked_at && <div className="mt-1 text-xs text-muted-foreground">Последняя синхронизация: {new Date(result.checked_at).toLocaleString("ru-RU")}</div>}{result?.latency_ms != null && <div className="mt-1 text-xs text-muted-foreground">{result.latency_ms} мс</div>}</div><span><DiagnosticBadge state={result?.state} /></span></div>;
}

function PortSection({ title, items }) {
    return <section className="mt-6"><h3 className="m-0 mb-2 text-base font-semibold">{title}</h3>{items?.length ? <div className="divide-y divide-border border-y border-border">{items.map((item) => <CheckRow key={item.inbound_id} title={`Inbound #${item.inbound_id}${item.port ? ` · порт ${item.port}` : ""}`} result={item} />)}</div> : <p className="text-sm text-muted-foreground">Порты не проверялись.</p>}</section>;
}
