import api from "./api";

export async function getDashboard({
    refresh = false,
} = {}) {

    const token = localStorage.getItem("token");

    const response = await api.get(
        "/dashboard",
        {
            params: {
                refresh,
            },
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data;

}


export async function getDashboardOrders() {

    const token = localStorage.getItem("token");

    const response = await api.get(
        "/orders",
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    return response.data;

}
