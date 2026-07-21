"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Mail, ShoppingCart, UserRound } from "lucide-react";

import AuthShell from "../../components/AuthShell";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function login(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const response = await api.post("/auth/login", { email: email.trim(), password });
            localStorage.setItem("token", response.data.access_token);
            router.push(getNextPath());
        } catch (error) {
            setError(getErrorMessage(error, "Неверный логин или пароль"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell
            title="Вход администратора"
            description="Управление серверами, клиентами и заказами"
            footer={<div className="text-center text-sm text-muted-foreground">Нет аккаунта администратора? <Link href="/register" className="font-medium text-primary hover:underline">Зарегистрироваться</Link></div>}
        >
            <form onSubmit={login} className="grid gap-4">
                <Field label="Email" icon={Mail}>
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoComplete="username" className="pl-9" required autoFocus />
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
    if (typeof detail === "string") return detail === "Invalid credentials" ? "Неверный логин или пароль" : detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}

function getNextPath() {
    const nextPath = new URLSearchParams(window.location.search).get("next");
    return nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
}
