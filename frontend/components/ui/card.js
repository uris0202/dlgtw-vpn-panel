import { cn } from "../../lib/utils";

export function Card({ className, ...props }) {
    return (
        <div
            className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}
            {...props}
        />
    );
}

export function CardHeader({ className, ...props }) {
    return <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
    return <h3 className={cn("m-0 text-base font-semibold", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
    return <p className={cn("m-0 text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
    return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
    return <div className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}
