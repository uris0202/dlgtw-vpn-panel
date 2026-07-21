"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
    CircleDollarSign,
    LayoutDashboard,
    Link2,
    Menu,
    Search,
    Server,
    Settings,
    ShieldCheck,
    ShoppingCart,
    UserRoundCog,
    Users,
    X,
} from "lucide-react";

import { cn } from "../lib/utils";

const navigation = [
    {
        label: "Обзор",
        items: [
            { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
        ],
    },
    {
        label: "Инфраструктура",
        items: [
            { href: "/servers", label: "Серверы", icon: Server },
            { href: "/clients", label: "Клиенты", icon: Users },
            { href: "/search", label: "Поиск", icon: Search },
            { href: "/subscriptions", label: "Подписки", icon: Link2 },
        ],
    },
    {
        label: "Продажи",
        items: [
            { href: "/orders", label: "Заказы", icon: ShoppingCart },
            { href: "/plans", label: "Тарифы", icon: CircleDollarSign },
            { href: "/accounts", label: "Кабинеты клиентов", icon: UserRoundCog },
        ],
    },
    {
        label: "Система",
        items: [
            { href: "/settings", label: "Настройки", icon: Settings },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                setOpen(false);
            }
        }

        document.addEventListener("keydown", handleKeyDown);

        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="fixed top-3 left-3 z-50 inline-flex size-10 items-center justify-center rounded-md border border-[#33363d] bg-[#191a1e] text-white shadow-sm lg:hidden"
                aria-label={open ? "Закрыть меню" : "Открыть меню"}
                aria-expanded={open}
                title={open ? "Закрыть меню" : "Открыть меню"}
            >
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            {open && (
                <button
                    type="button"
                    className="fixed inset-0 z-30 bg-black/45 lg:hidden"
                    onClick={() => setOpen(false)}
                    aria-label="Закрыть меню"
                />
            )}

            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex h-screen w-[248px] flex-col border-r border-[#2d2f35] bg-[#191a1e] text-[#f5f5f6] transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0",
                    open ? "translate-x-0" : "-translate-x-full",
                )}
            >
                <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#2d2f35] px-5">
                    <div className="flex size-9 items-center justify-center rounded-md bg-[#155eef] text-white">
                        <ShieldCheck className="size-5" />
                    </div>

                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">DLGTW VPN</div>
                        <div className="text-xs text-[#9b9da5]">Control panel</div>
                    </div>
                </div>

                <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                    {navigation.map((section) => (
                        <div key={section.label} className="mb-5 last:mb-0">
                            <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase text-[#7f828b]">
                                {section.label}
                            </div>

                            <div className="grid gap-1">
                                {section.items.map((item) => (
                                    <NavLink
                                        key={item.href}
                                        {...item}
                                        active={isActivePath(pathname, item.href)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="border-t border-[#2d2f35] px-5 py-4 text-xs text-[#7f828b]">
                    3X-UI infrastructure
                </div>
            </aside>
        </>
    );
}

function NavLink({ href, label, icon: Icon, active }) {
    return (
        <Link
            href={href}
            className={cn(
                "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-[#c9cbd1] transition-colors hover:bg-[#25272c] hover:text-white",
                active && "bg-[#26395f] text-white",
            )}
        >
            <Icon className={cn("size-4.5", active ? "text-[#84adff]" : "text-[#8f929a]")} />
            <span className="truncate">{label}</span>
        </Link>
    );
}

function isActivePath(pathname, href) {
    if (href === "/dashboard") {
        return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}
