import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { adminApi } from "../services/api";
import "./Admin.css";

function AdminLogin() {
    const navigate = useNavigate();

    const [form, setForm] = useState({ username: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await adminApi.post("login/", form);
            const data = response.data?.data;
            if (data?.tokens?.access) {
                localStorage.setItem("admin_access_token", data.tokens.access);
                localStorage.setItem("admin_refresh_token", data.tokens.refresh);
                localStorage.setItem("admin_user", JSON.stringify(data));
                navigate("/admin/dashboard");
            } else {
                setError("Unexpected response from server.");
            }
        } catch (err) {
            const errors = err.response?.data?.errors;
            if (errors) {
                if (typeof errors === "object") {
                    const msgs = Object.values(errors).flat().join(" ");
                    setError(msgs || "Invalid admin credentials.");
                } else {
                    setError(String(errors));
                }
            } else {
                setError(err.response?.data?.message || "Failed to sign in as admin.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-login-container">
            <div className="admin-login-card">
                <div className="admin-login-header">
                    <div className="admin-shield-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="M9 12l2 2 4-4" />
                        </svg>
                    </div>
                    <span className="admin-portal-badge">Admin Portal</span>
                    <h1>Admin Sign In</h1>
                    <p>Sign in with a Django staff or superuser account</p>
                </div>

                {error && <div className="admin-alert error">⚠️ {error}</div>}

                <form onSubmit={handleSubmit} className="admin-login-form">
                    <div className="admin-form-group">
                        <label htmlFor="admin-username">Username or Email</label>
                        <input
                            id="admin-username"
                            type="text"
                            name="username"
                            placeholder="admin"
                            value={form.username}
                            onChange={handleChange}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="admin-form-group">
                        <label htmlFor="admin-password">Password</label>
                        <input
                            id="admin-password"
                            type="password"
                            name="password"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <button type="submit" className="admin-login-btn" disabled={loading}>
                        {loading ? "Signing in..." : "Sign In to Dashboard →"}
                    </button>
                </form>

                <div className="admin-login-footer">
                    <Link to="/login" className="back-to-user-link">
                        ← Back to User Login
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default AdminLogin;
