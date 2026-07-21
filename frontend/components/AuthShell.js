import PublicHeader from "./PublicHeader";
import { Card } from "./ui/card";

export default function AuthShell({ title, description, children, footer, panelName = "DLGTW VPN" }) {
    return (
        <div className="min-h-screen bg-background">
            <PublicHeader panelName={panelName} compact />
            <main className="mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-6">
                <Card className="w-full max-w-md p-5 sm:p-7">
                    <h1 className="m-0 text-xl font-semibold">{title}</h1>
                    <p className="mt-1.5 mb-6 text-sm text-muted-foreground">{description}</p>
                    {children}
                    {footer && <div className="mt-6 border-t border-border pt-5">{footer}</div>}
                </Card>
            </main>
        </div>
    );
}
