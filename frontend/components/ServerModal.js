"use client";

import { useEffect, useState } from "react";
import {
    Save,
    Server,
    X,
} from "lucide-react";

import useDialogLifecycle from "../lib/useDialogLifecycle";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function ServerModal({
    open,
    mode = "create",
    server = null,
    error,
    saving,
    onClose,
    onSave,
}) {
    const isEdit = mode === "edit";
    const [name, setName] = useState("");
    const [country, setCountry] = useState("");
    const [host, setHost] = useState("");
    const [basePath, setBasePath] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (!open) {
            return;
        }

        if (isEdit && server) {
            setName(server.name || "");
            setCountry(server.country || "");
            setHost(server.host || "");
            setBasePath(server.base_path || "");
            setUsername(server.username || "");
            setPassword("");
            setEnabled(Boolean(server.enabled));
            return;
        }

        setName("");
        setCountry("");
        setHost("");
        setBasePath("");
        setUsername("");
        setPassword("");
        setEnabled(true);
    }, [open, isEdit, server]);

    useDialogLifecycle(open, onClose, saving);

    if (!open) {
        return null;
    }

    function submit(event) {
        event.preventDefault();

        const payload = {
            name: name.trim(),
            country: country.trim(),
            host: host.trim(),
            base_path: basePath.trim(),
            enabled,
        };

        if (!isEdit || username.trim().length > 0) {
            payload.username = username.trim();
        }

        if (!isEdit || password.length > 0) {
            payload.password = password;
        }

        onSave(payload);
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5"
            onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
        >
            <form
                onSubmit={submit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="server-modal-title"
                className="max-h-[96dvh] w-full overflow-y-auto overscroll-contain rounded-t-lg border border-border bg-card shadow-2xl sm:max-w-xl sm:rounded-lg"
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#eff4ff] text-primary">
                            <Server className="size-4" />
                        </div>
                        <div>
                            <h2 id="server-modal-title" className="m-0 text-base font-semibold">
                                {isEdit ? "Редактирование сервера" : "Новый сервер"}
                            </h2>
                            <p className="mt-1 mb-0 text-xs text-muted-foreground">Подключение и учётные данные 3X-UI</p>
                        </div>
                    </div>

                    <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={saving} title="Закрыть" aria-label="Закрыть">
                        <X />
                    </Button>
                </div>

                <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-5">
                    <Field label="Название">
                        <Input value={name} onChange={(event) => setName(event.target.value)} required disabled={saving} />
                    </Field>
                    <Field label="Страна">
                        <Input value={country} onChange={(event) => setCountry(event.target.value)} required disabled={saving} />
                    </Field>
                    <Field label="3X-UI URL" className="sm:col-span-2">
                        <Input type="url" value={host} onChange={(event) => setHost(event.target.value)} placeholder="https://1.2.3.4:10000" required disabled={saving} />
                    </Field>
                    <Field label="Base path" className="sm:col-span-2">
                        <Input value={basePath} onChange={(event) => setBasePath(event.target.value)} placeholder="Например: webtlsroot" disabled={saving} />
                    </Field>
                    <Field label="Логин 3X-UI">
                        <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder={isEdit ? "Оставить текущий" : ""} required={!isEdit} disabled={saving} />
                    </Field>
                    <Field label={isEdit ? "Новый пароль 3X-UI" : "Пароль 3X-UI"}>
                        <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isEdit ? "Оставить текущий" : ""} required={!isEdit} disabled={saving} />
                    </Field>

                    <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => setEnabled(event.target.checked)}
                            disabled={saving}
                            className="size-4 accent-[#155eef]"
                        />
                        Сервер активен
                    </label>

                    {error && <Alert variant="error" className="sm:col-span-2">{error}</Alert>}
                </div>

                <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-border bg-card px-4 py-4 sm:flex sm:justify-end sm:px-5">
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Отмена</Button>
                    <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                        <Save />
                        {saving ? "Сохранение..." : "Сохранить"}
                    </Button>
                </div>
            </form>
        </div>
    );
}

function Field({ label, className = "", children }) {
    return (
        <label className={`grid gap-1.5 text-sm font-medium ${className}`}>
            <span>{label}</span>
            {children}
        </label>
    );
}
