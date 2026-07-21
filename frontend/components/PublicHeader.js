import Link from "next/link";
import {
    ShieldCheck,
    ShoppingCart,
    UserRound,
} from "lucide-react";

import { cn } from "../lib/utils";

export default function PublicHeader({ panelName = "DLGTW VPN", actions, compact = false }) {
    return (
        <header className="border-b border-border bg-card">
            <div className={cn("mx-auto flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6", compact ? "max-w-5xl" : "max-w-7xl")}>
                <Link href="/buy" className="flex min-w-0 items-center gap-3 text-foreground no-underline">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-white">
                        <ShieldCheck className="size-5" />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{panelName}</span>
                        <span className="hidden text-xs text-muted-foreground sm:block">Безопасное подключение</span>
                    </span>
                </Link>

                {actions || (
                    <nav className="flex shrink-0 items-center gap-1 text-sm">
                        <Link href="/buy" className="flex size-9 items-center justify-center rounded-md font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-auto sm:gap-2 sm:px-3" aria-label="Купить VPN" title="Купить VPN">
                            <ShoppingCart className="size-4" />
                            <span className="hidden sm:inline">Купить VPN</span>
                        </Link>
                        <Link href="/account" className="flex size-9 items-center justify-center rounded-md font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-auto sm:gap-2 sm:px-3" aria-label="Личный кабинет" title="Личный кабинет">
                            <UserRound className="size-4" />
                            <span className="hidden sm:inline">Личный кабинет</span>
                        </Link>
                    </nav>
                )}
            </div>
        </header>
    );
}
