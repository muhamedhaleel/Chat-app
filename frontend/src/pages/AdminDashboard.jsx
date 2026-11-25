import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { adminApi } from "../services/api";
import "./Admin.css";

function AdminDashboard() {
    const navigate = useNavigate();

    const [stats, setStats] = useState({
        total_users: 0,
        active_users: 0,
        blocked_users: 0,
        staff_users: 0,
        total_interests: 0,
        pending_interests: 0,
        accepted_interests: 0,
        rejected_interests: 0,
        total_messages: 0,
    });
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [toast, setToast] = useState({ msg: "", type: "" });

    // Create User Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState("");
    const [newUser, setNewUser] = useState({
        username: "",
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        gender: "",
        bio: "",
        is_staff: false,
    });

    const [adminUser] = useState(() => {
        try {
            const raw = localStorage.getItem("admin_user");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });

    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: "", type: "" }), 3500);
    };

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
            const res = await adminApi.get(`dashboard/${params}`);
            if (res.data?.stats) setStats(res.data.stats);
            if (res.data?.users) setUsers(res.data.users);
        } catch (err) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                localStorage.removeItem("admin_access_token");
                localStorage.removeItem("admin_refresh_token");
                localStorage.removeItem("admin_user");
                navigate("/admin/login");
            }
        } finally {
            setLoading(false);
        }
    }, [searchQuery, navigate]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    const handleLogout = () => {
        localStorage.removeItem("admin_access_token");
        localStorage.removeItem("admin_refresh_token");
        localStorage.removeItem("admin_user");
        navigate("/admin/login");
    };

    const handleToggleBlock = async (userId) => {
        try {
            const res = await adminApi.post(`users/${userId}/toggle-block/`);
            showToast(res.data.message || "User status updated.", "success");
            setUsers((prev) =>
                prev.map((u) =>
                    u.id === userId ? { ...u, is_blocked: res.data.is_blocked } : u
                )
            );
            setStats((prev) => ({
                ...prev,
                blocked_users: res.data.is_blocked
                    ? prev.blocked_users + 1
                    : Math.max(0, prev.blocked_users - 1),
            }));
        } catch (err) {
            showToast(err.response?.data?.message || "Failed to update user.", "error");
        }
    };

    const handleCreateChange = (e) => {
        const { name, value, type, checked } = e.target;
        setNewUser((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleCreateUserSubmit = async (e) => {
        e.preventDefault();
        setCreateError("");
        setCreating(true);

        try {
            const res = await adminApi.post("users/create/", newUser);
            showToast(res.data.message || "User created successfully!", "success");
            setIsCreateOpen(false);
            setNewUser({
                username: "",
                email: "",
                password: "",
                first_name: "",
                last_name: "",
                gender: "",
                bio: "",
                is_staff: false,
            });
            fetchDashboard();
        } catch (err) {
            const errors = err.response?.data?.errors;
            if (errors && typeof errors === "object") {
                setCreateError(
                    Object.entries(errors)
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                        .join(" | ")
                );
            } else {
                setCreateError(err.response?.data?.message || "Failed to create user.");
            }
        } finally {
            setCreating(false);
        }
    };

    const formatGender = (g) => {
        if (!g) return "—";
        if (g === "prefer_not_to_say") return "Prefer not to say";
        return g.charAt(0).toUpperCase() + g.slice(1);
    };

    return (
        <div className="admin-dash-container">
            {toast.msg && (
                <div className={`admin-toast ${toast.type}`}>
                    {toast.type === "success" ? "✓" : "✕"} {toast.msg}
                </div>
            )}

            {/* Navbar */}
            <nav className="admin-navbar">
                <div className="admin-brand">
                    <div className="admin-brand-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <span className="admin-brand-title">ChatFlow Admin</span>
                </div>

                <div className="admin-nav-actions">
                    <span className="admin-user-chip">
                        Signed in as <strong>@{adminUser?.username || "admin"}</strong>
                    </span>
                    <Link to="/login" className="admin-nav-link">User App</Link>
                    <button className="admin-logout-btn" onClick={handleLogout}>
                        Sign Out
                    </button>
                </div>
            </nav>

            <main className="admin-dash-main">
                {/* Header */}
                <div className="admin-dash-header">
                    <div>
                        <h1>Admin Dashboard</h1>
                        <p>Monitor registered users, platform activity, and create new user accounts.</p>
                    </div>
                    <button
                        className="admin-create-user-btn"
                        onClick={() => {
                            setCreateError("");
                            setIsCreateOpen(true);
                        }}
                    >
                        + Create User
                    </button>
                </div>

                {/* Basic User Count & Stats Grid */}
                <section className="admin-stats-grid">
                    <div className="admin-stat-card">
                        <div className="stat-badge users">👥</div>
                        <div className="stat-info">
                            <span className="stat-val">{stats.total_users}</span>
                            <span className="stat-lbl">Total Users</span>
                        </div>
                    </div>

                    <div className="admin-stat-card">
                        <div className="stat-badge active">🟢</div>
                        <div className="stat-info">
                            <span className="stat-val">{stats.active_users}</span>
                            <span className="stat-lbl">Active Users</span>
                        </div>
                    </div>

                    <div className="admin-stat-card">
                        <div className="stat-badge blocked">🚫</div>
                        <div className="stat-info">
                            <span className="stat-val">{stats.blocked_users}</span>
                            <span className="stat-lbl">Blocked Users</span>
                        </div>
                    </div>

                    <div className="admin-stat-card">
                        <div className="stat-badge interests">💌</div>
                        <div className="stat-info">
                            <span className="stat-val">{stats.total_interests}</span>
                            <span className="stat-lbl">
                                Interests ({stats.accepted_interests} accepted)
                            </span>
                        </div>
                    </div>

                    <div className="admin-stat-card">
                        <div className="stat-badge messages">💬</div>
                        <div className="stat-info">
                            <span className="stat-val">{stats.total_messages}</span>
                            <span className="stat-lbl">Total Messages</span>
                        </div>
                    </div>
                </section>

                {/* Users Table Section */}
                <section className="admin-users-section">
                    <div className="users-section-toolbar">
                        <h2>Registered Users ({users.length})</h2>
                        <input
                            type="text"
                            className="admin-search-input"
                            placeholder="Search by username, name, or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {loading ? (
                        <div className="admin-loading">Loading user details...</div>
                    ) : users.length === 0 ? (
                        <div className="admin-empty">No users found.</div>
                    ) : (
                        <div className="admin-table-wrapper">
                            <table className="admin-users-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>User</th>
                                        <th>Email</th>
                                        <th>Gender</th>
                                        <th>Interests (S / R)</th>
                                        <th>Joined</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => {
                                        const fullName =
                                            u.first_name || u.last_name
                                                ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
                                                : u.username;
                                        return (
                                            <tr key={u.id}>
                                                <td className="td-id">#{u.id}</td>
                                                <td>
                                                    <div className="td-user-cell">
                                                        <span className="td-user-name">{fullName}</span>
                                                        <span className="td-username">@{u.username}</span>
                                                    </div>
                                                </td>
                                                <td>{u.email || "—"}</td>
                                                <td>{formatGender(u.gender)}</td>
                                                <td>
                                                    {u.sent_interests_count} sent / {u.received_interests_count} recv
                                                </td>
                                                <td>{new Date(u.date_joined).toLocaleDateString()}</td>
                                                <td>
                                                    {u.is_staff || u.is_superuser ? (
                                                        <span className="role-pill admin">Admin</span>
                                                    ) : u.is_blocked ? (
                                                        <span className="role-pill blocked">Blocked</span>
                                                    ) : (
                                                        <span className="role-pill active">Active</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {u.id === adminUser?.id ? (
                                                        <span className="self-note">Current Admin</span>
                                                    ) : (
                                                        <button
                                                            className={`block-toggle-btn ${u.is_blocked ? "unblock" : "block"}`}
                                                            onClick={() => handleToggleBlock(u.id)}
                                                        >
                                                            {u.is_blocked ? "Unblock" : "Block"}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            {/* Create User Modal */}
            {isCreateOpen && (
                <div className="admin-modal-overlay" onClick={() => setIsCreateOpen(false)}>
                    <div className="admin-modal-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h3>Create New User</h3>
                            <button className="admin-modal-close" onClick={() => setIsCreateOpen(false)}>
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateUserSubmit}>
                            <div className="admin-modal-body">
                                {createError && <div className="admin-alert error">{createError}</div>}

                                <div className="admin-form-grid-2">
                                    <div className="admin-form-group">
                                        <label htmlFor="cu-username">Username *</label>
                                        <input
                                            id="cu-username"
                                            type="text"
                                            name="username"
                                            value={newUser.username}
                                            onChange={handleCreateChange}
                                            required
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label htmlFor="cu-email">Email *</label>
                                        <input
                                            id="cu-email"
                                            type="email"
                                            name="email"
                                            value={newUser.email}
                                            onChange={handleCreateChange}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="admin-form-grid-2">
                                    <div className="admin-form-group">
                                        <label htmlFor="cu-first">First Name</label>
                                        <input
                                            id="cu-first"
                                            type="text"
                                            name="first_name"
                                            value={newUser.first_name}
                                            onChange={handleCreateChange}
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label htmlFor="cu-last">Last Name</label>
                                        <input
                                            id="cu-last"
                                            type="text"
                                            name="last_name"
                                            value={newUser.last_name}
                                            onChange={handleCreateChange}
                                        />
                                    </div>
                                </div>

                                <div className="admin-form-grid-2">
                                    <div className="admin-form-group">
                                        <label htmlFor="cu-password">Password *</label>
                                        <input
                                            id="cu-password"
                                            type="password"
                                            name="password"
                                            value={newUser.password}
                                            onChange={handleCreateChange}
                                            required
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label htmlFor="cu-gender">Gender</label>
                                        <select
                                            id="cu-gender"
                                            name="gender"
                                            value={newUser.gender}
                                            onChange={handleCreateChange}
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                            <option value="prefer_not_to_say">Prefer not to say</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="admin-form-group">
                                    <label htmlFor="cu-bio">Bio</label>
                                    <textarea
                                        id="cu-bio"
                                        name="bio"
                                        rows="3"
                                        value={newUser.bio}
                                        onChange={handleCreateChange}
                                        placeholder="Optional user bio..."
                                    />
                                </div>

                                <label className="admin-checkbox-row">
                                    <input
                                        type="checkbox"
                                        name="is_staff"
                                        checked={newUser.is_staff}
                                        onChange={handleCreateChange}
                                    />
                                    <span>Grant Admin / Staff privileges</span>
                                </label>
                            </div>

                            <div className="admin-modal-footer">
                                <button
                                    type="button"
                                    className="admin-cancel-btn"
                                    onClick={() => setIsCreateOpen(false)}
                                    disabled={creating}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="admin-submit-btn" disabled={creating}>
                                    {creating ? "Creating..." : "Create User"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
