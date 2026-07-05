import "./globals.css";

export const metadata = {
    title: "DLGTW VPN",
    description: "DLGTW VPN Control Panel",
};

export default function RootLayout({ children }) {
    return (
        <html lang="ru">
            <body>{children}</body>
        </html>
    );
}
