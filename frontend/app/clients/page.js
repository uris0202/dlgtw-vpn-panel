"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function Clients() {

    const router = useRouter();
    const params = useSearchParams();

    const serverId = params.get("server");

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [search, setSearch] = useState("");

    async function loadClients() {

        const me = await getMe();

        if (!me) {
            router.replace("/login");
            return;
        }

        setUser(me);

        const token = localStorage.getItem("token");

        const response = await api.get(
            `/clients/${serverId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        setData(response.data);
        setLoading(false);
    }

    useEffect(() => {

        if (serverId) {
            loadClients();
        }

    }, [serverId]);

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    async function deleteClient(email) {

        if (!confirm(`Удалить клиента "${email}"?`)) {
            return;
        }

        try {

            const token = localStorage.getItem("token");

            await api.delete(
                `/clients/${serverId}/${encodeURIComponent(email)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            await loadClients();

            alert("Клиент успешно удален.");

        } catch (e) {

            console.error(e);

            alert("Ошибка удаления клиента.");

        }

    }

    if (loading) {

        return (
            <div style={{ padding: 40 }}>
                Загрузка...
            </div>
        );

    }

    const filteredClients =
        data?.clients.filter(client =>
            client.email
                .toLowerCase()
                .includes(search.toLowerCase())
        ) || [];

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

                    <h1>Клиенты</h1>

                    <p>
                        Всего: <b>{data.total}</b>
                        {" | "}
                        Онлайн: <b>{data.online}</b>
                    </p>

                    <input
                        type="text"
                        placeholder="🔍 Поиск клиента..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            marginTop: 20,
                            marginBottom: 20,
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            fontSize: 15,
                            outline: "none",
                        }}
                    />

                    <table
                        style={{
                            width: "100%",
                            background: "#fff",
                            borderCollapse: "collapse",
                            borderRadius: 12,
                            overflow: "hidden",
                            boxShadow: "0 3px 10px rgba(0,0,0,.08)",
                        }}
                    >

                        <thead>

                            <tr
                                style={{
                                    background: "#2563eb",
                                    color: "#fff",
                                }}
                            >

                                <th style={{ padding: 12 }}>Email</th>
                                <th>Группа</th>
                                <th>Трафик</th>
                                <th>Статус</th>
                                <th>Окончание</th>
                                <th>Действия</th>

                            </tr>

                        </thead>

                        <tbody>

                            {filteredClients.map(client => (

                                <tr
                                    key={client.email}
                                    style={{
                                        borderBottom: "1px solid #eee",
                                    }}
                                >

                                    <td style={{ padding: 12 }}>
                                        {client.email}
                                    </td>

                                    <td>{client.group}</td>

                                    <td>
                                        {(client.traffic / 1024 / 1024 / 1024).toFixed(2)} GB
                                    </td>

                                    <td style={{ textAlign: "center" }}>
                                        {client.enabled ? "🟢" : "🔴"}
                                    </td>

                                    <td>
                                        {
                                            client.expiry === 0
                                                ? "∞"
                                                : new Date(client.expiry).toLocaleDateString()
                                        }
                                    </td>

                                    <td>

                                        <button
                                            style={{
                                                marginRight: 8,
                                                padding: "6px 12px",
                                                border: "none",
                                                borderRadius: 6,
                                                cursor: "pointer",
                                                background: "#f59e0b",
                                                color: "#fff",
                                            }}
                                        >
                                            ✏
                                        </button>

                                        <button
                                            onClick={() => deleteClient(client.email)}
                                            style={{
                                                padding: "6px 12px",
                                                border: "none",
                                                borderRadius: 6,
                                                cursor: "pointer",
                                                background: "#ef4444",
                                                color: "#fff",
                                            }}
                                        >
                                            🗑
                                        </button>

                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            </div>

        </div>

    );

}
