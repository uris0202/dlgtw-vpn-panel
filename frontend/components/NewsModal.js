"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";

import useDialogLifecycle from "../lib/useDialogLifecycle";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";

export default function NewsModal({ open, news, saving, error, onClose, onSave }) {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [published, setPublished] = useState(false);
    const [pinned, setPinned] = useState(false);
    useEffect(() => {
        if (!open) return;
        setTitle(news?.title || "");
        setBody(news?.body || "");
        setPublished(Boolean(news?.is_published));
        setPinned(Boolean(news?.is_pinned));
    }, [open, news]);
    useDialogLifecycle(open, onClose, saving);
    if (!open) return null;

    function submit(event) {
        event.preventDefault();
        onSave({ title: title.trim(), body: body.trim(), is_published: published, is_pinned: pinned });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
            <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="news-modal-title" className="max-h-[96dvh] w-full overflow-y-auto overscroll-contain rounded-t-lg bg-card shadow-2xl sm:max-w-2xl sm:rounded-lg">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <h2 id="news-modal-title" className="m-0 text-lg font-semibold">{news ? "Редактирование новости" : "Новая новость"}</h2>
                    <Button type="button" variant="ghost" size="icon" disabled={saving} onClick={onClose} title="Закрыть" aria-label="Закрыть"><X /></Button>
                </div>
                <div className="grid gap-5 p-5">
                    <label className="grid gap-1.5 text-sm font-medium">Заголовок<Input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} disabled={saving} autoFocus /></label>
                    <label className="grid gap-1.5 text-sm font-medium">Текст новости<Textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={20000} disabled={saving} rows={9} className="min-h-48 font-normal" /></label>
                    <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
                        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} disabled={saving} className="size-4 accent-primary" />Опубликовать</label>
                        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} disabled={saving} className="size-4 accent-primary" />Закрепить</label>
                    </div>
                    {error && <Alert variant="error">{error}</Alert>}
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
                    <Button type="submit" disabled={saving || !title.trim() || !body.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Сохранить</Button>
                </div>
            </form>
        </div>
    );
}
