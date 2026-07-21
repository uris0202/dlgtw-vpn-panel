"use client";

import {
    LogOut,
    UserRound,
} from "lucide-react";

import { Button } from "./ui/button";

export default function Header({ user, onLogout }) {
    return (
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white/95 pr-4 pl-16 sm:pr-6 lg:px-8">
            <div>
                <div className="text-sm font-semibold text-foreground">Администрирование</div>
                <div className="hidden text-xs text-muted-foreground sm:block">Управление VPN-инфраструктурой</div>
            </div>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <div className="hidden min-w-0 items-center gap-2 sm:flex">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <UserRound className="size-4" />
                    </div>
                    <span className="max-w-52 truncate text-sm font-medium text-foreground">
                        {user?.email || "Администратор"}
                    </span>
                </div>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onLogout}
                    title="Выйти"
                    aria-label="Выйти"
                    className="text-muted-foreground hover:text-destructive"
                >
                    <LogOut />
                </Button>
            </div>
        </header>
    );
}
