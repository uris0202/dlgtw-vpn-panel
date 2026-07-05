"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";

export default function LoginPage() {

    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    async function login() {
        try {

            const response = await api.post("/auth/login", {
                email,
                password,
            });

            localStorage.setItem(
                "token",
                response.data.access_token
            );

            router.push("/dashboard");

        } catch (e) {

            alert("Неверный логин или пароль");
            console.error(e);

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
            <div
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

                <button
                    onClick={login}
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
                    Войти
                </button>

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
            </div>
        </main>
    );
}
