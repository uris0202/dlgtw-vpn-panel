export default function StatCard({
    title,
    value,
}) {

    return (

        <div
            style={{
                background: "white",
                padding: 25,
                borderRadius: 12,
                boxShadow: "0 3px 10px rgba(0,0,0,.08)",
            }}
        >

            <div
                style={{
                    color: "#666",
                    marginBottom: 10,
                }}
            >
                {title}
            </div>

            <h2>{value}</h2>

        </div>

    );

}
