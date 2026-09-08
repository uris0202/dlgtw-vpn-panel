"use client";

import Link from "next/link";
import { House, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

export default function ErrorPage({ reset }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
            <Card className="w-full max-w-md p-7 text-center">
                <div className="mx-auto flex size-11 items-center justify-center rounded-md bg-[#fef3f2] text-[#b42318]">
                    <TriangleAlert className="size-5" />
                </div>
                <h1 className="mt-5 mb-0 text-xl font-semibold">Не удалось открыть страницу</h1>
                <p className="mt-2 mb-6 text-sm leading-5 text-muted-foreground">
                    Повторите попытку. Если ошибка сохранится, обновите страницу или вернитесь на главную.
                </p>
                <div className="flex flex-col justify-center gap-2 sm:flex-row">
                    <Button type="button" onClick={reset}><RefreshCw />Повторить</Button>
                    <Button asChild variant="outline"><Link href="/buy"><House />На главную</Link></Button>
                </div>
            </Card>
        </main>
    );
}
