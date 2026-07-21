import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
    "inline-flex min-h-6 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
    {
        variants: {
            variant: {
                default: "border-transparent bg-primary text-white",
                secondary: "border-transparent bg-secondary text-secondary-foreground",
                success: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
                warning: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
                destructive: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
                outline: "border-border bg-card text-muted-foreground",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

export function Badge({ className, variant, ...props }) {
    return (
        <span
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { badgeVariants };
