"use client";

import { useEffect, useState } from "react";

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
        <div style={overlay}>
            <form
                onSubmit={submit}
                style={modal}
            >
                <h2 style={{ marginTop: 0, marginBottom: 20 }}>
                    {isEdit ? "Редактирование сервера" : "Новый сервер"}
                </h2>

                <label style={label}>Название</label>
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    disabled={saving}
                    style={input}
                />

                <label style={label}>Страна</label>
                <input
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    required
                    disabled={saving}
                    style={input}
                />

                <label style={label}>3X-UI URL</label>
                <input
                    type="url"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="https://1.2.3.4:10000"
                    required
                    disabled={saving}
                    style={input}
                />

                <label style={label}>Base path</label>
                <input
                    value={basePath}
                    onChange={(event) => setBasePath(event.target.value)}
                    placeholder="Например: webtlsroot"
                    disabled={saving}
                    style={input}
                />

                <label style={label}>Логин 3X-UI</label>
                <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={isEdit ? "Оставить текущий логин" : ""}
                    required={!isEdit}
                    disabled={saving}
                    style={input}
                />

                <label style={label}>
                    {isEdit ? "Новый пароль 3X-UI" : "Пароль 3X-UI"}
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isEdit ? "Оставить текущий пароль" : ""}
                    required={!isEdit}
                    disabled={saving}
                    style={input}
                />

                <label style={checkboxRow}>
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => setEnabled(event.target.checked)}
                        disabled={saving}
                    />
                    Активен
                </label>

                {error && (
                    <div style={errorBox}>
                        {error}
                    </div>
                )}

                <div style={actions}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={secondaryButton}
                    >
                        Отмена
                    </button>

                    <button
                        type="submit"
                        disabled={saving}
                        style={primaryButton}
                    >
                        {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                </div>
            </form>
        </div>
    );

}

const overlay = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    background: "rgba(0,0,0,.45)",
};

const modal = {
    width: "100%",
    maxWidth: 500,
    padding: 25,
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 10px 35px rgba(0,0,0,.25)",
};

const label = {
    display: "block",
    marginBottom: 5,
    fontSize: 14,
    fontWeight: 600,
};

const input = {
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 15,
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
    fontSize: 14,
};

const checkboxRow = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 5,
    fontSize: 14,
};

const errorBox = {
    marginTop: 18,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const actions = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 25,
};

const primaryButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 6,
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
};

const secondaryButton = {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
};
