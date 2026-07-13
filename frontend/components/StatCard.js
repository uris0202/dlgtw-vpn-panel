export default function StatCard({
    title,
    value,
    description = "",
    tone = "default",
}) {

    const accent = accents[tone] || accents.default;

    return (

        <div
            style={{
                ...card,
                borderLeft: `4px solid ${accent}`,
            }}
        >

            <div
                style={titleStyle}
            >
                {title}
            </div>

            <div style={valueStyle}>
                {value}
            </div>

            {description && (
                <div style={descriptionStyle}>
                    {description}
                </div>
            )}

        </div>

    );

}

const accents = {
    default: "#2563eb",
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    neutral: "#64748b",
};

const card = {
    background: "white",
    padding: 22,
    borderRadius: 10,
    boxShadow: "0 3px 10px rgba(0,0,0,.08)",
};

const titleStyle = {
    color: "#6b7280",
    marginBottom: 8,
    fontSize: 14,
};

const valueStyle = {
    color: "#111827",
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 700,
};

const descriptionStyle = {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 1.4,
};
