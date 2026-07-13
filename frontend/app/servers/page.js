"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import ServerModal from "../../components/ServerModal";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function Servers() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pageError, setPageError] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedServer, setSelectedServer] = useState(null);
    const [modalError, setModalError] = useState("");
    const [saving, setSaving] = useState(false);

    async function loadServers() {

        setPageError("");

        const me = await getMe();

        if (!me) {
            router.replace("/login");
            return;
        }

        setUser(me);

        try {

            const authConfig = getAuthConfig();

            const [serversResponse, dashboardResponse] = await Promise.all([
                api.get("/servers", authConfig),
                api.get("/dashboard", authConfig),
            ]);

            setServers(
                mergeServersWithStats(
                    serversResponse.data,
                    dashboardResponse.data,
                )
            );

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось загрузить серверы."));

        } finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        loadServers();

    }, [router]);

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    async function refreshServers() {

        setRefreshing(true);

        try {
            await loadServers();
        } finally {
            setRefreshing(false);
        }

    }

    function openCreateModal() {

        setModalError("");
        setModalMode("create");
        setSelectedServer(null);
        setModalOpen(true);

    }

    function openEditModal(server) {

        setModalError("");
        setModalMode("edit");
        setSelectedServer(server);
        setModalOpen(true);

    }

    function closeModal() {

        if (saving) {
            return;
        }

        setModalOpen(false);
        setModalError("");
        setSelectedServer(null);
        setModalMode("create");

    }

    async function saveServer(payload) {

        setSaving(true);
        setModalError("");

        try {

            if (modalMode === "edit" && selectedServer) {
                await api.patch(
                    `/servers/${selectedServer.id}`,
                    payload,
                    getAuthConfig(),
                );
            } else {
                await api.post(
                    "/servers",
                    payload,
                    getAuthConfig(),
                );
            }

            setModalOpen(false);
            setSelectedServer(null);
            setModalMode("create");
            await loadServers();

        } catch (error) {

            const fallback = modalMode === "edit"
                ? "Не удалось сохранить сервер."
                : "Не удалось создать сервер.";

            setModalError(getErrorMessage(error, fallback));

        } finally {

            setSaving(false);

        }

    }

    async function deleteServer(server) {

        if (!confirm(`Удалить сервер "${server.name}"?`)) {
            return;
        }

        setPageError("");

        try {

            await api.delete(
                `/servers/${server.id}`,
                getAuthConfig(),
            );

            await loadServers();

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось удалить сервер."));

        }

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

                    <div style={pageHeader}>
                        <div>
                            <h1 style={{ marginBottom: 8 }}>
                                Серверы
                            </h1>

                            <p style={{ margin: 0, color: "#6b7280" }}>
                                Управление VPN-серверами 3X-UI.
                            </p>
                        </div>

                        <div style={headerActions}>
                            <button
                                onClick={refreshServers}
                                disabled={refreshing}
                                style={secondaryButton}
                            >
                                {refreshing ? "Обновление..." : "Обновить"}
                            </button>

                            <button
                                onClick={openCreateModal}
                                style={primaryButton}
                            >
                                Новый сервер
                            </button>
                        </div>
                    </div>

                    {pageError && (
                        <div style={errorBox}>
                            {pageError}
                        </div>
                    )}

                    {servers.length === 0 && (
                        <div style={emptyBox}>
                            Серверы пока не добавлены.
                        </div>
                    )}

                    <div style={grid}>
                        {servers.map((server) => (

                            <div
                                key={server.id}
                                style={card}
                            >
                                <div style={cardHeader}>
                                    <div>
                                        <h2 style={{ margin: "0 0 8px" }}>
                                            {server.name}
                                        </h2>

                                        <div style={muted}>
                                            {server.country}
                                        </div>
                                    </div>

                                    <span
                                        style={{
                                            ...badge,
                                            background: server.enabled ? "#dcfce7" : "#fee2e2",
                                            color: server.enabled ? "#166534" : "#991b1b",
                                        }}
                                    >
                                        {server.enabled ? "Активен" : "Отключен"}
                                    </span>
                                </div>

                                <div style={details}>
                                    <div>
                                        Host: <b>{server.host}</b>
                                    </div>

                                    <div>
                                        Base path: <b>{server.base_path || "-"}</b>
                                    </div>

                                    <div>
                                        Статус 3X-UI:{" "}
                                        <b>
                                            {server.status === "offline" ? "Недоступен" : "Доступен"}
                                        </b>
                                    </div>

                                    {server.error && (
                                        <div style={serverError}>
                                            {server.error}
                                        </div>
                                    )}
                                </div>

                                <div style={statsGrid}>
                                    <Stat label="Клиентов" value={server.clients ?? 0} />
                                    <Stat label="Онлайн" value={server.online ?? 0} />
                                    <Stat label="Активных" value={server.enabled_clients ?? 0} />
                                    <Stat label="Отключено" value={server.disabled_clients ?? 0} />
                                </div>

                                <div style={cardActions}>
                                    <button
                                        onClick={() => router.push(`/clients?server=${server.id}`)}
                                        style={primaryButton}
                                    >
                                        Открыть клиентов
                                    </button>

                                    <button
                                        onClick={() => openEditModal(server)}
                                        style={secondaryButton}
                                    >
                                        Редактировать
                                    </button>

                                    <button
                                        onClick={() => deleteServer(server)}
                                        style={dangerButton}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>

                        ))}
                    </div>

                </div>

            </div>

            <ServerModal
                open={modalOpen}
                mode={modalMode}
                server={selectedServer}
                error={modalError}
                saving={saving}
                onClose={closeModal}
                onSave={saveServer}
            />

        </div>

    );

}

function Stat({
    label,
    value,
}) {
    return (
        <div style={statBox}>
            <div style={statValue}>
                {value}
            </div>

            <div style={statLabel}>
                {label}
            </div>
        </div>
    );
}

function mergeServersWithStats(servers, stats) {

    const statsById = new Map(
        (stats || []).map((item) => [item.id, item])
    );

    return (servers || []).map((server) => {

        const serverStats = statsById.get(server.id) || {};

        return {
            ...server,
            status: serverStats.status || "online",
            error: serverStats.error,
            clients: serverStats.clients,
            online: serverStats.online,
            enabled_clients: serverStats.enabled,
            disabled_clients: serverStats.disabled,
        };

    });

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

const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    marginBottom: 20,
};

const headerActions = {
    display: "flex",
    gap: 10,
};

const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
};

const card = {
    background: "#fff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
};

const cardHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
};

const muted = {
    color: "#6b7280",
    fontSize: 14,
};

const badge = {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
};

const details = {
    display: "grid",
    gap: 8,
    marginBottom: 18,
    color: "#374151",
    fontSize: 14,
};

const serverError = {
    padding: 10,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
};

const statsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
    marginBottom: 18,
};

const statBox = {
    padding: 10,
    borderRadius: 8,
    background: "#f9fafb",
    textAlign: "center",
};

const statValue = {
    fontSize: 20,
    fontWeight: 700,
};

const statLabel = {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
};

const cardActions = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 10,
};

const primaryButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
};

const secondaryButton = {
    padding: "10px 16px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    cursor: "pointer",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const dangerButton = {
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: "#ef4444",
    color: "#fff",
    fontSize: 14,
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
