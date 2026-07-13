"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import api from "../../lib/api";

export default function AccountLoginPage() {

    const router = useRouter();

    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(event) {

        event.preventDefault();
        setError("");
        setLoading(true);

        try {

            const response = await api.post(
                "/public/account/login",
                {
                    login: login.trim(),
                    password,
                },
            );

            router.push(`/account/${response.data.account_token}`);

        } catch (error) {

            setError(getErrorMessage(error, "Не удалось войти в личный кабинет."));

        } finally {

            setLoading(false);

        }

    }

    return (
        <main style={page}>
            <form
                onSubmit={submit}
                style={form}
            >
                <h1 style={title}>
                    Вход клиента
                </h1>

                <p style={subtitle}>
                    Вход для клиентов DLGTW VPN
                </p>

                <label style={field}>
                    <span style={label}>
                        Логин
                    </span>

                    <input
                        value={login}
                        onChange={(event) => setLogin(event.target.value)}
                        required
                        autoComplete="username"
                        style={input}
                    />
                </label>

                <label style={field}>
                    <span style={label}>
                        Пароль
                    </span>

                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        autoComplete="current-password"
                        style={input}
                    />
                </label>

                {error && (
                    <div style={errorBox}>
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        ...primaryButton,
                        opacity: loading ? .7 : 1,
                        cursor: loading ? "not-allowed" : "pointer",
                    }}
                >
                    {loading ? "Вход..." : "Войти"}
                </button>

                <a
                    href="/buy"
                    style={secondaryLink}
                >
                    Купить VPN
                </a>

                <a
                    href="/login"
                    style={adminLink}
                >
                    Вход администратора
                </a>
            </form>
        </main>
    );

}

function getErrorMessage(error, fallback) {

    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") {
        return detail;
    }

    if (Array.isArray(detail)) {
        return detail
            .map((item) => item?.msg)
            .filter(Boolean)
            .join(". ");
    }

    return error?.message || fallback;

}

const page = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "#f5f7fb",
    fontFamily: "Arial",
};

const form = {
    width: "100%",
    maxWidth: 420,
    padding: 32,
    borderRadius: 10,
    background: "#fff",
    boxShadow: "0 8px 25px rgba(0,0,0,.08)",
};

const title = {
    margin: "0 0 8px",
};

const subtitle = {
    margin: "0 0 22px",
    color: "#6b7280",
};

const field = {
    display: "grid",
    gap: 6,
    marginBottom: 14,
};

const label = {
    color: "#374151",
    fontSize: 14,
    fontWeight: 700,
};

const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 15,
};

const primaryButton = {
    width: "100%",
    padding: 13,
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontSize: 16,
};

const secondaryLink = {
    display: "block",
    marginTop: 14,
    color: "#2563eb",
    textAlign: "center",
    textDecoration: "none",
    fontWeight: 700,
};

const adminLink = {
    display: "block",
    marginTop: 12,
    color: "#6b7280",
    textAlign: "center",
    textDecoration: "none",
    fontSize: 14,
};

const errorBox = {
    marginBottom: 14,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};
