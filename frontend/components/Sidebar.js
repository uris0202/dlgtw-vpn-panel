export default function Sidebar() {
    return (
        <aside
            style={{
                width: 250,
                background: "#1e293b",
                color: "white",
                padding: 25,
                minHeight: "100vh",
                boxSizing: "border-box",
            }}
        >
            <h2>DLGTW VPN</h2>

            <hr style={{ margin: "20px 0", opacity: .3 }} />

            <div style={{ marginBottom: 18 }}>🏠 Главная</div>
            <div style={{ marginBottom: 18 }}>🌍 Серверы</div>
            <div style={{ marginBottom: 18 }}>📱 Устройства</div>
            <div style={{ marginBottom: 18 }}>📦 Подписка</div>
            <div style={{ marginBottom: 18 }}>👤 Профиль</div>
            <div>⚙ Настройки</div>
        </aside>
    );
}
