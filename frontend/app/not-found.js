import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import PublicHeader from "../components/PublicHeader";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background">
            <PublicHeader compact />
            <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-5xl items-center justify-center px-4 py-8 sm:px-6">
                <Card className="w-full max-w-md p-7 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <SearchX className="size-5" />
                    </div>
                    <div className="mt-5 text-xs font-semibold uppercase text-muted-foreground">Ошибка 404</div>
                    <h1 className="mt-2 mb-0 text-xl font-semibold">Страница не найдена</h1>
                    <p className="mt-2 mb-6 text-sm leading-5 text-muted-foreground">
                        Возможно, ссылка устарела или адрес был введён с ошибкой.
                    </p>
                    <Button asChild><Link href="/buy"><ArrowLeft />Вернуться на сайт</Link></Button>
                </Card>
            </main>
        </div>
    );
}
