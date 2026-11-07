"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, Loader2, Newspaper, Pencil, Pin, PinOff, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import NewsModal from "../../components/NewsModal";
import PageHeading from "../../components/PageHeading";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";
import { newsDate, newsError } from "../../lib/news";

const LIMIT = 20;

export default function AnnouncementsPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [page, setPage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [offset, setOffset] = useState(0);
    const [revision, setRevision] = useState(0);
    const [modal, setModal] = useState(null);
    const [modalError, setModalError] = useState("");
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState(null);

    useEffect(() => {
        let active = true;
        getMe().then((me) => {
            if (!active) return;
            if (!me) router.replace("/login");
            else setUser(me);
        });
        return () => { active = false; };
    }, [router]);

    useEffect(() => {
        if (!user) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        api.get("/news", { ...authConfig(), params: { q: query, status, limit: LIMIT, offset }, signal: controller.signal })
            .then(({ data }) => {
                setPage(data);
                if (offset > 0 && offset >= data.total) setOffset(Math.max(0, Math.floor((data.total - 1) / LIMIT) * LIMIT));
            })
            .catch((failure) => { if (!controller.signal.aborted) setError(newsError(failure)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [user, query, status, offset, revision]);

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    function openModal(news = null) {
        setModalError("");
        setModal({ news });
    }

    async function saveNews(payload) {
        if (saving) return;
        setSaving(true);
        setModalError("");
        try {
            if (modal?.news) await api.patch(`/news/${modal.news.id}`, payload, authConfig());
            else await api.post("/news", payload, authConfig());
            setModal(null);
            setRevision((value) => value + 1);
        } catch (failure) {
            setModalError(newsError(failure, "Не удалось сохранить новость."));
        } finally { setSaving(false); }
    }

    async function changeNews(item, payload, remove = false) {
        if (busy !== null) return;
        if (remove && !window.confirm(`Удалить новость «${item.title}»?`)) return;
        setBusy(item.id);
        setError("");
        try {
            if (remove) await api.delete(`/news/${item.id}`, authConfig());
            else await api.patch(`/news/${item.id}`, payload, authConfig());
            setRevision((value) => value + 1);
        } catch (failure) {
            setError(newsError(failure, "Не удалось изменить новость."));
        } finally { setBusy(null); }
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading title="Новости" description="Публикации для клиентов и посетителей сайта" actions={<><Button asChild variant="outline"><Link href="/news" target="_blank" rel="noopener noreferrer"><ExternalLink />Открыть сайт</Link></Button><Button onClick={() => openModal()} disabled={!user || busy !== null}><Plus />Новая новость</Button></>} />
            <form onSubmit={(event) => { event.preventDefault(); setOffset(0); setQuery(search.trim()); setRevision((value) => value + 1); }} className="mb-5 flex flex-col gap-3 border-y border-border py-4 sm:flex-row">
                <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={160} placeholder="Заголовок новости" aria-label="Поиск новостей" className="pl-9" /></div>
                <Select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} aria-label="Статус публикации" className="sm:w-48"><option value="all">Все публикации</option><option value="published">Опубликованные</option><option value="draft">Черновики</option></Select>
                <Button type="submit" variant="outline"><Search />Найти</Button>
                <Button type="button" variant="outline" size="icon" disabled={loading} onClick={() => setRevision((value) => value + 1)} title="Обновить новости" aria-label="Обновить новости"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
            </form>
            {error && <Alert variant="error" className="mb-4">{error}</Alert>}
            {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Загрузка новостей...</div> : page?.items.length ? (
                <div className="grid gap-3">
                    {page.items.map((item) => (
                        <Card key={item.id} className="min-w-0 p-4 sm:p-5">
                            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant={item.is_published ? "success" : "outline"}>{item.is_published ? "Опубликовано" : "Черновик"}</Badge>{item.is_pinned && <Badge variant="secondary"><Pin className="size-3" />Закреплено</Badge>}<span className="text-xs text-muted-foreground">{newsDate(item.published_at || item.updated_at)}</span></div>
                            <h2 className="m-0 break-words text-base font-semibold">{item.title}</h2>
                            <p className="mt-2 mb-4 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{item.body}</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => changeNews(item, { is_published: !item.is_published })} disabled={busy !== null}>{item.is_published ? <EyeOff /> : <Eye />}{item.is_published ? "Снять с публикации" : "Опубликовать"}</Button>
                                <Button type="button" variant="ghost" size="icon" title="Редактировать" aria-label={`Редактировать: ${item.title}`} disabled={busy !== null} onClick={() => openModal(item)}><Pencil /></Button>
                                <Button type="button" variant="ghost" size="icon" title={item.is_pinned ? "Открепить" : "Закрепить"} aria-label={`${item.is_pinned ? "Открепить" : "Закрепить"}: ${item.title}`} aria-pressed={item.is_pinned} disabled={busy !== null} onClick={() => changeNews(item, { is_pinned: !item.is_pinned })}>{item.is_pinned ? <PinOff /> : <Pin />}</Button>
                                <Button type="button" variant="ghost" size="icon" title="Удалить" aria-label={`Удалить: ${item.title}`} className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => changeNews(item, null, true)}><Trash2 /></Button>
                                {busy === item.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : !error && <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Newspaper className="size-7" />Новостей не найдено.</div>}
            {page && !loading && <div className="mt-5 flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{page.total === 0 ? "Всего: 0" : `${offset + 1}–${Math.min(offset + LIMIT, page.total)} из ${page.total}`}</span><div className="flex gap-2"><Button variant="outline" size="icon" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - LIMIT))} title="Предыдущая страница" aria-label="Предыдущая страница"><ChevronLeft /></Button><Button variant="outline" size="icon" disabled={offset + LIMIT >= page.total} onClick={() => setOffset((value) => value + LIMIT)} title="Следующая страница" aria-label="Следующая страница"><ChevronRight /></Button></div></div>}
            <NewsModal open={modal !== null} news={modal?.news} saving={saving} error={modalError} onClose={() => { if (!saving) setModal(null); }} onSave={saveNews} />
        </AdminLayout>
    );
}

function authConfig() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
}
