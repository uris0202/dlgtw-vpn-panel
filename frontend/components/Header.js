"use client";

export default function Header({
    user,
    onLogout,
}) {

    return (

        <div
            style={{
                background: "white",
                padding: 25,
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}
        >

            <h2>Личный кабинет</h2>

            <div
                style={{
                    display: "flex",
                    gap: 15,
                    alignItems: "center",
                }}
            >

                <b>{user?.email}</b>

                <button
                    onClick={onLogout}
                    style={{
                        background: "#ef4444",
                        color: "white",
                        border: 0,
                        borderRadius: 6,
                        padding: "8px 14px",
                        cursor: "pointer",
                    }}
                >
                    Выйти
                </button>

            </div>

        </div>

    );

}
