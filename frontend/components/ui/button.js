import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-[#0f4dcc]",
                secondary: "bg-secondary text-secondary-foreground hover:bg-[#e4e7ec]",
                outline: "border border-border bg-card text-foreground hover:bg-muted",
                ghost: "text-foreground hover:bg-muted",
                destructive: "bg-destructive text-white hover:bg-[#b42318]",
                link: "h-auto px-0 text-primary hover:underline",
            },
            size: {
                default: "h-9 px-3",
                sm: "h-8 px-2.5 text-xs",
                lg: "h-10 px-4",
                icon: "size-9 px-0",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
}) {
    const Component = asChild ? Slot : "button";

    return (
        <Component
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { buttonVariants };
