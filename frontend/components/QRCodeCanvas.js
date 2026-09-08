"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import QRCode from "qrcode";

import { cn } from "../lib/utils";

export default function QRCodeCanvas({
    value,
    size = 220,
    canvasRef,
    className,
}) {
    const internalCanvasRef = useRef(null);
    const [error, setError] = useState("");
    const activeCanvasRef = canvasRef || internalCanvasRef;

    useEffect(() => {
        if (!value || !activeCanvasRef.current) return;

        setError("");
        QRCode.toCanvas(activeCanvasRef.current, value, {
            width: size,
            margin: 2,
            errorCorrectionLevel: "M",
            color: {
                dark: "#171717",
                light: "#ffffff",
            },
        }).catch(() => setError("Не удалось создать QR-код."));
    }, [value, size, activeCanvasRef]);

    if (!value) {
        return (
            <div
                className={cn("flex aspect-square w-full max-w-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted text-center text-xs text-muted-foreground", className)}
                style={{ width: size }}
            >
                <QrCode className="size-6" />
                Ссылка недоступна
            </div>
        );
    }

    return (
        <div className={cn("inline-block max-w-full rounded-lg border border-border bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
            <canvas
                ref={activeCanvasRef}
                width={size}
                height={size}
                className="block h-auto max-w-full"
                style={{ width: size }}
            />
            {error && <div className="mt-2 max-w-56 text-xs text-[#b42318]">{error}</div>}
        </div>
    );
}
