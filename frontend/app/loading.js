import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                Загрузка...
            </div>
        </main>
    );
}
