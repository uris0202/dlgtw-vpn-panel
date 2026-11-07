"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Plus,
    RefreshCw,
    Search as SearchIcon,
    Users,
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
import { matchesConnection } from "../../lib/clientPresence";

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
    const [connectionFilter, setConnectionFilter] = useState("all");
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [pageError, setPageError] = useState("");
    const [pageMessage, setPageMessage] = useState("");
    const [accountLinkLoadingEmail, setAccountLinkLoadingEmail] = useState("");
    const [modalError, setModalError] = useState("");
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedClient, setSelectedClient] = useState(null);
    const requestSequence = useRef(0);
    const requestController = useRef(null);
    const inFlight = useRef(false);
    const activeServerId = useRef(serverId);
    activeServerId.current = serverId;

    const loadClients = useCallback(async ({ initial = false, background = false } = {}) => {
        if (serverId !== activeServerId.current) return;
        requestController.current?.abort();
        const controller = new AbortController();
        requestController.current = controller;
        const request = ++requestSequence.current;
        const current = () => request === requestSequence.current && serverId === activeServerId.current && !controller.signal.aborted;
        inFlight.current = true;
        if (initial) setLoading(true);
        try {
            const me = await getMe();
            if (!current()) return;
            if (!me) {
                router.replace("/login");
                return;
            }
            setUser(me);
            const authConfig = { ...getAuthConfig(), signal: controller.signal };
            if (!serverId) {
                router.replace("/clients/overview");
                return;
            }
            if (background) {
                const response = await api.get(`/clients/${serverId}`, authConfig);
                if (!current()) return;
                setData(response.data);
            } else {
                const [clientsResponse, serversResponse, settingsResponse, plansResponse] = await Promise.all([
                    api.get(`/clients/${serverId}`, authConfig), api.get("/servers", authConfig),
                    api.get("/settings", authConfig), api.get("/plans", authConfig),
                ]);
                if (!current()) return;
                setData(clientsResponse.data);
                setServers(serversResponse.data);
                setSettings(settingsResponse.data);
                setPlans(Array.isArray(plansResponse.data) ? plansResponse.data : []);
            }
            setPageError("");
        } catch (error) {
            if (!current()) return;
            setPageError(getErrorMessage(error, "Не удалось загрузить клиентов."));
            setData((previous) => previous ? {
                ...previous, online_available: false, online_checked_at: null,
                clients: (previous.clients || []).map((client) => ({ ...client, online: null })),
            } : previous);
        } finally {
            if (current()) {
                inFlight.current = false;
                if (initial) setLoading(false);
            }
        }
    }, [serverId, router]);

    useEffect(() => {
        setData(null);
        setModalOpen(false);
        setSelectedClient(null);
        setPageMessage("");
        setPageError("");
        loadClients({ initial: true });
        return () => {
            requestSequence.current += 1;
            requestController.current?.abort();
            inFlight.current = false;
        };
    }, [loadClients]);

    useEffect(() => {
        if (!serverId || !autoRefresh || modalOpen || saving) return undefined;
        function refreshVisiblePage() {
            if (document.visibilityState === "visible" && !inFlight.current) loadClients({ background: true });
        }
        const timer = window.setInterval(refreshVisiblePage, 30000);
        document.addEventListener("visibilitychange", refreshVisiblePage);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refreshVisiblePage);
        };
    }, [serverId, autoRefresh, modalOpen, saving, loadClients]);

    function pauseListRequest() {
        requestSequence.current += 1;
        requestController.current?.abort();
        inFlight.current = false;
        setRefreshing(false);
    }

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
        pauseListRequest();
        setModalMode("create");
        setSelectedClient(null);
        setModalError("");
        setModalOpen(true);

    }

    function openEditModal(client) {
        pauseListRequest();
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

            return matchesSearch && matchesStatus && matchesGroup && matchesConnection(client, connectionFilter);

        });

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading
                title="Клиенты"
                description="Управление доступами и подключениями на выбранном сервере"
                actions={
                    <>
                        <Button type="button" variant="outline" onClick={() => router.push("/clients/overview")}><Users />Все клиенты</Button>
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
                            className="flex-1 sm:flex-none"
                        >
                            <RefreshCw className={refreshing ? "animate-spin" : ""} />
                            {refreshing ? "Обновление..." : "Обновить"}
                        </Button>

                        <Button type="button" onClick={openCreateModal} className="flex-1 sm:flex-none">
                            <Plus />
                            Новый клиент
                        </Button>
                    </>
                }
            />

            <div className="mb-5 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Всего: {data?.total || 0}</Badge>
                <Badge variant={data?.online_available ? "success" : "outline"}>Онлайн: {data?.online_available ? data.online : "нет данных"}</Badge>
                <label className="ml-auto flex min-h-8 items-center gap-2 text-xs text-muted-foreground" title="Обновлять каждые 30 секунд, пока вкладка видна">
                    <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} className="size-4 accent-[#155eef]" />Автообновление
                </label>
                {data?.online_checked_at && <span className="w-full text-xs text-muted-foreground sm:w-auto">Данные 3X-UI: {new Date(data.online_checked_at).toLocaleTimeString("ru-RU")}</span>}
            </div>

            {pageError && (
                <Alert variant="error" className="mb-4">{pageError}</Alert>
            )}

            {pageMessage && (
                <Alert variant="success" className="mb-4">{pageMessage}</Alert>
            )}

            {data?.truncated && <Alert className="mb-4">Загружено {clients.length} из {data.total} клиентов. Счётчик онлайн относится ко всему серверу; часть записей может отсутствовать в таблице.</Alert>}

            <Card className="mb-4 p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_160px_160px_180px]">
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

                    <Select value={connectionFilter} onChange={(event) => setConnectionFilter(event.target.value)} aria-label="Подключение клиента">
                        <option value="all">Все подключения</option>
                        <option value="online">Онлайн</option>
                        <option value="offline">Не в сети</option>
                        <option value="unknown">Нет данных</option>
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
