"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Check,
    Copy,
    KeyRound,
    Loader2,
    LockKeyhole,
    RefreshCw,
    Save,
    ShieldCheck,
    ShieldOff,
    Smartphone,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";

import AdminLayout from "../../components/AdminLayout";
import PageHeading from "../../components/PageHeading";
import QRCodeCanvas from "../../components/QRCodeCanvas";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";

export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [security, setSecurity] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [email, setEmail] = useState("");
    const [profilePassword, setProfilePassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [sessionPassword, setSessionPassword] = useState("");
    const [setupPassword, setSetupPassword] = useState("");
    const [setupData, setSetupData] = useState(null);
    const [setupCode, setSetupCode] = useState("");
    const [twoFactorAction, setTwoFactorAction] = useState("");
    const [twoFactorPassword, setTwoFactorPassword] = useState("");
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [codesCopied, setCodesCopied] = useState(false);

    useEffect(() => {
        loadSecurity();
    }, []);

    async function loadSecurity() {
        setError("");

        try {
            const token = localStorage.getItem("token");

            if (!token) {
                router.replace("/login?next=/profile");
                return;
            }

            const response = await api.get("/auth/security", authConfig());
            setUser({ email: response.data.email });
            setEmail(response.data.email);
            setSecurity(response.data);
        } catch (error) {
            if (error?.response?.status === 401) {
                localStorage.removeItem("token");
                router.replace("/login?next=/profile");
                return;
            }

            setError(getErrorMessage(error, "Не удалось загрузить параметры безопасности."));
        } finally {
            setLoading(false);
        }
    }

    function logout() {
        localStorage.removeItem("token");
        router.replace("/login");
    }

    function clearMessages() {
        setError("");
        setSuccess("");
    }

    function applyAuthResponse(data) {
        if (data?.access_token) {
            localStorage.setItem("token", data.access_token);
        }

        if (data?.security) {
            setSecurity(data.security);
            setEmail(data.security.email);
            setUser((current) => ({ ...(current || {}), email: data.security.email }));
        }
    }

    async function updateProfile(event) {
        event.preventDefault();
        clearMessages();
        const emailChanged = email.trim().toLowerCase() !== security.email.toLowerCase();
        setBusy("profile");

        try {
            const response = await api.patch("/auth/profile", {
                email: email.trim(),
                current_password: profilePassword,
            }, authConfig());
            applyAuthResponse(response.data);
            setProfilePassword("");
            setSuccess(emailChanged ? "Email администратора обновлён. Остальные сессии завершены." : "Email не изменился.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось изменить email."));
        } finally {
            setBusy("");
        }
    }

    async function changePassword(event) {
        event.preventDefault();
        clearMessages();

        if (newPassword !== passwordConfirmation) {
            setError("Новый пароль и подтверждение не совпадают.");
            return;
        }

        setBusy("password");

        try {
            const response = await api.post("/auth/password", {
                current_password: currentPassword,
                new_password: newPassword,
            }, authConfig());
            applyAuthResponse(response.data);
            setCurrentPassword("");
            setNewPassword("");
            setPasswordConfirmation("");
            setSuccess("Пароль изменён. Остальные сессии завершены.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось изменить пароль."));
        } finally {
            setBusy("");
        }
    }

    async function revokeSessions(event) {
        event.preventDefault();
        clearMessages();
        setBusy("sessions");

        try {
            const response = await api.post("/auth/sessions/revoke", {
                current_password: sessionPassword,
            }, authConfig());
            applyAuthResponse(response.data);
            setSessionPassword("");
            setSuccess("Все остальные сеансы администратора завершены.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось завершить сеансы."));
        } finally {
            setBusy("");
        }
    }

    async function startTwoFactorSetup(event) {
        event.preventDefault();
        clearMessages();
        setBusy("setup");

        try {
            const response = await api.post("/auth/2fa/setup", {
                current_password: setupPassword,
            }, authConfig());
            setSetupData(response.data);
            setSetupCode("");
            setSetupPassword("");
            setSecurity((current) => ({ ...current, two_factor_setup_pending: true }));
            setSuccess("QR-код создан. Завершите подключение кодом из приложения.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось начать настройку 2FA."));
        } finally {
            setBusy("");
        }
    }

    async function enableTwoFactor(event) {
        event.preventDefault();
        clearMessages();
        setBusy("enable");

        try {
            const response = await api.post("/auth/2fa/enable", {
                code: setupCode.trim(),
            }, authConfig());
            applyAuthResponse(response.data);
            setSetupData(null);
            setSetupCode("");
            setRecoveryCodes(response.data.recovery_codes || []);
            setCodesCopied(false);
            setSuccess("Двухфакторная защита включена.");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось включить 2FA."));
        } finally {
            setBusy("");
        }
    }

    async function runTwoFactorAction(event) {
        event.preventDefault();
        clearMessages();
        const action = twoFactorAction;

        if (!action) return;

        setBusy(action);

        try {
            if (action === "disable" && !window.confirm("Отключить двухфакторную защиту администратора?")) {
                return;
            }

            const endpoint = action === "disable" ? "/auth/2fa/disable" : "/auth/2fa/recovery-codes";
            const response = await api.post(endpoint, {
                current_password: twoFactorPassword,
                code: twoFactorCode.trim(),
            }, authConfig());
            applyAuthResponse(response.data);
            setTwoFactorAction("");
            setTwoFactorPassword("");
            setTwoFactorCode("");

            if (action === "disable") {
                setRecoveryCodes([]);
                setSuccess("Двухфакторная защита отключена.");
            } else {
                setRecoveryCodes(response.data.recovery_codes || []);
                setCodesCopied(false);
                setSuccess("Создан новый набор резервных кодов. Старые коды больше не работают.");
            }
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось изменить настройки 2FA."));
        } finally {
            setBusy("");
        }
    }

    async function copyRecoveryCodes() {
        const value = recoveryCodes.join("\n");

        try {
            await navigator.clipboard.writeText(value);
        } catch {
            fallbackCopy(value);
        }

        setCodesCopied(true);
    }

    function selectTwoFactorAction(action) {
        setTwoFactorAction(action);
        setTwoFactorPassword("");
        setTwoFactorCode("");
        clearMessages();
    }

    return (
        <AdminLayout user={user} onLogout={logout}>
            <PageHeading title="Профиль и безопасность" description="Данные администратора, защита входа и активные сеансы" />

            <div className="mb-5 grid gap-3">
                {loading && <Alert>Загрузка параметров безопасности...</Alert>}
                {error && <Alert variant="error">{error}</Alert>}
                {success && <Alert variant="success">{success}</Alert>}
            </div>

            {recoveryCodes.length > 0 && (
                <Card className="mb-5 overflow-hidden border-[#fedf89]">
                    <div className="border-b border-[#fedf89] bg-[#fffaeb] px-5 py-4 sm:px-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="m-0 text-base font-semibold">Резервные коды</h2>
                                <p className="mt-1 mb-0 text-sm text-[#b54708]">Сохраните их сейчас. Каждый код работает только один раз и повторно показан не будет.</p>
                            </div>
                            <Badge variant="warning">Осталось: {recoveryCodes.length}</Badge>
                        </div>
                    </div>
                    <div className="px-5 py-5 sm:px-6">
                        <div className="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                            {recoveryCodes.map((code) => (
                                <code key={code} className="rounded-md border border-border bg-muted px-3 py-2 text-center text-sm font-semibold tracking-normal">{code}</code>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={copyRecoveryCodes}>
                                {codesCopied ? <Check /> : <Copy />}
                                {codesCopied ? "Скопировано" : "Копировать коды"}
                            </Button>
                            <Button type="button" onClick={() => setRecoveryCodes([])}><Check />Я сохранил коды</Button>
                        </div>
                    </div>
                </Card>
            )}

            {!loading && security && (
                <Card className="overflow-hidden">
                    <SecuritySection icon={UserRound} title="Учётная запись" description="Email для входа в панель администратора">
                        <form onSubmit={updateProfile} className="grid max-w-xl gap-4">
                            <Field label="Email">
                                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" maxLength={255} disabled={Boolean(busy)} required />
                            </Field>
                            <Field label="Текущий пароль">
                                <Input type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} autoComplete="current-password" maxLength={72} disabled={Boolean(busy)} required />
                            </Field>
                            <div><Button type="submit" disabled={Boolean(busy)}>{busy === "profile" ? <Loader2 className="animate-spin" /> : <Save />}{busy === "profile" ? "Сохранение..." : "Сохранить email"}</Button></div>
                        </form>
                    </SecuritySection>

                    <SecuritySection icon={LockKeyhole} title="Пароль" description="После изменения все другие сеансы будут завершены">
                        <form onSubmit={changePassword} className="grid max-w-xl gap-4">
                            <Field label="Текущий пароль">
                                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={72} disabled={Boolean(busy)} required />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Новый пароль">
                                    <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={72} disabled={Boolean(busy)} required />
                                </Field>
                                <Field label="Повторите пароль">
                                    <Input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={8} maxLength={72} disabled={Boolean(busy)} required />
                                </Field>
                            </div>
                            <div><Button type="submit" disabled={Boolean(busy)}>{busy === "password" ? <Loader2 className="animate-spin" /> : <KeyRound />}{busy === "password" ? "Изменение..." : "Изменить пароль"}</Button></div>
                        </form>
                    </SecuritySection>

                    <SecuritySection icon={Smartphone} title="Двухфакторная защита" description="Код из приложения-аутентификатора при каждом входе">
                        <TwoFactorStatus security={security} />

                        {!security.two_factor_enabled ? (
                            <div className="mt-4 max-w-2xl">
                                {security.two_factor_setup_pending && !setupData && (
                                    <Alert className="mb-4">Есть незавершённая настройка. Введите пароль, чтобы создать новый QR-код.</Alert>
                                )}

                                {!setupData ? (
                                    <form onSubmit={startTwoFactorSetup} className="grid max-w-xl gap-4">
                                        <Field label="Текущий пароль">
                                            <Input type="password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} autoComplete="current-password" maxLength={72} disabled={Boolean(busy)} required />
                                        </Field>
                                        <div><Button type="submit" disabled={Boolean(busy)}>{busy === "setup" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{busy === "setup" ? "Подготовка..." : "Настроить 2FA"}</Button></div>
                                    </form>
                                ) : (
                                    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                                        <QRCodeCanvas value={setupData.provisioning_uri} size={196} />
                                        <form onSubmit={enableTwoFactor} className="min-w-0">
                                            <h3 className="m-0 text-sm font-semibold">Добавьте аккаунт в приложение</h3>
                                            <p className="mt-1.5 mb-3 text-sm leading-5 text-muted-foreground">Отсканируйте QR-код в Google Authenticator, Microsoft Authenticator, 1Password или другом TOTP-приложении.</p>
                                            <div className="mb-4 rounded-md border border-border bg-muted px-3 py-2">
                                                <div className="mb-1 text-xs text-muted-foreground">Ключ для ручного ввода</div>
                                                <code className="block break-all text-sm font-semibold">{setupData.manual_key}</code>
                                            </div>
                                            <Field label="Шестизначный код">
                                                <Input type="text" value={setupCode} onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" placeholder="123456" className="max-w-xs font-mono" minLength={6} maxLength={6} disabled={Boolean(busy)} required />
                                            </Field>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Button type="submit" disabled={Boolean(busy)}>{busy === "enable" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{busy === "enable" ? "Проверка..." : "Включить 2FA"}</Button>
                                                <Button type="button" variant="outline" onClick={() => { setSetupData(null); setSetupCode(""); }} disabled={Boolean(busy)}><X />Отмена</Button>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="mt-4 max-w-2xl">
                                {!twoFactorAction ? (
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" onClick={() => selectTwoFactorAction("recovery")} disabled={Boolean(busy)}><RefreshCw />Новые резервные коды</Button>
                                        <Button type="button" variant="outline" onClick={() => selectTwoFactorAction("disable")} disabled={Boolean(busy)} className="text-destructive hover:text-destructive"><ShieldOff />Отключить 2FA</Button>
                                    </div>
                                ) : (
                                    <form onSubmit={runTwoFactorAction} className="grid max-w-xl gap-4 rounded-md border border-border bg-muted/30 p-4">
                                        <div>
                                            <h3 className="m-0 text-sm font-semibold">{twoFactorAction === "disable" ? "Отключение 2FA" : "Новый набор резервных кодов"}</h3>
                                            <p className="mt-1 mb-0 text-xs text-muted-foreground">Подтвердите действие текущим паролем и кодом из приложения или резервным кодом.</p>
                                        </div>
                                        <Field label="Текущий пароль">
                                            <Input type="password" value={twoFactorPassword} onChange={(event) => setTwoFactorPassword(event.target.value)} autoComplete="current-password" maxLength={72} disabled={Boolean(busy)} required />
                                        </Field>
                                        <Field label="Код подтверждения">
                                            <Input type="text" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.toUpperCase())} autoComplete="one-time-code" autoCapitalize="characters" maxLength={32} className="font-mono" disabled={Boolean(busy)} required />
                                        </Field>
                                        <div className="flex flex-wrap gap-2">
                                            <Button type="submit" variant={twoFactorAction === "disable" ? "destructive" : "default"} disabled={Boolean(busy)}>
                                                {busy === twoFactorAction ? <Loader2 className="animate-spin" /> : twoFactorAction === "disable" ? <ShieldOff /> : <RefreshCw />}
                                                {busy === twoFactorAction ? "Проверка..." : twoFactorAction === "disable" ? "Отключить 2FA" : "Создать новые коды"}
                                            </Button>
                                            <Button type="button" variant="outline" onClick={() => setTwoFactorAction("")} disabled={Boolean(busy)}><X />Отмена</Button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        )}
                    </SecuritySection>

                    <SecuritySection icon={UsersRound} title="Активные сеансы" description="Завершение доступа на других компьютерах и в других браузерах" last>
                        <form onSubmit={revokeSessions} className="grid max-w-xl gap-4">
                            <Alert>Текущий браузер останется авторизованным. Для него будет выдан новый защищённый токен.</Alert>
                            <Field label="Текущий пароль">
                                <Input type="password" value={sessionPassword} onChange={(event) => setSessionPassword(event.target.value)} autoComplete="current-password" maxLength={72} disabled={Boolean(busy)} required />
                            </Field>
                            <div><Button type="submit" variant="outline" disabled={Boolean(busy)}>{busy === "sessions" ? <Loader2 className="animate-spin" /> : <UsersRound />}{busy === "sessions" ? "Завершение..." : "Завершить остальные сеансы"}</Button></div>
                        </form>
                    </SecuritySection>
                </Card>
            )}
        </AdminLayout>
    );
}

function SecuritySection({ icon: Icon, title, description, last = false, children }) {
    return (
        <section className={`grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] ${last ? "" : "border-b border-border"}`}>
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

function Field({ label, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function TwoFactorStatus({ security }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Badge variant={security.two_factor_enabled ? "success" : "warning"}>
                {security.two_factor_enabled ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}
                {security.two_factor_enabled ? "Включена" : "Выключена"}
            </Badge>
            {security.two_factor_enabled && (
                <span className="text-xs text-muted-foreground">
                    Резервных кодов: {security.recovery_codes_remaining}
                    {security.two_factor_enabled_at ? ` · с ${formatDate(security.two_factor_enabled_at)}` : ""}
                </span>
            )}
        </div>
    );
}

function authConfig() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}

function formatDate(value) {
    return new Date(value).toLocaleDateString("ru-RU");
}

function fallbackCopy(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}
