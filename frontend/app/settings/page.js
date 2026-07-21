"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Bot,
    Building2,
    CreditCard,
    Link2,
    Loader2,
    RotateCcw,
    Save,
    Search,
    Send,
    Trash2,
    UserPlus,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select, Textarea } from "../../components/ui/input";
import api from "../../lib/api";
import { getMe } from "../../lib/auth";

export default function SettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingTelegram, setTestingTelegram] = useState(false);
    const [discoveringTelegramChats, setDiscoveringTelegramChats] = useState(false);
    const [telegramChats, setTelegramChats] = useState([]);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [form, setForm] = useState(getEmptyForm());

    useEffect(() => { loadSettings(); }, []);

    async function loadSettings() {
        setError("");
        try {
            const me = await getMe();
            if (!me) {
                router.replace("/login");
                return;
            }
            setUser(me);
            const response = await api.get("/settings", getAuthConfig());
            setForm(settingsToForm(response.data));
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось загрузить настройки."));
        } finally {
            setLoading(false);
        }
    }

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    function updateField(field, value) {
        setSuccess("");
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function saveSettings(event) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const response = await api.patch("/settings", {
                panel_name: form.panel_name.trim(),
                default_client_days: Number(form.default_client_days),
                default_traffic_gb: Number(form.default_traffic_gb),
                default_inbound_id: Number(form.default_inbound_id),
                subscription_port: Number(form.subscription_port),
                subscription_path: form.subscription_path.trim(),
                support_contact: form.support_contact.trim(),
                payment_phone: form.payment_phone.trim(),
                payment_recipient: form.payment_recipient.trim(),
                payment_instructions: form.payment_instructions.trim(),
                telegram_notifications_enabled: Boolean(form.telegram_notifications_enabled),
                telegram_chat_id: form.telegram_chat_id.trim(),
                ...(form.telegram_bot_token.trim() ? { telegram_bot_token: form.telegram_bot_token.trim() } : {}),
            }, getAuthConfig());
            setForm(settingsToForm(response.data));
            setSuccess("Настройки сохранены.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось сохранить настройки."));
        } finally {
            setSaving(false);
        }
    }

    async function testTelegram() {
        setTestingTelegram(true);
        setError("");
        setSuccess("");
        try {
            const response = await api.post("/settings/telegram/test", { chat_id: form.telegram_chat_id.trim() }, getAuthConfig());
            const messageId = response.data?.message_id;
            setSuccess(messageId ? `Telegram принял сообщение. ID: ${messageId}.` : "Тестовое сообщение отправлено в Telegram.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось отправить тестовое сообщение."));
        } finally {
            setTestingTelegram(false);
        }
    }

    async function discoverTelegramChats() {
        setDiscoveringTelegramChats(true);
        setError("");
        setSuccess("");
        try {
            const response = await api.get("/settings/telegram/chats", getAuthConfig());
            const chats = Array.isArray(response.data?.chats) ? response.data.chats : [];
            setTelegramChats(chats);
            if (chats.length === 0) {
                setError("Чаты не найдены. Отправьте боту сообщение и повторите поиск.");
            } else {
                setSuccess(`Найдено чатов: ${chats.length}.`);
            }
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось получить чаты Telegram."));
        } finally {
            setDiscoveringTelegramChats(false);
        }
    }

    async function removeTelegramToken() {
        if (!confirm("Удалить сохранённый токен Telegram-бота?")) return;
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const response = await api.patch("/settings", { telegram_bot_token_clear: true }, getAuthConfig());
            setForm(settingsToForm(response.data));
            setTelegramChats([]);
            setSuccess("Токен Telegram удалён, уведомления выключены.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось удалить Telegram-токен."));
        } finally {
            setSaving(false);
        }
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading title="Настройки" description="Параметры панели, клиентов, оплаты и уведомлений" />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка настроек...</Alert>}
                {error && <Alert variant="error">{error}</Alert>}
                {success && <Alert variant="success">{success}</Alert>}
            </div>

            {!loading && (
                <form onSubmit={saveSettings}>
                    <Card className="overflow-hidden">
                        <SettingsSection icon={Building2} title="Панель" description="Название сервиса и контакт для клиентов">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Название панели">
                                    <Input value={form.panel_name} onChange={(event) => updateField("panel_name", event.target.value)} disabled={saving} required />
                                </Field>
                                <Field label="Контакт поддержки" optional>
                                    <Input value={form.support_contact} onChange={(event) => updateField("support_contact", event.target.value)} disabled={saving} placeholder="@support или email" />
                                </Field>
                            </div>
                        </SettingsSection>

                        <SettingsSection icon={UserPlus} title="Новые клиенты" description="Значения, которые подставляются при создании клиента вручную">
                            <div className="grid gap-4 md:grid-cols-3">
                                <Field label="Срок по умолчанию, дней">
                                    <Input type="number" min="0" value={form.default_client_days} onChange={(event) => updateField("default_client_days", event.target.value)} disabled={saving} required />
                                </Field>
                                <Field label="Лимит трафика, GB">
                                    <Input type="number" min="0" value={form.default_traffic_gb} onChange={(event) => updateField("default_traffic_gb", event.target.value)} disabled={saving} required />
                                </Field>
                                <Field label="Inbound ID по умолчанию">
                                    <Input type="number" min="1" value={form.default_inbound_id} onChange={(event) => updateField("default_inbound_id", event.target.value)} disabled={saving} required />
                                </Field>
                            </div>
                        </SettingsSection>

                        <SettingsSection icon={Link2} title="Subscription URL" description="Порт и путь подписки, настроенные в 3X-UI">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Порт подписки">
                                    <Input type="number" min="1" max="65535" value={form.subscription_port} onChange={(event) => updateField("subscription_port", event.target.value)} disabled={saving} required />
                                </Field>
                                <Field label="Путь подписки">
                                    <Input value={form.subscription_path} onChange={(event) => updateField("subscription_path", event.target.value)} disabled={saving} placeholder="subs" required />
                                </Field>
                            </div>
                            <div className="mt-3 rounded-md border border-[#b2ccff] bg-[#eff4ff] px-3 py-2 text-xs text-[#1849a9] [overflow-wrap:anywhere]">
                                Пример: https://server-ip:{form.subscription_port}/{normalizePath(form.subscription_path)}/subId
                            </div>
                        </SettingsSection>

                        <SettingsSection icon={CreditCard} title="Оплата переводом" description="Реквизиты и инструкция на странице оформления заказа">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Номер телефона" optional>
                                    <Input value={form.payment_phone} onChange={(event) => updateField("payment_phone", event.target.value)} disabled={saving} placeholder="+7..." />
                                </Field>
                                <Field label="Получатель" optional>
                                    <Input value={form.payment_recipient} onChange={(event) => updateField("payment_recipient", event.target.value)} disabled={saving} placeholder="Имя получателя" />
                                </Field>
                            </div>
                            <Field label="Инструкция для клиента" optional className="mt-4">
                                <Textarea value={form.payment_instructions} onChange={(event) => updateField("payment_instructions", event.target.value)} disabled={saving} placeholder="Переведите сумму по номеру телефона и сообщите номер заказа поддержке." rows={4} />
                            </Field>
                        </SettingsSection>

                        <SettingsSection icon={Bot} title="Telegram" description="Уведомления о новых заказах, оплате и активации">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-3">
                                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                                    <input type="checkbox" checked={form.telegram_notifications_enabled} onChange={(event) => updateField("telegram_notifications_enabled", event.target.checked)} disabled={saving} className="size-4 accent-primary" />
                                    Уведомления включены
                                </label>
                                <Badge variant={form.telegram_bot_token_configured ? "success" : "warning"}>{form.telegram_bot_token_configured ? "Токен настроен" : "Токен не задан"}</Badge>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Токен бота" optional>
                                    <Input type="password" value={form.telegram_bot_token} onChange={(event) => updateField("telegram_bot_token", event.target.value)} disabled={saving} placeholder={form.telegram_bot_token_configured ? "Токен сохранён" : "123456789:AA..."} autoComplete="new-password" />
                                </Field>
                                <Field label="Chat ID" optional>
                                    <Input value={form.telegram_chat_id} onChange={(event) => updateField("telegram_chat_id", event.target.value)} disabled={saving} placeholder="123456789 или @channel" />
                                </Field>
                            </div>

                            {telegramChats.length > 0 && (
                                <Field label="Найденные чаты" className="mt-4">
                                    <Select value="" onChange={(event) => { updateField("telegram_chat_id", event.target.value); setTelegramChats([]); }}>
                                        <option value="">Выберите чат</option>
                                        {telegramChats.map((chat) => <option key={chat.id} value={chat.id}>{chat.name} · {chat.id} · {chat.type}</option>)}
                                    </Select>
                                </Field>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={discoverTelegramChats} disabled={saving || discoveringTelegramChats || !form.telegram_bot_token_configured}>
                                    {discoveringTelegramChats ? <Loader2 className="animate-spin" /> : <Search />}
                                    {discoveringTelegramChats ? "Поиск..." : "Найти Chat ID"}
                                </Button>
                                <Button type="button" variant="outline" onClick={testTelegram} disabled={saving || testingTelegram || !form.telegram_bot_token_configured || !form.telegram_chat_id.trim()}>
                                    {testingTelegram ? <Loader2 className="animate-spin" /> : <Send />}
                                    {testingTelegram ? "Отправка..." : "Отправить тест"}
                                </Button>
                                {form.telegram_bot_token_configured && (
                                    <Button type="button" variant="ghost" onClick={removeTelegramToken} disabled={saving || testingTelegram} className="text-muted-foreground hover:text-destructive"><Trash2 />Удалить токен</Button>
                                )}
                            </div>
                        </SettingsSection>

                        <div className="flex flex-col-reverse justify-end gap-2 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:px-6">
                            <Button type="button" variant="outline" onClick={loadSettings} disabled={saving}><RotateCcw />Сбросить</Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                                {saving ? "Сохранение..." : "Сохранить настройки"}
                            </Button>
                        </div>
                    </Card>
                </form>
            )}
        </AdminLayout>
    );
}

function SettingsSection({ icon: Icon, title, description, children }) {
    return (
        <section className="grid gap-5 border-b border-border px-5 py-5 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
                <div className="flex items-center gap-2">
                    <Icon className="size-4.5 text-muted-foreground" />
                    <h2 className="m-0 text-base font-semibold">{title}</h2>
                </div>
                <p className="mt-1.5 mb-0 text-sm leading-5 text-muted-foreground">{description}</p>
            </div>
            <div className="min-w-0">{children}</div>
        </section>
    );
}

function Field({ label, optional = false, className = "", children }) {
    return (
        <label className={`grid gap-1.5 ${className}`}>
            <span className="text-sm font-medium">{label}{optional && <span className="ml-1 font-normal text-muted-foreground">(необязательно)</span>}</span>
            {children}
        </label>
    );
}

function getEmptyForm() {
    return {
        panel_name: "DLGTW VPN",
        default_client_days: "30",
        default_traffic_gb: "0",
        default_inbound_id: "1",
        subscription_port: "2096",
        subscription_path: "subs",
        support_contact: "",
        payment_phone: "",
        payment_recipient: "",
        payment_instructions: "",
        telegram_notifications_enabled: false,
        telegram_bot_token: "",
        telegram_bot_token_configured: false,
        telegram_chat_id: "",
    };
}

function settingsToForm(settings) {
    return {
        panel_name: settings.panel_name || "DLGTW VPN",
        default_client_days: String(settings.default_client_days ?? 30),
        default_traffic_gb: String(settings.default_traffic_gb ?? 0),
        default_inbound_id: String(settings.default_inbound_id ?? 1),
        subscription_port: String(settings.subscription_port ?? 2096),
        subscription_path: settings.subscription_path || "subs",
        support_contact: settings.support_contact || "",
        payment_phone: settings.payment_phone || "",
        payment_recipient: settings.payment_recipient || "",
        payment_instructions: settings.payment_instructions || "",
        telegram_notifications_enabled: Boolean(settings.telegram_notifications_enabled),
        telegram_bot_token: "",
        telegram_bot_token_configured: Boolean(settings.telegram_bot_token_configured),
        telegram_chat_id: settings.telegram_chat_id || "",
    };
}

function normalizePath(path) {
    return (path || "subs").trim().replace(/^\/+|\/+$/g, "") || "subs";
}

function getAuthConfig() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}
