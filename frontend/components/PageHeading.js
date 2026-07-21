import { cn } from "../lib/utils";

export default function PageHeading({
    title,
    description,
    actions,
    className,
}) {
    return (
        <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
            <div className="min-w-0">
                <h1 className="m-0 text-2xl font-semibold text-foreground">{title}</h1>
                {description && (
                    <p className="mt-1.5 mb-0 text-sm text-muted-foreground">{description}</p>
                )}
            </div>

            {actions && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
}
