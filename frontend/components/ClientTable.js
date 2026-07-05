export default function ClientTable({
    clients,
    onEdit,
    onDelete,
}) {

    return (

        <table
            style={{
                width: "100%",
                background: "#fff",
                borderCollapse: "collapse",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 3px 10px rgba(0,0,0,.08)",
            }}
        >

            <thead>

                <tr
                    style={{
                        background: "#2563eb",
                        color: "#fff",
                    }}
                >

                    <th style={{ padding: 12 }}>Email</th>
                    <th>Группа</th>
                    <th>Трафик</th>
                    <th>Статус</th>
                    <th>Окончание</th>
                    <th>Действия</th>

                </tr>

            </thead>

            <tbody>

                {clients.map(client => (

                    <tr
                        key={client.email}
                        style={{
                            borderBottom: "1px solid #eee",
                        }}
                    >

                        <td style={{ padding: 12 }}>
                            {client.email}
                        </td>

                        <td>{client.group}</td>

                        <td>
                            {(client.traffic / 1024 / 1024 / 1024).toFixed(2)} GB
                        </td>

                        <td
                            style={{
                                textAlign: "center",
                            }}
                        >
                            {client.enabled ? "🟢" : "🔴"}
                        </td>

                        <td>

                            {
                                client.expiry === 0
                                    ? "∞"
                                    : new Date(client.expiry).toLocaleDateString()
                            }

                        </td>

                        <td>

                            <button
                                onClick={() => onEdit(client)}
                                style={{
                                    marginRight: 8,
                                    padding: "6px 12px",
                                    border: "none",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    background: "#f59e0b",
                                    color: "#fff",
                                }}
                            >
                                ✏
                            </button>

                            <button
                                onClick={() => onDelete(client.email)}
                                style={{
                                    padding: "6px 12px",
                                    border: "none",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    background: "#ef4444",
                                    color: "#fff",
                                }}
                            >
                                🗑
                            </button>

                        </td>

                    </tr>

                ))}

            </tbody>

        </table>

    );

}
