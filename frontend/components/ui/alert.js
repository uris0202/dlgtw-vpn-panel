import {
    AlertCircle,
    CheckCircle2,
    Info,
} from "lucide-react";

import { cn } from "../../lib/utils";

const variants = {
    error: {
        className: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
        icon: AlertCircle,
    },
    success: {
        className: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
        icon: CheckCircle2,
    },
    info: {
        className: "border-[#b2ccff] bg-[#eff4ff] text-[#1849a9]",
        icon: Info,
    },
};

export function Alert({ children, variant = "info", className }) {
    const selected = variants[variant] || variants.info;
    const Icon = selected.icon;

    return (
        <div
            role={variant === "error" ? "alert" : "status"}
            className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
                selected.className,
                className,
            )}
        >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
        </div>
    );
}
