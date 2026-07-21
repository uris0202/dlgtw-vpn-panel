"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Plus,
    RefreshCw,
    Search as SearchIcon,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import ClientModal from "../../components/ClientModal";
import ClientTable from "../../components/ClientTable";
import PageHeading from "../../components/PageHeading";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function Clients() {

    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Загрузка клиентов...
                </div>
            }
        >
            <ClientsContent />
        </Suspense>
    );

}

function ClientsContent() {

    const router = useRouter();
    const params = useSearchParams();

    const serverId = params.get("server");
    const initialSearch = params.get("q") || "";

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);
    const [servers, setServers] = useState([]);
    const [settings, setSettings] = useState(null);
    const [plans, setPlans] = useState([]);
    const [search, setSearch] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState("all");
    const [groupFilter, setGroupFilter] = useState("all");
    const [pageError, setPageError] = useState("");
    const [pageMessage, setPageMessage] = useState("");
    const [accountLinkLoadingEmail, setAccountLinkLoadingEmail] = useState("");
    const [modalError, setModalError] = useState("");
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedClient, setSelectedClient] = useState(null);

    async function loadClients() {

        setLoading(true);
        setPageError("");

        const me = await getMe();

        if (!me) {
            router.replace("/login");
            return;
        }

        setUser(me);

        if (!serverId) {

            try {

                const response = await api.get(
                    "/servers",
                    getAuthConfig(),
                );
                const loadedServers = Array.isArray(response.data)
                    ? response.data
                    : [];
                const firstServer = loadedServers[0];

                setServers(loadedServers);

                if (firstServer) {
                    router.replace(`/clients?server=${firstServer.id}`);
                    return;
                }

                setPageError("Сначала добавьте VPN-сервер.");

            } catch (error) {

                setPageError(getErrorMessage(error, "Не удалось загрузить серверы."));

            }

            setLoading(false);
            return;
        }

        try {

            const authConfig = getAuthConfig();

            const [
                clientsResponse,
                serversResponse,
                settingsResponse,
                plansResponse,
            ] = await Promise.all([
                api.get(
                    `/clients/${serverId}`,
                    authConfig,
                ),
                api.get(
                    "/servers",
                    authConfig,
                ),
                api.get(
                    "/settings",
                    authConfig,
                ),
                api.get(
                    "/plans",
                    authConfig,
                ),
            ]);

            setData(clientsResponse.data);
            setServers(serversResponse.data);
            setSettings(settingsResponse.data);
            setPlans(Array.isArray(plansResponse.data) ? plansResponse.data : []);

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось загрузить клиентов."));

        } finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        loadClients();

    }, [serverId]);

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    async function refreshClients() {

        setRefreshing(true);

        try {
            await loadClients();
        } finally {
            setRefreshing(false);
        }

    }

    function openCreateModal() {

        setModalMode("create");
        setSelectedClient(null);
        setModalError("");
        setModalOpen(true);

    }

    function openEditModal(client) {

        setModalMode("edit");
        setSelectedClient(client);
        setModalError("");
        setModalOpen(true);

    }

    function closeModal() {

        if (saving) {
            return;
        }

        setModalOpen(false);
        setSelectedClient(null);
        setModalError("");

    }

    async function saveClient(payload) {

        setSaving(true);
        setModalError("");

        try {

            if (modalMode === "edit" && selectedClient) {
                await api.patch(
                    `/clients/${serverId}/${encodeURIComponent(selectedClient.email)}`,
                    payload,
                    getAuthConfig(),
                );
            } else {
                const { server_ids: serverIds, ...clientPayload } = payload;
                const targetServerIds = serverIds?.length ? serverIds : [Number(serverId)];

                await Promise.all(
                    targetServerIds.map((targetServerId) =>
                        api.post(
                            `/clients/${targetServerId}`,
                            clientPayload,
                            getAuthConfig(),
                        )
                    )
                );
            }

            setModalOpen(false);
            setSelectedClient(null);
            await loadClients();

        } catch (error) {

            setModalError(getErrorMessage(error, "Не удалось сохранить клиента."));

        } finally {

            setSaving(false);

        }

    }

    async function deleteClient(email) {

        if (!confirm(`Удалить клиента "${email}"?`)) {
            return;
        }

        setPageError("");

        try {

            await api.delete(
                `/clients/${serverId}/${encodeURIComponent(email)}`,
                getAuthConfig(),
            );

            await loadClients();

        } catch (error) {

            setPageError(getErrorMessage(error, "Ошибка удаления клиента."));

        }

    }

    async function createAccountAccess(client) {

        setPageError("");
        setPageMessage("");
        setAccountLinkLoadingEmail(client.email);

        try {

            const response = await api.post(
                "/orders/account-access",
                {
                    client_email: client.email,
                    customer_contact: client.comment || "",
                    server_id: Number(serverId),
                    server_ids: [Number(serverId)],
                },
                getAuthConfig(),
            );

            const accountUrl = buildAccountUrl(response.data.account_token);
            const serverCount = response.data.server_ids?.length || 1;

            await copyText(accountUrl);
            setPageMessage(
                `Ссылка ЛК для "${client.email}" скопирована. Серверов в кабинете: ${serverCount}. ${accountUrl}`
            );

        } catch (error) {

            setPageError(getErrorMessage(error, "Не удалось получить ссылку ЛК."));

        } finally {

            setAccountLinkLoadingEmail("");

        }

    }

    if (loading) {

        return (
            <AdminLayout user={user} onLogout={logout}>
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Загрузка клиентов...
                </div>
            </AdminLayout>
        );

    }

    const clients = data?.clients || [];

    const groupOptions = Array.from(
        new Set(
            clients
                .map((client) => (client.group || "").trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, "ru"));

    const serverOptions = servers.length > 0
        ? servers
        : (serverId ? [{ id: Number(serverId), name: `Сервер #${serverId}` }] : []);

    const activePlans = plans.filter((plan) => plan.is_active);

    const filteredClients =
        clients.filter((client) => {

            const normalizedSearch = search.trim().toLowerCase();

            const matchesSearch =
                normalizedSearch === ""
                || [
                    client.email,
                    client.group,
                    client.comment,
                ]
                    .filter(Boolean)
                    .some((value) =>
                        value
                            .toLowerCase()
                            .includes(normalizedSearch)
                    );

            const matchesStatus =
                statusFilter === "all"
                || (statusFilter === "enabled" && client.enabled)
                || (statusFilter === "disabled" && !client.enabled);

            const normalizedGroup = (client.group || "").trim();

            const matchesGroup =
                groupFilter === "all"
                || (groupFilter === "none" && normalizedGroup === "")
                || groupFilter === normalizedGroup;

            return matchesSearch && matchesStatus && matchesGroup;

        });

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Клиенты"
                description="Управление доступами и подключениями на выбранном сервере"
                actions={
                    <>
                        <Select
                            value={serverId || ""}
                            onChange={(event) => router.push(`/clients?server=${event.target.value}`)}
                            className="w-full sm:w-48"
                            aria-label="VPN-сервер"
                        >
                            {serverOptions.map((server) => (
                                <option key={server.id} value={server.id}>{server.name}</option>
                            ))}
                        </Select>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={refreshClients}
                            disabled={refreshing}
                        >
                            <RefreshCw className={refreshing ? "animate-spin" : ""} />
                            {refreshing ? "Обновление..." : "Обновить"}
                        </Button>

                        <Button type="button" onClick={openCreateModal}>
                            <Plus />
                            Новый клиент
                        </Button>
                    </>
                }
            />

            <div className="mb-5 flex flex-wrap gap-2">
                <Badge variant="outline">Всего: {data?.total || 0}</Badge>
                <Badge variant="success">Онлайн: {data?.online || 0}</Badge>
            </div>

            {pageError && (
                <Alert variant="error" className="mb-4">{pageError}</Alert>
            )}

            {pageMessage && (
                <Alert variant="success" className="mb-4">{pageMessage}</Alert>
            )}

            <Card className="mb-4 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_220px]">
                    <label className="relative block">
                        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Клиент, группа или комментарий"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="pl-9"
                            aria-label="Поиск клиентов"
                        />
                    </label>

                    <Select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        aria-label="Статус клиента"
                    >
                        <option value="all">Все статусы</option>
                        <option value="enabled">Активные</option>
                        <option value="disabled">Отключенные</option>
                    </Select>

                    <Select
                        value={groupFilter}
                        onChange={(event) => setGroupFilter(event.target.value)}
                        aria-label="Группа клиента"
                    >
                        <option value="all">Все группы</option>
                        <option value="none">Без группы</option>
                        {groupOptions.map((group) => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </Select>
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                    Показано {filteredClients.length} из {clients.length}
                </div>
            </Card>

            <ClientTable
                clients={filteredClients}
                accountLinkLoadingEmail={accountLinkLoadingEmail}
                onEdit={openEditModal}
                onDelete={deleteClient}
                onCreateAccountAccess={createAccountAccess}
            />

            <ClientModal
                open={modalOpen}
                mode={modalMode}
                client={selectedClient}
                groupOptions={groupOptions}
                serverOptions={serverOptions}
                planOptions={activePlans}
                currentServerId={serverId ? Number(serverId) : null}
                defaultSettings={settings || {}}
                error={modalError}
                saving={saving}
                onClose={closeModal}
                onSave={saveClient}
            />
        </AdminLayout>

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

    const message = error?.response?.data?.message || error?.message;

    return message || fallback;

}

function buildAccountUrl(accountToken) {

    if (typeof window === "undefined") {
        return `/account/${accountToken}`;
    }

    return `${window.location.origin}/account/${accountToken}`;

}

async function copyText(value) {

    try {
        await navigator.clipboard.writeText(value);
    } catch {
        fallbackCopy(value);
    }

}

function fallbackCopy(value) {

    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    document.execCommand("copy");
    document.body.removeChild(textarea);

}

const serverSelect = {
    minWidth: 180,
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontSize: 14,
};

const filterControl = {
    width: "100%",
    boxSizing: "border-box",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 15,
    outline: "none",
    background: "#fff",
};
