"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    KeyRound,
    Loader2,
    LockKeyhole,
    Mail,
    ShieldCheck,
    ShoppingCart,
    UserRound,
} from "lucide-react";

import AuthShell from "../../components/AuthShell";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [challengeToken, setChallengeToken] = useState("");
    const [verificationCode, setVerificationCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function login(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const response = await api.post("/auth/login", { email: email.trim(), password });

            if (response.data?.requires_2fa) {
                if (!response.data.challenge_token) {
                    throw new Error("Сервер не вернул данные для подтверждения входа.");
                }

                setChallengeToken(response.data.challenge_token);
                setVerificationCode("");
                setPassword("");
                return;
            }

            completeLogin(response.data, router);
        } catch (error) {
            setError(getErrorMessage(error, "Неверный логин или пароль"));
        } finally {
            setLoading(false);
        }
    }

    async function verifyTwoFactor(event) {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await api.post("/auth/2fa/verify", {
                challenge_token: challengeToken,
                code: verificationCode.trim(),
            });
            completeLogin(response.data, router);
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось подтвердить вход."));
        } finally {
            setLoading(false);
        }
    }

    function returnToPassword() {
        setChallengeToken("");
        setVerificationCode("");
        setError("");
    }

    if (challengeToken) {
        return (
            <AuthShell
                title="Подтверждение входа"
                description="Двухфакторная защита администратора"
                footer={(
                    <Button type="button" variant="ghost" onClick={returnToPassword} className="mx-auto">
                        <ArrowLeft />Вернуться к паролю
                    </Button>
                )}
            >
                <form onSubmit={verifyTwoFactor} className="grid gap-4">
                    <Alert>
                        Введите код из приложения-аутентификатора. Вместо него можно использовать один резервный код.
                    </Alert>
                    <Field label="Код подтверждения" icon={KeyRound}>
                        <Input
                            type="text"
                            value={verificationCode}
                            onChange={(event) => setVerificationCode(event.target.value.toUpperCase())}
                            placeholder="123456"
                            autoComplete="one-time-code"
                            autoCapitalize="characters"
                            inputMode="text"
                            className="pl-9 font-mono"
                            minLength={6}
                            maxLength={32}
                            required
                            autoFocus
                        />
                    </Field>
                    {error && <Alert variant="error">{error}</Alert>}
                    <Button type="submit" size="lg" disabled={loading} className="w-full">
                        {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                        {loading ? "Проверка..." : "Подтвердить вход"}
                    </Button>
                </form>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title="Вход администратора"
            description="Управление серверами, клиентами и заказами"
            footer={<div className="text-center text-sm text-muted-foreground">Нет аккаунта администратора? <Link href="/register" className="font-medium text-primary hover:underline">Зарегистрироваться</Link></div>}
        >
            <form onSubmit={login} className="grid gap-4">
                <Field label="Email" icon={Mail}>
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoComplete="username" className="pl-9" maxLength={255} required autoFocus />
                </Field>
                <Field label="Пароль" icon={LockKeyhole}>
                    <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="pl-9" maxLength={72} required />
                </Field>
                {error && <Alert variant="error">{error}</Alert>}
                <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading && <Loader2 className="animate-spin" />}
                    {loading ? "Вход..." : "Войти"}
                </Button>
            </form>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <Button asChild variant="outline"><Link href="/buy"><ShoppingCart />Купить VPN</Link></Button>
                <Button asChild variant="outline"><Link href="/account"><UserRound />Вход клиента</Link></Button>
            </div>
        </AuthShell>
    );
}

function Field({ label, icon: Icon, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}</span><span className="relative"><Icon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />{children}</span></label>;
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") {
        if (detail === "Invalid credentials") return "Неверный логин или пароль";
        if (detail === "Too many login attempts") return "Слишком много попыток входа. Попробуйте через 10 минут.";
        return detail;
    }
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}

function getNextPath() {
    const nextPath = new URLSearchParams(window.location.search).get("next");
    return nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
}

function completeLogin(data, router) {
    if (!data?.access_token) {
        throw new Error("Сервер не вернул токен доступа.");
    }

    localStorage.setItem("token", data.access_token);
    router.replace(getNextPath());
}
