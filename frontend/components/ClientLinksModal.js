"use client";

import { useRef, useState } from "react";
import { Copy, Download, X } from "lucide-react";

import QRCodeCanvas from "./QRCodeCanvas";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";

export default function ClientLinksModal({ client, onClose }) {
    if (!client) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-labelledby="links-modal-title" className="max-h-[96vh] w-full overflow-y-auto rounded-t-lg bg-card shadow-2xl sm:max-w-4xl sm:rounded-lg">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 id="links-modal-title" className="m-0 text-lg font-semibold">Ссылки клиента</h2>
                        <div className="mt-1 truncate text-sm text-muted-foreground">{client.email}</div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={onClose} title="Закрыть" aria-label="Закрыть"><X /></Button>
                </div>

                <div className="grid divide-y divide-border">
                    <LinkSection title="VLESS" value={client.vless_url} copyMessage="VLESS ссылка скопирована." />
                    <LinkSection title="Subscription URL" value={client.subscription_url} copyMessage="Subscription URL скопирован." />
                </div>

                <div className="sticky bottom-0 flex justify-end border-t border-border bg-card px-5 py-4 sm:px-6">
                    <Button type="button" variant="outline" onClick={onClose}>Закрыть</Button>
                </div>
            </div>
        </div>
    );
}

function LinkSection({ title, value, copyMessage }) {
    const qrRef = useRef(null);
    const [status, setStatus] = useState("");
    const fileName = `${title.toLowerCase().replace(/\s+/g, "-")}-qr.png`;

    return (
        <section className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="min-w-0">
                <h3 className="m-0 text-base font-semibold">{title}</h3>
                <Textarea readOnly value={value || "Ссылка недоступна"} className="mt-3 min-h-24 font-mono text-xs leading-5" />
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => copyText(value, copyMessage, setStatus)} disabled={!value}><Copy />Копировать</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => downloadQr(qrRef.current, fileName, setStatus)} disabled={!value}><Download />Скачать QR</Button>
                </div>
                {status && <Alert variant="success" className="mt-3">{status}</Alert>}
            </div>

            <div className="justify-self-center md:justify-self-end">
                <QRCodeCanvas value={value} canvasRef={qrRef} />
            </div>
        </section>
    );
}

async function copyText(value, message, setStatus) {
    if (!value) {
        setTemporaryStatus(setStatus, "Ссылка недоступна.");
        return;
    }
    try { await navigator.clipboard.writeText(value); } catch { fallbackCopy(value); }
    setTemporaryStatus(setStatus, message);
}

function downloadQr(canvas, fileName, setStatus) {
    if (!canvas) {
        setTemporaryStatus(setStatus, "QR-код недоступен.");
        return;
    }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = fileName;
    link.click();
    setTemporaryStatus(setStatus, "QR-код скачан.");
}

function setTemporaryStatus(setStatus, message) {
    setStatus(message);
    window.setTimeout(() => setStatus(""), 2200);
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
