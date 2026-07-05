import api from "./api";

export async function getMe() {

    const token = localStorage.getItem("token");

    if (!token) {
        return null;
    }

    try {

        const response = await api.get("/auth/me", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        return response.data;

    } catch (e) {

        localStorage.removeItem("token");

        return null;

    }

}
