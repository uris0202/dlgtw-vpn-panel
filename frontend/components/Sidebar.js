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

            <NavLink href="/dashboard">
                Главная
            </NavLink>

            <NavLink href="/servers">
                Серверы
            </NavLink>

            <NavLink href="/search">
                Поиск
            </NavLink>

            <NavLink href="/clients">
                Клиенты
            </NavLink>

            <NavLink href="/subscriptions">
                Подписка
            </NavLink>

            <NavLink href="/plans">
                Тарифы
            </NavLink>

            <NavLink href="/orders">
                Заказы
            </NavLink>

            <NavLink href="/accounts">
                Кабинеты клиентов
            </NavLink>

            <NavLink href="/settings">
                Настройки
            </NavLink>
        </aside>
    );
}

function NavLink({
    href,
    children,
}) {
    return (
        <a
            href={href}
            style={{
                display: "block",
                marginBottom: 18,
                color: "white",
                textDecoration: "none",
            }}
        >
            {children}
        </a>
    );
}
