"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function SearchPage() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pageError, setPageError] = useState("");

    useEffect(() => {

        async function loadUser() {

            const me = await getMe();

            if (!me) {
                router.replace("/login");
                return;
            }

            setUser(me);

        }

        loadUser();

    }, [router]);

    async function searchClient(event) {

        event.preventDefault();

        const normalizedQuery = query.trim();

        if (!normalizedQuery) {
            setPageError("Введите имя клиента или псевдоним.");
            return;
        }

        setLoading(true);
        setPageError("");
        setSearched(false);

        try {

            const me = await getMe();

            if (!me) {
                router.replace("/login");
                return;
            }

            setUser(me);

            const response = await api.get(
                `/clients/search/${encodeURIComponent(normalizedQuery)}`,
                getAuthConfig(),
            );

            setResults(Array.isArray(response.data) ? response.data : []);
            setSearched(true);

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось выполнить поиск."));

        } finally {

            setLoading(false);

        }

    }

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

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
                    <h1 style={{ marginBottom: 8 }}>
                        Поиск клиента
                    </h1>

                    <p
                        style={{
                            marginTop: 0,
                            marginBottom: 20,
                            color: "#6b7280",
                        }}
                    >
                        Можно искать по имени клиента, группе или комментарию на всех VPN-серверах.
                    </p>

                    <form
                        onSubmit={searchClient}
                        style={{
                            display: "flex",
                            gap: 12,
                            marginBottom: 20,
                        }}
                    >
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Имя клиента или псевдоним"
                            style={inputStyle}
                        />

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: "0 20px",
                                border: "none",
                                borderRadius: 8,
                                background: "#2563eb",
                                color: "#fff",
                                cursor: loading ? "not-allowed" : "pointer",
                                fontSize: 15,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {loading ? "Поиск..." : "Найти"}
                        </button>
                    </form>

                    {pageError && (
                        <div style={errorBox}>
                            {pageError}
                        </div>
                    )}

                    {searched && results.length === 0 && (
                        <div style={emptyBox}>
                            Клиент не найден.
                        </div>
                    )}

                    {results.length > 0 && (
                        <>
                            <div style={resultSummary}>
                                Найдено: <b>{results.length}</b>
                            </div>

                            <div
                                style={{
                                    display: "grid",
                                    gap: 12,
                                }}
                            >
                            {results.map((client) => (
                                <div
                                    key={`${client.server_id}-${client.email}`}
                                    style={resultCard}
                                >
                                    <div>
                                        <h3 style={{ margin: "0 0 8px" }}>
                                            {client.email}
                                        </h3>

                                        <div style={metaLine}>
                                            Сервер: <b>{client.server}</b>
                                            {" | "}
                                            Страна: <b>{client.country}</b>
                                        </div>

                                        <div style={metaLine}>
                                            Группа: <b>{client.group || "-"}</b>
                                            {" | "}
                                            Статус: <b>{client.enabled ? "Активен" : "Отключен"}</b>
                                            {" | "}
                                            Трафик: <b>{formatTraffic(client.traffic)}</b>
                                        </div>

                                        <div style={metaLine}>
                                            Окончание: <b>{formatExpiry(client.expiry)}</b>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => router.push(`/clients?server=${client.server_id}&q=${encodeURIComponent(client.email)}`)}
                                        style={openButton}
                                    >
                                        Открыть сервер
                                    </button>
                                </div>
                            ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

}

function getAuthConfig() {

    const token = localStorage.getItem("token");

    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };

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

function formatTraffic(value) {

    const bytes = Number(value || 0);

    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

}

function formatExpiry(value) {

    if (!value || value === 0) {
        return "Без срока";
    }

    return new Date(value).toLocaleDateString("ru-RU");

}

const inputStyle = {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 15,
    outline: "none",
};

const errorBox = {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const emptyBox = {
    padding: 18,
    borderRadius: 8,
    background: "#fff",
    color: "#6b7280",
    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
};

const resultCard = {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    padding: 18,
    borderRadius: 8,
    background: "#fff",
    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
};

const resultSummary = {
    marginBottom: 12,
    color: "#6b7280",
    fontSize: 14,
};

const metaLine = {
    marginBottom: 6,
    color: "#374151",
    fontSize: 14,
};

const openButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
};
