"use client";

import { useState } from "react";
import NewsFeed from "../../components/NewsFeed";
import PublicHeader from "../../components/PublicHeader";

export default function NewsPage() {
    const [panelName, setPanelName] = useState("DLGTW VPN");
    return (
        <div className="min-h-screen bg-background">
            <PublicHeader panelName={panelName} />
            <main className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6 lg:py-9">
                <h1 className="mt-0 mb-5 text-2xl font-semibold">Новости</h1>
                <NewsFeed onPanelName={setPanelName} />
            </main>
        </div>
    );
}
