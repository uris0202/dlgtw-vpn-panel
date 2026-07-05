"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import StatCard from "../../components/StatCard";

import { getMe } from "../../lib/auth";
import { getDashboard } from "../../lib/dashboard";

export default function Dashboard() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        async function loadUser() {

            const me = await getMe();

            if (!me) {

                router.replace("/login");

                return;

            }

            setUser(me);

            const dashboard = await getDashboard();

            setServers(dashboard);

            setLoading(false);

        }

        loadUser();

    }, [router]);

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    if (loading) {

        return (
            <div
                style={{
                    padding: 50,
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
                background: "#f5f7fb",
                minHeight: "100vh",
                fontFamily: "Arial",
            }}
        >

            <Sidebar />

            <div
                style={{
                    flex: 1,
                }}
            >

                <Header
                    user={user}
                    onLogout={logout}
                />

                <div
                    style={{
                        padding: 30,
                    }}
                >

                    <h1>
                        Добро пожаловать 👋
                    </h1>

                    <p
                        style={{
                            color: "#666",
                            marginBottom: 30,
                        }}
                    >
                        Вы вошли как <b>{user.email}</b>
                    </p>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4,1fr)",
                            gap: 20,
                        }}
                    >

                        <StatCard
                            title="Серверов"
                            value={servers.length}
                        />

                        <StatCard
                            title="Всего клиентов"
                            value={
                                servers.reduce(
                                    (sum, server) => sum + server.clients,
                                    0
                                )
                            }
                        />

                        <StatCard
                            title="Онлайн"
                            value={
                                servers.reduce(
                                    (sum, server) => sum + server.online,
                                    0
                                )
                            }
                        />

                        <StatCard
                            title="Активных серверов"
                            value={
                                servers.filter(
                                    server => !server.status
                                ).length
                            }
                        />

                    </div>

                    <div
                        style={{
                            marginTop: 30,
                            display: "grid",
                            gap: 20,
                        }}
                    >

                        {servers.map(server => (

                            <div
                                key={server.id}
                                style={{
                                    background: "white",
                                    borderRadius: 12,
                                    padding: 20,
                                    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
                                }}
                            >

                                <h2>
                                    {server.name}
                                </h2>

                                <div
                                    style={{
                                        color: "#666",
                                        marginTop: 10,
                                    }}
                                >
                                    🌍 {server.country}
                                </div>

                                <div
                                    style={{
                                        marginTop: 15,
                                    }}
                                >
                                    👥 Клиентов: <b>{server.clients}</b>
                                </div>

                                <div>
                                    🟢 Онлайн: <b>{server.online}</b>
                                </div>

                                <div>
                                    ✅ Активных: <b>{server.enabled}</b>
                                </div>

                                <div>
                                    ⛔ Отключено: <b>{server.disabled}</b>
                                </div>

                            </div>

                        ))}

                    </div>

                </div>

            </div>

        </div>

    );

}
