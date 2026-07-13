"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";

export default function RegisterPage() {

    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordRepeat, setPasswordRepeat] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function register(event) {

        event.preventDefault();
        setError("");

        if (password !== passwordRepeat) {
            setError("Пароли не совпадают.");
            return;
        }

        setLoading(true);

        try {

            await api.post("/auth/register", {
                email: email.trim(),
                password,
            });

            const response = await api.post("/auth/login", {
                email: email.trim(),
                password,
            });

            localStorage.setItem(
                "token",
                response.data.access_token
            );

            router.push("/dashboard");

        } catch (error) {

            setError(getErrorMessage(error, "Не удалось создать аккаунт."));

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
                onSubmit={register}
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
                    Создание аккаунта
                </p>

                <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    style={inputStyle}
                />

                <input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    style={inputStyle}
                />

                <input
                    type="password"
                    placeholder="Повторите пароль"
                    value={passwordRepeat}
                    onChange={(event) => setPasswordRepeat(event.target.value)}
                    required
                    style={inputStyle}
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
                    {loading ? "Создание..." : "Создать аккаунт"}
                </button>

                <div
                    style={{
                        marginTop: 20,
                        textAlign: "center",
                        color: "#666",
                    }}
                >
                    Уже есть аккаунт?{" "}
                    <a href="/login">
                        Войти
                    </a>
                </div>
            </form>
        </main>
    );

}

function getErrorMessage(error, fallback) {

    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") {
        if (detail === "Email already exists") {
            return "Пользователь с таким email уже существует.";
        }

        if (detail === "Registration is closed") {
            return "Регистрация закрыта. Войдите под существующим аккаунтом.";
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

const inputStyle = {
    width: "100%",
    padding: 12,
    marginBottom: 15,
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 16,
    boxSizing: "border-box",
};
