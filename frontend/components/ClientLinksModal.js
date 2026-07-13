"use client";

import { useRef, useState } from "react";

import QRCodeCanvas from "./QRCodeCanvas";

export default function ClientLinksModal({
    client,
    onClose,
}) {

    if (!client) {
        return null;
    }

    return (
        <div style={overlay}>
            <div style={modal}>
                <div style={header}>
                    <div>
                        <h2 style={title}>
                            Ссылки клиента
                        </h2>

                        <div style={subtitle}>
                            {client.email}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={closeButton}
                    >
                        Закрыть
                    </button>
                </div>

                <div style={sections}>
                    <LinkSection
                        title="VLESS"
                        value={client.vless_url}
                        copyMessage="VLESS ссылка скопирована."
                    />

                    <LinkSection
                        title="Subscription URL"
                        value={client.subscription_url}
                        copyMessage="Subscription URL скопирован."
                    />
                </div>
            </div>
        </div>
    );

}

function LinkSection({
    title,
    value,
    copyMessage,
}) {

    const qrRef = useRef(null);
    const [status, setStatus] = useState("");
    const fileName = `${title.toLowerCase().replace(/\s+/g, "-")}-qr.png`;

    return (
        <div style={section}>
            <div style={sectionInfo}>
                <h3 style={sectionTitle}>
                    {title}
                </h3>

                <textarea
                    readOnly
                    value={value || "Ссылка недоступна"}
                    style={textarea}
                />

                <button
                    type="button"
                    onClick={() => copyText(
                        value,
                        copyMessage,
                        setStatus,
                    )}
                    disabled={!value}
                    style={{
                        ...copyButton,
                        background: value ? "#2563eb" : "#9ca3af",
                        cursor: value ? "pointer" : "not-allowed",
                    }}
                >
                    Copy
                </button>

                <button
                    type="button"
                    onClick={() => downloadQr(
                        qrRef.current,
                        fileName,
                        setStatus,
                    )}
                    disabled={!value}
                    style={{
                        ...downloadButton,
                        background: value ? "#111827" : "#9ca3af",
                        cursor: value ? "pointer" : "not-allowed",
                    }}
                >
                    Скачать QR
                </button>

                {status && (
                    <div style={statusText}>
                        {status}
                    </div>
                )}
            </div>

            <QRCodeCanvas
                value={value}
                canvasRef={qrRef}
            />
        </div>
    );

}

async function copyText(value, message, setStatus) {

    if (!value) {
        setTemporaryStatus(setStatus, "Ссылка недоступна.");
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        setTemporaryStatus(setStatus, message);
    } catch {
        fallbackCopy(value);
        setTemporaryStatus(setStatus, message);
    }

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

    window.setTimeout(() => {
        setStatus("");
    }, 2200);

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

const overlay = {
    position: "fixed",
    inset: 0,
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "rgba(17,24,39,.55)",
};

const modal = {
    width: "100%",
    maxWidth: 920,
    maxHeight: "90vh",
    overflow: "auto",
    padding: 24,
    borderRadius: 10,
    background: "#fff",
    boxShadow: "0 18px 45px rgba(0,0,0,.25)",
};

const header = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 22,
};

const title = {
    margin: 0,
    fontSize: 22,
};

const subtitle = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 14,
};

const closeButton = {
    padding: "9px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    cursor: "pointer",
};

const sections = {
    display: "grid",
    gap: 18,
};

const section = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 20,
    alignItems: "start",
    padding: 18,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#f9fafb",
};

const sectionInfo = {
    minWidth: 0,
};

const sectionTitle = {
    marginTop: 0,
    marginBottom: 10,
    fontSize: 16,
};

const textarea = {
    width: "100%",
    minHeight: 84,
    resize: "vertical",
    boxSizing: "border-box",
    padding: 10,
    border: "1px solid #d1d5db",
    borderRadius: 7,
    background: "#fff",
    color: "#111827",
    fontSize: 13,
    lineHeight: 1.45,
};

const copyButton = {
    marginTop: 10,
    marginRight: 8,
    padding: "9px 14px",
    border: "none",
    borderRadius: 7,
    color: "#fff",
};

const downloadButton = {
    marginTop: 10,
    padding: "9px 14px",
    border: "none",
    borderRadius: 7,
    color: "#fff",
};

const statusText = {
    marginTop: 10,
    color: "#047857",
    fontSize: 13,
};
