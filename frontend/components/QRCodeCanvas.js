"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export default function QRCodeCanvas({
    value,
    size = 220,
    canvasRef,
}) {

    const internalCanvasRef = useRef(null);
    const [error, setError] = useState("");
    const activeCanvasRef = canvasRef || internalCanvasRef;

    useEffect(() => {

        if (!value || !activeCanvasRef.current) {
            return;
        }

        setError("");

        QRCode.toCanvas(
            activeCanvasRef.current,
            value,
            {
                width: size,
                margin: 2,
                errorCorrectionLevel: "M",
                color: {
                    dark: "#111827",
                    light: "#ffffff",
                },
            },
        ).catch(() => {
            setError("Не удалось создать QR-код.");
        });

    }, [value, size, activeCanvasRef]);

    if (!value) {
        return (
            <div style={emptyState}>
                Ссылка недоступна
            </div>
        );
    }

    return (
        <div style={wrapper}>
            <canvas
                ref={activeCanvasRef}
                width={size}
                height={size}
                style={{
                    width: size,
                    height: size,
                    display: "block",
                }}
            />

            {error && (
                <div style={errorText}>
                    {error}
                </div>
            )}
        </div>
    );

}

const wrapper = {
    display: "inline-block",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
};

const emptyState = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 220,
    height: 220,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    color: "#6b7280",
    fontSize: 14,
};

const errorText = {
    marginTop: 8,
    color: "#991b1b",
    fontSize: 13,
};
