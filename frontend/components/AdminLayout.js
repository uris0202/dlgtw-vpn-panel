import Header from "./Header";
import Sidebar from "./Sidebar";

export default function AdminLayout({ user, onLogout, children }) {
    return (
        <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
            <Sidebar />

            <div className="min-w-0">
                <Header user={user} onLogout={onLogout} />
                <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
                    {children}
                </main>
            </div>
        </div>
    );
}
