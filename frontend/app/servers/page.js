"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";

import { getMe } from "../../lib/auth";
import { getDashboard } from "../../lib/dashboard";

export default function Servers() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        async function load() {

            const me = await getMe();

            if (!me) {
                router.replace("/login");
                return;
            }

            setUser(me);

            const data = await getDashboard();

            setServers(data);

            setLoading(false);

        }

        load();

    }, [router]);

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    if (loading) {
        return (
            <div
                style={{
                    padding: 40,
                    fontFamily: "Arial",
                }}
            >
                Загрузка...
            </div>
        );
    }

    return (

        <div
            style={{
                display: "flex",
                minHeight: "100vh",
                background: "#f5f7fb",
                fontFamily: "Arial",
            }}
        >

            <Sidebar />

            <div style={{ flex: 1 }}>

                <Header
                    user={user}
                    onLogout={logout}
                />

                <div style={{ padding: 30 }}>

                    <h1>Серверы</h1>

                    <div
                        style={{
                            display: "grid",
                            gap: 20,
                            marginTop: 20,
                        }}
                    >

                        {servers.map((server) => (

                            <div
                                key={server.id}
                                style={{
                                    background: "#fff",
                                    borderRadius: 12,
                                    padding: 20,
                                    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
                                }}
                            >

                                <h2 style={{ marginBottom: 10 }}>
                                    {server.name}
                                </h2>

                                <p>🌍 {server.country}</p>

                                <p>👥 Клиентов: <b>{server.clients}</b></p>

                                <p>🟢 Онлайн: <b>{server.online}</b></p>

                                <p>✅ Активных: <b>{server.enabled}</b></p>

                                <p>⛔ Отключено: <b>{server.disabled}</b></p>

                                <button
                                    onClick={() =>
                                        router.push(`/clients?server=${server.id}`)
                                    }
                                    style={{
                                        marginTop: 20,
                                        padding: "10px 20px",
                                        border: "none",
                                        borderRadius: 8,
                                        cursor: "pointer",
                                        background: "#2563eb",
                                        color: "#fff",
                                        fontSize: 14,
                                    }}
                                >
                                    Открыть клиентов
                                </button>

                            </div>

                        ))}

                    </div>

                </div>

            </div>

        </div>

    );

}
