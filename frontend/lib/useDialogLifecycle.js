"use client";

import { useEffect } from "react";

export default function useDialogLifecycle(open, onClose, closeDisabled = false) {
    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function handleKeyDown(event) {
            if (event.key === "Escape" && !closeDisabled) {
                onClose?.();
            }
        }

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose, closeDisabled]);
}
