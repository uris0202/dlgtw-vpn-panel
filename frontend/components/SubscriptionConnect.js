"use client";

import { useId, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";

import { getV2raytunImportUrl } from "../lib/subscriptionConnect";
import QRCodeCanvas from "./QRCodeCanvas";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";

export default function SubscriptionConnect({ value }) {
    const id = useId();
    const field = useRef(null);
    const [copyStatus, setCopyStatus] = useState(null);
    const importUrl = getV2raytunImportUrl(value);
    const status = copyStatus?.value === value ? copyStatus : null;

    async function copyLink() {
        if (!importUrl) return;
        setCopyStatus(null);
        let copied = false;
        try {
            await navigator.clipboard.writeText(value);
            copied = true;
        } catch {
            const previous = document.activeElement;
            try {
                field.current.focus();
                field.current.select();
                copied = document.execCommand("copy");
            } catch {
                copied = false;
            } finally {
                previous?.focus({ preventScroll: true });
            }
        }
        setCopyStatus({ value, copied });
    }

    return (
        <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
                <h3 className="m-0 text-sm font-semibold">Единая подписка DLGTW VPN</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                    {importUrl ? (
                        <Button asChild className="w-full sm:w-auto">
                            <a href={importUrl} rel="noreferrer" referrerPolicy="no-referrer"><Smartphone />Открыть в v2raytun</a>
                        </Button>
                    ) : (
                        <Button type="button" disabled className="w-full sm:w-auto"><Smartphone />Открыть в v2raytun</Button>
                    )}
                    <Button type="button" variant="outline" onClick={copyLink} disabled={!importUrl} className="w-full sm:w-auto">
                        {status?.copied ? <Check /> : <Copy />}Копировать ссылку
                    </Button>
                </div>
                <label htmlFor={id} className="mt-4 mb-2 block text-xs font-medium text-muted-foreground">Единая ссылка подписки</label>
                <Textarea id={id} ref={field} readOnly value={importUrl ? value : "Ссылка недоступна"} spellCheck={false} className="min-h-20 font-mono text-[11px] leading-4" />
                <div role="status" aria-live="polite" className="mt-2 min-h-5 text-xs">
                    {status && (status.copied
                        ? <span className="text-[#067647]">Ссылка скопирована.</span>
                        : <span className="text-destructive">Не удалось скопировать. Выделите ссылку и скопируйте вручную.</span>)}
                </div>
                {!importUrl && <Alert variant="error" className="mt-2">Ссылка подписки недоступна. Обновите страницу или обратитесь в поддержку.</Alert>}
                <Button asChild variant="link" className="mt-2 text-xs">
                    <a href="https://v2raytun.com/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink />Скачать v2raytun</a>
                </Button>
            </div>
            <div className="justify-self-center md:justify-self-end" role="img" aria-label="QR-код единой подписки">
                <QRCodeCanvas value={importUrl ? value : ""} size={220} />
            </div>
        </div>
    );
}
