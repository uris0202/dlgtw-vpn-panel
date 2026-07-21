"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Mail } from "lucide-react";

import AuthShell from "../../components/AuthShell";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import api from "../../lib/api";

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordRepeat, setPasswordRepeat] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function register(event) {
        event.preventDefault();
        setError("");
        if (password !== passwordRepeat) {
            setError("Пароли не совпадают.");
            return;
        }
        setLoading(true);
        try {
            await api.post("/auth/register", { email: email.trim(), password });
            const response = await api.post("/auth/login", { email: email.trim(), password });
            localStorage.setItem("token", response.data.access_token);
            router.push("/dashboard");
        } catch (error) {
            setError(getErrorMessage(error, "Не удалось создать аккаунт."));
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell
            title="Создание администратора"
            description="Регистрация учётной записи для управления панелью"
            footer={<div className="text-center text-sm text-muted-foreground">Уже есть аккаунт? <Link href="/login" className="font-medium text-primary hover:underline">Войти</Link></div>}
        >
            <form onSubmit={register} className="grid gap-4">
                <Field label="Email" icon={Mail}>
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoComplete="username" className="pl-9" required autoFocus />
                </Field>
                <Field label="Пароль" icon={LockKeyhole}>
                    <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="6" autoComplete="new-password" className="pl-9" required />
                </Field>
                <Field label="Повторите пароль" icon={LockKeyhole}>
                    <Input type="password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} minLength="6" autoComplete="new-password" className="pl-9" required />
                </Field>
                {error && <Alert variant="error">{error}</Alert>}
                <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading && <Loader2 className="animate-spin" />}
                    {loading ? "Создание..." : "Создать аккаунт"}
                </Button>
            </form>
        </AuthShell>
    );
}

function Field({ label, icon: Icon, children }) {
    return <label className="grid gap-1.5"><span className="text-sm font-medium">{label}</span><span className="relative"><Icon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />{children}</span></label>;
}

function getErrorMessage(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === "string") {
        if (detail === "Email already exists") return "Пользователь с таким email уже существует.";
        if (detail === "Registration is closed") return "Регистрация закрыта. Войдите под существующим аккаунтом.";
        return detail;
    }
    if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(". ");
    return error?.message || fallback;
}
