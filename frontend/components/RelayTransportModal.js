"use client";

import { useEffect, useState } from "react";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function RelayTransportModal({ server, saving, error, onClose, onSave, loadDetails }) {
    const [routes, setRoutes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [inboundId, setInboundId] = useState("");
    const [mode, setMode] = useState("tcp");
    const [port, setPort] = useState("8443");
    const [serverName, setServerName] = useState("");

    useEffect(() => {
        if (!server) return;
        let cancelled = false;
        setRoutes([]);
        setLoadError("");
        setLoading(true);
        loadDetails(server.id).then((response) => {
            if (cancelled) return;
            const received = response.data?.transports || [];
            setRoutes(received);
            if (!received.length) {
                setLoadError("У сервера нет настроенных входящих маршрутов.");
                return;
            }
            const route = received[0];
            setInboundId(String(route.inbound_id));
            setMode(route.mode || "tcp");
            setPort(String(route.mode === "tls" ? route.target_port : 8443));
            setServerName(route.tls_server_name || "");
        }).catch(() => {
            if (!cancelled) setLoadError("Не удалось получить параметры транспорта.");
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [server, loadDetails]);

    if (!server) return null;

    function selectRoute(id) {
        setInboundId(id);
        const route = routes.find((item) => String(item.inbound_id) === id);
        if (!route) return;
        setMode(route.mode || "tcp");
        setPort(String(route.mode === "tls" ? route.target_port : 8443));
        setServerName(route.tls_server_name || "");
    }

    function submit(event) {
        event.preventDefault();
        const payload = { inbound_id: Number(inboundId), mode };
        if (mode === "tls") {
            payload.tls_port = Number(port);
            payload.tls_server_name = serverName.trim();
        }
        onSave(payload);
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5"
             onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
            <form role="dialog" aria-modal="true" aria-labelledby="relay-transport-title"
                  onSubmit={submit} className="max-h-[96dvh] w-full overflow-y-auto rounded-t-lg border border-border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-lg">
                <h2 id="relay-transport-title" className="m-0 text-lg font-semibold">Транспорт VPN — {server.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">Настройки канала Санкт-Петербург → VPN-сервер. Клиентский VLESS/REALITY не меняется.</p>
                <label className="mt-4 grid gap-1.5 text-sm font-medium">
                    Inbound 3X-UI
                    <select value={inboundId} onChange={(event) => selectRoute(event.target.value)} disabled={saving}
                            className="min-h-10 rounded-md border border-border bg-card px-3">
                        {routes.map((item) => <option key={item.inbound_id} value={String(item.inbound_id)}>#{item.inbound_id} — {item.mode?.toUpperCase()}</option>)}
                    </select>
                </label>
                <label className="mt-4 grid gap-1.5 text-sm font-medium">
                    Транспорт
                    <select value={mode} onChange={(event) => setMode(event.target.value)} disabled={saving}
                            className="min-h-10 rounded-md border border-border bg-card px-3">
                        <option value="tcp">TCP</option>
                        <option value="tls">TLS (mTLS)</option>
                    </select>
                </label>
                {mode === "tls" && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm font-medium">Порт stunnel
                            <Input type="number" min="1" max="65535" required value={port} disabled={saving}
                                   onChange={(event) => setPort(event.target.value)} />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">Имя сертификата сервера
                            <Input required value={serverName} disabled={saving} placeholder="node.dlvpn.internal"
                                   onChange={(event) => setServerName(event.target.value)} />
                        </label>
                    </div>
                )}
                <p className="mt-4 text-xs text-muted-foreground">Для mTLS на удалённом сервере должен заранее работать stunnel и быть установлен сертификат от доверенного CA. При изменении транспорта HAProxy плавно перезагружается; кратковременный риск нарушения соединений сохраняется.</p>
                {loadError && <Alert variant="error" className="mt-4">{loadError}</Alert>}
                {error && <Alert variant="error" className="mt-4">{error}</Alert>}
                <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
                    <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Отмена</Button>
                    <Button type="submit" disabled={saving || loading || routes.length === 0 || !inboundId}>
                        {saving ? "Применение..." : "Проверить и применить"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
