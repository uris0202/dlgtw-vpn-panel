"use client";

import { useEffect, useState } from "react";

export default function ClientModal({
    open,
    client,
    onClose,
    onSave,
}) {

    const [group, setGroup] = useState("");
    const [comment, setComment] = useState("");
    const [days, setDays] = useState("");
    const [totalGB, setTotalGB] = useState("");
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {

        if (!client) return;

        setGroup(client.group || "");
        setComment(client.comment || "");
        setDays("");
        setTotalGB("");
        setEnabled(client.enabled);

    }, [client]);

    if (!open) return null;

    return (

        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
            }}
        >

            <div
                style={{
                    width: 420,
                    background: "#fff",
                    borderRadius: 12,
                    padding: 25,
                    boxShadow: "0 10px 35px rgba(0,0,0,.25)",
                }}
            >

                <h2 style={{ marginTop: 0 }}>
                    Редактирование клиента
                </h2>

                <div style={{ marginBottom: 15 }}>
                    <b>{client.email}</b>
                </div>

                <label>Группа</label>

                <input
                    value={group}
                    onChange={(e)=>setGroup(e.target.value)}
                    style={input}
                />

                <label>Комментарий</label>

                <input
                    value={comment}
                    onChange={(e)=>setComment(e.target.value)}
                    style={input}
                />

                <label>Продлить (дней)</label>

                <input
                    type="number"
                    value={days}
                    onChange={(e)=>setDays(e.target.value)}
                    style={input}
                />

                <label>Лимит (GB)</label>

                <input
                    type="number"
                    value={totalGB}
                    onChange={(e)=>setTotalGB(e.target.value)}
                    style={input}
                />

                <label
                    style={{
                        display:"flex",
                        gap:10,
                        marginTop:15,
                        alignItems:"center",
                    }}
                >

                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e)=>setEnabled(e.target.checked)}
                    />

                    Включен

                </label>

                <div
                    style={{
                        display:"flex",
                        justifyContent:"flex-end",
                        gap:10,
                        marginTop:25,
                    }}
                >

                    <button
                        onClick={onClose}
                    >
                        Отмена
                    </button>

                    <button
                        onClick={()=>onSave({
                            group,
                            comment,
                            days: days === "" ? null : Number(days),
                            total_gb: totalGB === "" ? null : Number(totalGB),
                            enable: enabled,
                        })}
                    >
                        Сохранить
                    </button>

                </div>

            </div>

        </div>

    );

}

const input = {
    width:"100%",
    marginBottom:15,
    marginTop:5,
    padding:10,
    border:"1px solid #ccc",
    borderRadius:6,
};
