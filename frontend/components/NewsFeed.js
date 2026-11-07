"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, Newspaper, Pin, RefreshCw } from "lucide-react";

import api from "../lib/api";
import { newsDate, newsError } from "../lib/news";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export default function NewsFeed({ compact = false, limit = 20, className = "", onPanelName }) {
    const [page, setPage] = useState(null);
    const [offset, setOffset] = useState(0);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        api.get("/public/news", { params: { limit, offset }, signal: controller.signal })
            .then(({ data }) => {
                setPage(data);
                onPanelName?.(data.panel_name);
                if (offset > 0 && offset >= data.total) setOffset(Math.max(0, Math.floor((data.total - 1) / limit) * limit));
            })
            .catch((failure) => { if (!controller.signal.aborted) setError(newsError(failure)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [limit, offset, revision, onPanelName]);

    if (compact && page?.total === 0 && !error && !loading) return null;

    return (
        <section className={`min-w-0 ${className}`} aria-label="Новости" aria-busy={loading}>
            <div className="mb-3 flex items-center justify-between gap-3">
                {compact ? <h2 className="m-0 flex items-center gap-2 text-base font-semibold"><Newspaper className="size-4 text-muted-foreground" />Новости</h2> : <span className="text-sm text-muted-foreground">{page ? `Публикаций: ${page.total}` : ""}</span>}
                <div className="flex items-center gap-2">
                    {compact && <Link href="/news" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">Все новости<ArrowRight className="size-4" /></Link>}
                    {!compact && <Button type="button" variant="ghost" size="icon" disabled={loading} onClick={() => setRevision((value) => value + 1)} title="Обновить новости" aria-label="Обновить новости"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>}
                </div>
            </div>
            {error ? (
                <Alert variant="error"><div className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button type="button" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}><RefreshCw />Повторить</Button></div></Alert>
            ) : loading ? (
                <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Загрузка новостей...</div>
            ) : page?.items.length ? (
                <div className={compact ? "border-y border-border bg-card/50" : "divide-y divide-border border-y border-border"}>
                    {page.items.map((item) => (
                        <article key={item.id} id={`news-${item.id}`} className={`min-w-0 scroll-mt-5 ${compact ? "border-l-2 border-primary px-4 py-4" : "py-7"}`}>
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {item.is_pinned && <Badge><Pin className="mr-1 size-3" />Закреплено</Badge>}
                                <time dateTime={item.published_at}>{newsDate(item.published_at)}</time>
                            </div>
                            <h3 className={`m-0 break-words font-semibold ${compact ? "text-base" : "text-lg"}`}>{compact ? <Link href={`/news#news-${item.id}`} className="text-foreground hover:text-primary">{item.title}</Link> : item.title}</h3>
                            <p className={`mt-2 mb-0 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>{item.body}</p>
                        </article>
                    ))}
                </div>
            ) : <div className="py-12 text-center text-sm text-muted-foreground">Пока нет опубликованных новостей.</div>}
            {!compact && page?.total > limit && (
                <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{offset + 1}–{Math.min(offset + limit, page.total)} из {page.total}</span>
                    <div className="flex gap-2"><Button type="button" variant="outline" size="icon" disabled={loading || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - limit))} title="Предыдущая страница" aria-label="Предыдущая страница"><ChevronLeft /></Button><Button type="button" variant="outline" size="icon" disabled={loading || offset + limit >= page.total} onClick={() => setOffset((value) => value + limit)} title="Следующая страница" aria-label="Следующая страница"><ChevronRight /></Button></div>
                </div>
            )}
        </section>
    );
}
