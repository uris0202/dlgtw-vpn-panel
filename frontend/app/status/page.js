"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, CircleHelp, Clock3, RefreshCw, Server, TriangleAlert } from "lucide-react";
import api from "../../lib/api";
import { sessionLabel, statusDate, statusIsFresh, visibleStatus } from "../../lib/publicStatus";
import PublicHeader from "../../components/PublicHeader";
import NewsFeed from "../../components/NewsFeed";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";

const titles = { ok: "Проверки инфраструктуры пройдены", partial: "Данные проверок неполные", issue: "Обнаружены проблемы", unknown: "Нет актуальных данных" };
const nodeTitles = { ok: "Проверки пройдены", partial: "Проверено частично", issue: "Есть проблема", unknown: "Нет данных" };
const layers = { route: "TCP-маршрут", node: "Процесс на узле", management: "Канал управления", checks: "Сбор диагностики" };
const kinds = { route: "Проблема инфраструктуры маршрута", node: "Проблема процесса на узле", management: "Проблема канала управления", checks: "Не удалось завершить диагностику", session: "Не прошёл проверочный HTTPS-запрос через VPN" };

export default function StatusPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [now, setNow] = useState(Date.now());
    const running = useRef(false);
    const controller = useRef(null);
    const load = useCallback(async () => {
        if (running.current) return;
        const abort = new AbortController(); controller.current = abort;
        running.current = true; setLoading(true);
        try {
            const response = await api.get("/public/status", { signal: abort.signal, timeout: 10000 });
            if (!Array.isArray(response.data?.servers)) throw new Error("Invalid status response");
            if (!abort.signal.aborted) { setData(response.data); setError(""); setNow(Date.now()); }
        } catch {
            if (!abort.signal.aborted) setError("Не удалось обновить состояние. Предыдущие данные не считаются актуальными.");
        } finally {
            if (!abort.signal.aborted) { running.current = false; setLoading(false); }
        }
    }, []);
    useEffect(() => {
        load();
        return () => { controller.current?.abort(); running.current = false; };
    }, [load]);
    useEffect(() => {
        function refreshVisibleStatus() {
            setNow(Date.now());
            if (document.visibilityState === "visible") load();
        }
        const timer = window.setInterval(refreshVisibleStatus, 60000);
        document.addEventListener("visibilitychange", refreshVisibleStatus);
        return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisibleStatus); };
    }, [load]);

    const overall = visibleStatus(data, Boolean(error), now);
    const fresh = !error && statusIsFresh(data, now);
    const Icon = overall === "ok" ? CheckCircle2 : overall === "issue" ? TriangleAlert : CircleHelp;
    const incidents = fresh ? (data?.servers || []).flatMap((server) => (server.incidents || []).map((incident) => ({ ...incident, server }))) : [];
    return <div className="min-h-screen bg-background">
        <PublicHeader panelName={data?.panel_name || "DLGTW VPN"} />
        <main className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 lg:py-9">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="m-0 text-2xl font-semibold">Состояние сервиса</h1><p className="mt-2 mb-0 text-sm text-muted-foreground">Инфраструктура VPN-направлений</p></div><Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Обновить</Button></div>
            <section aria-label="Сводка состояния" className="mb-6 border-y border-border py-5">
                <div className="flex items-start gap-3"><Icon className={`mt-0.5 size-5 shrink-0 ${overall === "ok" ? "text-[#067647]" : overall === "issue" ? "text-destructive" : "text-muted-foreground"}`} /><div className="min-w-0"><h2 className="m-0 text-lg font-semibold">{loading && !data ? "Загрузка состояния..." : titles[overall]}</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />Проверка: {statusDate(data?.checked_at)}</span><span>Источник: сервер в Петербурге</span>{data?.interval_seconds && <span>Интервал проверок: {Math.round(data.interval_seconds / 60)} мин.</span>}</div></div></div>
                <p className="mt-4 mb-0 text-sm text-muted-foreground">{data?.servers?.some((server) => server.session && server.session !== "not_configured") ? "Проверочный HTTPS-запрос через VPN выполняется с сервера в Петербурге. Он не измеряет скорость и не проверяет сеть вашего оператора." : "Это проверка инфраструктуры и TCP-портов, не полного VPN-сеанса. Доступность из сети вашего оператора может отличаться."}</p>
            </section>
            {error && <Alert variant="error" className="mb-5">{error}</Alert>}
            {data && !fresh && !error && <Alert className="mb-5">Свежая проверка монитора недоступна. Последний результат не подтверждает текущее состояние.</Alert>}
            <section aria-label="VPN-направления" className="mb-8 grid gap-3 sm:grid-cols-2">
                {(data?.servers || []).map((server) => <article key={server.id} className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><h2 className="m-0 break-words text-base font-semibold">{server.name}</h2><p className="mt-1 mb-0 break-words text-xs text-muted-foreground">{server.country}</p></div></div><Badge variant={!fresh || server.state === "unknown" ? "outline" : server.state === "ok" ? "success" : server.state === "issue" ? "destructive" : "warning"}>{nodeTitles[fresh ? server.state : "unknown"] || nodeTitles.unknown}</Badge></div>
                    <dl className="mt-5 grid gap-3 text-sm">{Object.entries(layers).map(([key, label]) => { const value = fresh ? server[key] : "unknown"; return <div key={key} className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className={`inline-flex items-center gap-1.5 ${value === "up" ? "text-[#067647]" : value === "down" ? "text-destructive" : "text-muted-foreground"}`}>{value === "up" ? <CheckCircle2 className="size-3.5" /> : value === "down" ? <TriangleAlert className="size-3.5" /> : <CircleHelp className="size-3.5" />}{value === "up" ? "Проверка пройдена" : value === "down" ? "Есть проблема" : "Нет данных"}</dd></div>; })}</dl>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm"><span className="text-muted-foreground">Запрос через VPN</span><span className={fresh && server.session === "up" ? "text-[#067647]" : fresh && server.session === "down" ? "text-destructive" : "text-muted-foreground"}>{sessionLabel(fresh ? server.session || "not_configured" : "unknown")}</span></div>
                </article>)}
                {!loading && !data?.servers.length && <div className="col-span-full border-y border-border py-12 text-center text-sm text-muted-foreground"><Activity className="mx-auto mb-3 size-6" />Нет опубликованных направлений.</div>}
            </section>
            {incidents.length > 0 && <section className="mb-8" aria-label="Открытые проблемы"><h2 className="mb-3 text-base font-semibold">Открытые проблемы</h2><div className="divide-y divide-border border-y border-border">{incidents.map((incident, index) => <article key={`${incident.server.id}-${incident.kind}-${index}`} className="py-4"><h3 className="m-0 break-words text-sm font-semibold">{incident.server.name} · {kinds[incident.kind] || "Требуется проверка"}</h3><div className="mt-1 text-xs text-muted-foreground">С {statusDate(incident.since)}</div></article>)}</div></section>}
            <NewsFeed compact limit={3} />
        </main>
    </div>;
}
