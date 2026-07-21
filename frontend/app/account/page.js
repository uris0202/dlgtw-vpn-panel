"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, ShoppingCart, UserRound } from "lucide-react";

import AuthShell from "../../components/AuthShell";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";
import { CLIENT_ACCOUNT_PATH, clearClientOnboardingToken, clearClientToken, getClientAuthConfig } from "../../lib/clientAuth";

export default function AccountLoginPage() {
    const router = useRouter();
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        let active = true;
        async function checkSession() {
            try {
                await api.get("/public/account/session", getClientAuthConfig());
                if (active) {
                    clearClientToken();
                    router.replace(CLIENT_ACCOUNT_PATH);
                }
            } catch {
                if (active) {
                    clearClientToken();
                    setCheckingSession(false);
                }
            }
        }
        checkSession();
        return () => { active = false; };
    }, [router]);

    async function submit(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            await api.post("/public/account/login", { login: login.trim(), password });
            clearClientToken();
            clearClientOnboardingToken();
            router.replace(CLIENT_ACCOUNT_PATH);
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось войти в личный кабинет."));
        } finally {
            setLoading(false);
        }
    }

    if (checkingSession) {
        return <AuthShell title="Личный кабинет" description="Проверяем активную сессию"><div className="flex items-center justify-center py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Проверка сессии...</div></AuthShell>;
    }

    return (
        <AuthShell
            title="Вход клиента"
            description="Подписки, QR-коды, заказы и продление доступа"
            footer={<Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Вход администратора</Link>}
        >
            <form onSubmit={submit} className="grid gap-4">
                <Field label="Логин" icon={UserRound}>
                    <Input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" className="pl-9" required autoFocus />
                </Field>
                <Field label="Пароль" icon={LockKeyhole}>
                    <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="pl-9" required />
                </Field>
                {error && <Alert variant="error">{error}</Alert>}
                <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading && <Loader2 className="animate-spin" />}
                    {loading ? "Вход..." : "Войти"}
                </Button>
            </form>
            <Button asChild variant="outline" className="mt-3 w-full"><Link href="/buy"><ShoppingCart />Купить VPN</Link></Button>
        </AuthShell>
    );
}

function Field({ label, icon: Icon, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}</span><span className="relative"><Icon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />{children}</span></label>;
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}
