import {
    Activity,
    Clock3,
    Server,
    TriangleAlert,
    Users,
} from "lucide-react";

import { cn } from "../lib/utils";
import { Card } from "./ui/card";

const tones = {
    default: {
        icon: Users,
        iconClassName: "bg-[#eff4ff] text-[#155eef]",
    },
    success: {
        icon: Activity,
        iconClassName: "bg-[#ecfdf3] text-[#067647]",
    },
    warning: {
        icon: Clock3,
        iconClassName: "bg-[#fffaeb] text-[#b54708]",
    },
    danger: {
        icon: TriangleAlert,
        iconClassName: "bg-[#fef3f2] text-[#b42318]",
    },
    neutral: {
        icon: Server,
        iconClassName: "bg-[#f2f4f7] text-[#475467]",
    },
};

export default function StatCard({
    title,
    value,
    description = "",
    tone = "default",
    icon,
}) {
    const selectedTone = tones[tone] || tones.default;
    const Icon = icon || selectedTone.icon;

    return (
        <Card className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-muted-foreground">{title}</div>
                    <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
                </div>

                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", selectedTone.iconClassName)}>
                    <Icon className="size-4.5" />
                </div>
            </div>

            {description && (
                <div className="mt-3 truncate text-xs text-muted-foreground" title={description}>
                    {description}
                </div>
            )}
        </Card>
    );
}
