"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Pencil,
    Plus,
    RefreshCw,
    Server as ServerIcon,
    Trash2,
    Users,
    Wifi,
    WifiOff,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import ServerModal from "../../components/ServerModal";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

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
            <AdminLayout user={user} onLogout={logout}>
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Загрузка серверов...
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Серверы"
                description={`${servers.length} серверов подключено к панели`}
                actions={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={refreshServers}
                            disabled={refreshing}
                        >
                            <RefreshCw className={refreshing ? "animate-spin" : ""} />
                            {refreshing ? "Обновление..." : "Обновить"}
                        </Button>

                        <Button type="button" onClick={openCreateModal}>
                            <Plus />
                            Новый сервер
                        </Button>
                    </>
                }
            />

            {pageError && (
                <Alert variant="error" className="mb-5">{pageError}</Alert>
            )}

            {servers.length === 0 ? (
                <Card className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <ServerIcon className="size-5" />
                    </div>
                    <div className="text-sm font-semibold">Серверы пока не добавлены</div>
                    <div className="mt-1 text-sm text-muted-foreground">Добавьте первый 3X-UI сервер для управления клиентами.</div>
                    <Button className="mt-4" onClick={openCreateModal}>
                        <Plus />
                        Добавить сервер
                    </Button>
                </Card>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {servers.map((server) => {
                        const offline = server.status === "offline";

                        return (
                            <Card key={server.id} className="min-w-0 overflow-hidden">
                                <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#eff4ff] text-primary">
                                            <ServerIcon className="size-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <h2 className="m-0 truncate text-base font-semibold">{server.name}</h2>
                                            <p className="mt-1 mb-0 truncate text-sm text-muted-foreground">{server.country || "Страна не указана"}</p>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                        <Badge variant={server.enabled ? "success" : "destructive"}>
                                            {server.enabled ? "Активен" : "Отключен"}
                                        </Badge>
                                        <Badge variant={offline ? "destructive" : "outline"}>
                                            {offline ? <WifiOff /> : <Wifi />}
                                            {offline ? "3X-UI недоступен" : "3X-UI доступен"}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="grid gap-3 border-b border-border px-5 py-4 text-sm sm:grid-cols-2">
                                    <div className="min-w-0">
                                        <div className="text-xs text-muted-foreground">Host</div>
                                        <div className="mt-1 truncate font-medium" title={server.host}>{server.host}</div>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs text-muted-foreground">Base path</div>
                                        <div className="mt-1 truncate font-medium" title={server.base_path || "-"}>{server.base_path || "-"}</div>
                                    </div>
                                </div>

                                {server.error && (
                                    <Alert variant="error" className="mx-5 mt-4">{server.error}</Alert>
                                )}

                                <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
                                    <Stat label="Клиентов" value={server.clients ?? 0} />
                                    <Stat label="Онлайн" value={server.online ?? 0} />
                                    <Stat label="Активных" value={server.enabled_clients ?? 0} />
                                    <Stat label="Отключено" value={server.disabled_clients ?? 0} />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
                                    <Button onClick={() => router.push(`/clients?server=${server.id}`)}>
                                        <Users />
                                        Клиенты
                                    </Button>
                                    <Button variant="outline" onClick={() => openEditModal(server)}>
                                        <Pencil />
                                        Изменить
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => deleteServer(server)}
                                        className="ml-auto text-destructive hover:bg-[#fef3f2] hover:text-destructive"
                                    >
                                        <Trash2 />
                                        Удалить
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <ServerModal
                open={modalOpen}
                mode={modalMode}
                server={selectedServer}
                error={modalError}
                saving={saving}
                onClose={closeModal}
                onSave={saveServer}
            />
        </AdminLayout>

    );

}

function Stat({
    label,
    value,
}) {
    return (
        <div className="min-w-0 px-4 py-3 text-center sm:py-4">
            <div className="text-lg font-semibold text-foreground">{value}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{label}</div>
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
