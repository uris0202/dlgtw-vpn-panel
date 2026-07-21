import { cn } from "../../lib/utils";

export function Input({ className, ...props }) {
    return (
        <input
            className={cn(
                "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
                className,
            )}
            {...props}
        />
    );
}

export function Select({ className, ...props }) {
    return (
        <select
            className={cn(
                "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
                className,
            )}
            {...props}
        />
    );
}
