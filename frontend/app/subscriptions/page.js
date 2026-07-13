"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import ClientLinksModal from "../../components/ClientLinksModal";

import { getMe } from "../../lib/auth";
import api from "../../lib/api";

export default function SubscriptionsPage() {

    const router = useRouter();

    const [user, setUser] = useState(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [copyStatus, setCopyStatus] = useState("");
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

    async function searchSubscriptions(event) {

        event.preventDefault();

        const normalizedQuery = query.trim();

        if (!normalizedQuery) {
            setPageError("Введите имя клиента или псевдоним.");
            return;
        }

        setLoading(true);
        setSearched(false);
        setPageError("");
        setCopyStatus("");

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

            setPageError(getErrorMessage(error, "Не удалось найти подписку."));

        } finally {

            setLoading(false);

        }

    }

    function logout() {

        localStorage.removeItem("token");

        router.replace("/login");

    }

    return (
        <div style={page}>
            <Sidebar />

            <div style={main}>
                <Header
                    user={user}
                    onLogout={logout}
                />

                <main style={content}>
                    <div style={pageHeader}>
                        <div>
                            <h1 style={title}>
                                Подписки
                            </h1>

                            <p style={subtitle}>
                                VLESS, QR и subscription URL клиента.
                            </p>
                        </div>
                    </div>

                    <form
                        onSubmit={searchSubscriptions}
                        style={searchBar}
                    >
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Имя клиента, группа или комментарий"
                            style={searchInput}
                        />

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                ...primaryButton,
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? .7 : 1,
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

                    {copyStatus && (
                        <div style={successBox}>
                            {copyStatus}
                        </div>
                    )}

                    {searched && results.length === 0 && (
                        <div style={emptyState}>
                            Подписка не найдена.
                        </div>
                    )}

                    {results.length > 0 && (
                        <div style={resultsHeader}>
                            Найдено: <b>{results.length}</b>
                        </div>
                    )}

                    <div style={resultsList}>
                        {results.map((client) => (
                            <SubscriptionRow
                                key={`${client.server_id}-${client.email}`}
                                client={client}
                                onOpenLinks={setSelectedClient}
                                onCopy={setCopyStatus}
                                onOpenClient={() => router.push(
                                    `/clients?server=${client.server_id}&q=${encodeURIComponent(client.email)}`
                                )}
                            />
                        ))}
                    </div>
                </main>
            </div>

            <ClientLinksModal
                client={selectedClient}
                onClose={() => setSelectedClient(null)}
            />
        </div>
    );

}

function SubscriptionRow({
    client,
    onOpenLinks,
    onCopy,
    onOpenClient,
}) {

    const hasLinks = Boolean(client.vless_url || client.subscription_url);

    return (
        <div style={resultRow}>
            <div style={clientInfo}>
                <div style={clientName}>
                    {client.email || "Без имени"}
                </div>

                <div style={clientMeta}>
                    {client.server}
                    {" | "}
                    {client.country}
                    {" | "}
                    {client.group || "Без группы"}
                </div>

                <div style={statusLine}>
                    <span
                        style={{
                            ...badge,
                            ...(client.enabled ? successBadge : dangerBadge),
                        }}
                    >
                        {client.enabled ? "Активен" : "Отключен"}
                    </span>

                    <span>
                        Окончание: <b>{formatExpiry(client.expiry)}</b>
                    </span>
                </div>
            </div>

            <div style={actions}>
                <button
                    type="button"
                    onClick={() => onOpenLinks(client)}
                    disabled={!hasLinks}
                    style={{
                        ...primaryButton,
                        background: hasLinks ? "#2563eb" : "#9ca3af",
                        cursor: hasLinks ? "pointer" : "not-allowed",
                    }}
                >
                    QR
                </button>

                <button
                    type="button"
                    onClick={() => copyText(
                        client.subscription_url,
                        "Subscription URL скопирован.",
                        onCopy,
                    )}
                    disabled={!client.subscription_url}
                    style={{
                        ...secondaryButton,
                        cursor: client.subscription_url ? "pointer" : "not-allowed",
                        opacity: client.subscription_url ? 1 : .65,
                    }}
                >
                    Copy Sub
                </button>

                <button
                    type="button"
                    onClick={() => copyText(
                        client.vless_url,
                        "VLESS ссылка скопирована.",
                        onCopy,
                    )}
                    disabled={!client.vless_url}
                    style={{
                        ...secondaryButton,
                        cursor: client.vless_url ? "pointer" : "not-allowed",
                        opacity: client.vless_url ? 1 : .65,
                    }}
                >
                    Copy VLESS
                </button>

                <button
                    type="button"
                    onClick={onOpenClient}
                    style={secondaryButton}
                >
                    Клиент
                </button>
            </div>
        </div>
    );

}

async function copyText(value, message, setStatus) {

    if (!value) {
        setTemporaryStatus(setStatus, "Ссылка недоступна.");
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        setTemporaryStatus(setStatus, message);
    } catch {
        fallbackCopy(value);
        setTemporaryStatus(setStatus, message);
    }

}

function setTemporaryStatus(setStatus, message) {

    setStatus(message);

    window.setTimeout(() => {
        setStatus("");
    }, 2200);

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

function formatExpiry(value) {

    if (!value || value === 0) {
        return "Без срока";
    }

    return new Date(value).toLocaleDateString("ru-RU");

}

const page = {
    display: "flex",
    minHeight: "100vh",
    background: "#f5f7fb",
    fontFamily: "Arial",
};

const main = {
    flex: 1,
};

const content = {
    padding: 30,
};

const pageHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 22,
};

const title = {
    margin: "0 0 8px",
};

const subtitle = {
    margin: 0,
    color: "#6b7280",
};

const searchBar = {
    display: "flex",
    gap: 12,
    maxWidth: 900,
    marginBottom: 18,
};

const searchInput = {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    fontSize: 15,
    outline: "none",
};

const resultsHeader = {
    marginBottom: 12,
    color: "#6b7280",
    fontSize: 14,
};

const resultsList = {
    display: "grid",
    gap: 12,
};

const resultRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
};

const clientInfo = {
    minWidth: 260,
    flex: 1,
};

const clientName = {
    color: "#111827",
    fontSize: 17,
    fontWeight: 700,
    overflowWrap: "anywhere",
};

const clientMeta = {
    marginTop: 6,
    color: "#6b7280",
    fontSize: 14,
};

const statusLine = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 10,
    color: "#374151",
    fontSize: 14,
};

const actions = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
};

const primaryButton = {
    padding: "10px 14px",
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontSize: 14,
};

const secondaryButton = {
    padding: "10px 14px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontSize: 14,
};

const badge = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
};

const successBadge = {
    background: "#dcfce7",
    color: "#166534",
};

const dangerBadge = {
    background: "#fee2e2",
    color: "#991b1b",
};

const errorBox = {
    maxWidth: 900,
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#fee2e2",
    color: "#991b1b",
    fontSize: 14,
};

const successBox = {
    maxWidth: 900,
    marginBottom: 18,
    padding: 12,
    borderRadius: 8,
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 14,
};

const emptyState = {
    maxWidth: 900,
    padding: 16,
    borderRadius: 8,
    background: "#fff",
    color: "#6b7280",
    fontSize: 14,
};
