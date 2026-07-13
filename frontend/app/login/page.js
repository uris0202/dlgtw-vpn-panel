"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";

export default function LoginPage() {

    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function login(event) {

        event.preventDefault();
        setError("");
        setLoading(true);

        try {

            const response = await api.post("/auth/login", {
                email: email.trim(),
                password,
            });

            localStorage.setItem(
                "token",
                response.data.access_token
            );

            router.push(getNextPath());

        } catch (e) {

            setError(getErrorMessage(e, "Неверный логин или пароль"));

        } finally {

            setLoading(false);

        }
    }

    return (
        <main
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh",
                background: "#f5f7fb",
                fontFamily: "Arial",
            }}
        >
            <form
                onSubmit={login}
                style={{
                    width: 420,
                    background: "#fff",
                    borderRadius: 12,
                    padding: 35,
                    boxShadow: "0 8px 25px rgba(0,0,0,.08)",
                }}
            >
                <h1 style={{ marginBottom: 5 }}>
                    DLGTW VPN
                </h1>

                <p
                    style={{
                        color: "#666",
                        marginBottom: 25,
                    }}
                >
                    Вход в личный кабинет
                </p>

                <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                        width: "100%",
                        padding: 12,
                        marginBottom: 15,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 16,
                        boxSizing: "border-box",
                    }}
                />

                <input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                        width: "100%",
                        padding: 12,
                        marginBottom: 20,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 16,
                        boxSizing: "border-box",
                    }}
                />

                {error && (
                    <div
                        style={{
                            marginBottom: 15,
                            padding: 12,
                            borderRadius: 8,
                            background: "#fee2e2",
                            color: "#991b1b",
                            fontSize: 14,
                        }}
                    >
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: "100%",
                        padding: 13,
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 16,
                        cursor: "pointer",
                    }}
                >
                    {loading ? "Вход..." : "Войти"}
                </button>

                <a
                    href="/buy"
                    style={{
                        display: "block",
                        width: "100%",
                        boxSizing: "border-box",
                        marginTop: 12,
                        padding: 13,
                        color: "#2563eb",
                        border: "1px solid #2563eb",
                        borderRadius: 8,
                        fontSize: 16,
                        textAlign: "center",
                        textDecoration: "none",
                    }}
                >
                    Купить VPN
                </a>

                <a
                    href="/account"
                    style={{
                        display: "block",
                        marginTop: 14,
                        color: "#2563eb",
                        textAlign: "center",
                        textDecoration: "none",
                        fontWeight: 700,
                    }}
                >
                    Личный кабинет клиента
                </a>

                <div
                    style={{
                        marginTop: 20,
                        textAlign: "center",
                        color: "#666",
                    }}
                >
                    Нет аккаунта?{" "}
                    <a href="/register">
                        Зарегистрироваться
                    </a>
                </div>
            </form>
        </main>
    );
}

function getErrorMessage(error, fallback) {

    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") {
        if (detail === "Invalid credentials") {
            return "Неверный логин или пароль";
        }

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

function getNextPath() {

    const nextPath = new URLSearchParams(window.location.search).get("next");

    if (
        nextPath
        && nextPath.startsWith("/")
        && !nextPath.startsWith("//")
    ) {
        return nextPath;
    }

    return "/dashboard";

}
