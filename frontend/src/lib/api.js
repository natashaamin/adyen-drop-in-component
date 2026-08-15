const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8081/api";

async function request(path, options) {
    const res = await fetch(`${API_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request to ${path} failed with ${res.status}`);
    }
    return res.json();
}

export const api = {
    getConfig: () => request("/config"),
    createSession: (payload) =>
        request("/sessions", { method: "POST", body: JSON.stringify(payload) }),
    getOrder: (reference) => request(`/orders/${encodeURIComponent(reference)}`),
    listOrders: () => request("/orders"),
    replayWebhook: (reference) =>
        request(`/orders/${encodeURIComponent(reference)}/replay`, { method: "POST" })
};
