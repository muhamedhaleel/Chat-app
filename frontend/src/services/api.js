import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/user/";
const ADMIN_BASE_URL = BASE_URL.replace(/\/user\/?$/, "/admin/");

const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

export const adminApi = axios.create({
    baseURL: ADMIN_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

adminApi.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("admin_access_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Automatically attach JWT token to all requests if present in localStorage
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("access_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Auto-refresh token on 401 responses
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true;
            const refreshToken = localStorage.getItem("refresh_token");
            if (refreshToken) {
                try {
                    const res = await axios.post(`${BASE_URL}token/refresh/`, {
                        refresh: refreshToken,
                    });
                    const newAccess = res.data?.access;
                    if (newAccess) {
                        localStorage.setItem("access_token", newAccess);
                        original.headers.Authorization = `Bearer ${newAccess}`;
                        return api(original);
                    }
                } catch {
                    // Refresh failed — clear tokens
                    localStorage.removeItem("access_token");
                    localStorage.removeItem("refresh_token");
                    localStorage.removeItem("user");
                }
            }
        }
        return Promise.reject(error);
    }
);

/**
 * Ensures we have a valid (non-expired) access token for WebSocket auth.
 * Decodes the JWT expiry claim and refreshes proactively if < 90s remain.
 * Returns the access token string, or null if unauthenticated.
 */
export async function ensureAccessToken() {
    let token = localStorage.getItem("access_token");
    if (!token) return null;

    try {
        // Decode JWT payload (base64url → JSON)
        const payloadB64 = token.split(".")[1];
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
        const now = Math.floor(Date.now() / 1000);

        // Proactively refresh if the token expires within 90 seconds
        if (payload.exp && payload.exp - now < 90) {
            const refreshToken = localStorage.getItem("refresh_token");
            if (!refreshToken) return null;

            const res = await axios.post(`${BASE_URL}token/refresh/`, {
                refresh: refreshToken,
            });
            const newAccess = res.data?.access;
            if (newAccess) {
                localStorage.setItem("access_token", newAccess);
                token = newAccess;
            }
        }
    } catch {
        // Decode or refresh failed — return whatever token we have
        // The WebSocket will close with 4001 if truly invalid
    }

    return token;
}

export default api;
