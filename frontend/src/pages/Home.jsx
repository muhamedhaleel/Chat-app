import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import "./Home.css";

function Home() {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    const [profile, setProfile] = useState({
        username: "",
        email: "",
        first_name: "",
        last_name: "",
        bio: "",
        gender: "",
        date_joined: "",
    });

    const [editForm, setEditForm] = useState({
        first_name: "",
        last_name: "",
        email: "",
        bio: "",
        gender: "",
    });

    const [stats, setStats] = useState({
        receivedCount: 0,
        pendingReceived: 0,
        sentCount: 0,
        membersCount: 0,
    });

    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // Fetch user profile and dashboard stats
    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Fetch profile
                const profileRes = await api.get("profile/");
                if (profileRes.data?.data) {
                    const data = profileRes.data.data;
                    setProfile(data);
                    localStorage.setItem("user", JSON.stringify(data));
                    setEditForm({
                        first_name: data.first_name || "",
                        last_name: data.last_name || "",
                        email: data.email || "",
                        bio: data.bio || "",
                        gender: data.gender || "",
                    });
                }
            } catch (err) {
                if (err.response?.status === 401) {
                    localStorage.removeItem("access_token");
                    localStorage.removeItem("refresh_token");
                    localStorage.removeItem("user");
                    navigate("/login");
                    return;
                }
            }

            try {
                // Fetch received interests count
                const receivedRes = await api.get("interests/received/");
                const receivedList = receivedRes.data?.data || [];
                const pendingCount = receivedList.filter((r) => r.status === "pending").length;

                // Fetch sent interests count
                const sentRes = await api.get("interests/sent/");
                const sentList = sentRes.data?.data || [];

                // Fetch members count
                const browseRes = await api.get("browse/");
                const membersList = browseRes.data?.data || [];

                setStats({
                    receivedCount: receivedList.length,
                    pendingReceived: pendingCount,
                    sentCount: sentList.length,
                    membersCount: membersList.length,
                });
            } catch (err) {
                console.error("Dashboard stats error:", err);
            }
        };

        fetchDashboardData();
    }, [navigate]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleEditChange = (e) => {
        setEditForm({
            ...editForm,
            [e.target.name]: e.target.value,
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setMessage("");
        setError("");
        setSaving(true);

        try {
            const response = await api.put("profile/", editForm);
            setMessage(response.data.message || "Profile updated successfully!");
            if (response.data?.data) {
                setProfile(response.data.data);
                localStorage.setItem("user", JSON.stringify(response.data.data));
            }
            setTimeout(() => {
                setIsEditModalOpen(false);
                setMessage("");
            }, 1200);
        } catch (err) {
            const errors = err.response?.data?.errors;
            if (errors) {
                if (typeof errors === "object") {
                    setError(
                        Object.entries(errors)
                            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                            .join(" | ")
                    );
                } else {
                    setError(String(errors));
                }
            } else {
                setError(err.response?.data?.message || "Failed to update profile.");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleOpenEditModal = () => {
        setEditForm({
            first_name: profile.first_name || "",
            last_name: profile.last_name || "",
            email: profile.email || "",
            bio: profile.bio || "",
            gender: profile.gender || "",
        });
        setError("");
        setMessage("");
        setIsProfileMenuOpen(false);
        setIsEditModalOpen(true);
    };

    const handleLogout = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const getInitials = () => {
        if (profile.first_name) {
            return (profile.first_name[0] + (profile.last_name?.[0] || "")).toUpperCase();
        }
        return (profile.username?.[0] || "U").toUpperCase();
    };

    const displayName = profile.first_name || profile.last_name
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.username || "User";

    // Calculate profile completion percentage
    const hasName = Boolean(profile.first_name?.trim());
    const hasGender = Boolean(profile.gender?.trim());
    const hasBio = Boolean(profile.bio?.trim());
    const hasEmail = Boolean(profile.email?.trim());

    const completedFields = [hasName, hasGender, hasBio, hasEmail].filter(Boolean).length;
    const completionPercentage = Math.round((completedFields / 4) * 100);
    const isProfileReady = hasName && hasGender;

    return (
        <div className="home-container">
            {/* Top Navigation Bar */}
            <nav className="home-navbar">
                <Link to="/home" className="navbar-brand">
                    <div className="brand-icon-box">
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            <path d="M8 10h.01" />
                            <path d="M12 10h.01" />
                            <path d="M16 10h.01" />
                        </svg>
                    </div>
                    <span className="brand-name">ChatFlow</span>
                </Link>

                {/* Navbar navigation tabs */}
                <div className="navbar-nav">
                    <Link to="/home" className="nav-item active">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        <span>Home</span>
                    </Link>

                    <Link to="/browse" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span>Browse Users</span>
                    </Link>

                    <Link to="/requests" className="nav-item nav-with-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                        <span>Requests</span>
                        {stats.pendingReceived > 0 && (
                            <span className="navbar-pill-badge">{stats.pendingReceived}</span>
                        )}
                    </Link>

                    <Link to="/chat" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Chats</span>
                    </Link>
                </div>

                {/* Profile Menu Dropdown */}
                <div className="profile-menu-container" ref={dropdownRef}>
                    <button
                        className={`profile-trigger-btn ${isProfileMenuOpen ? "open" : ""}`}
                        onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                        aria-label="Toggle profile menu"
                    >
                        <div className="avatar-small">{getInitials()}</div>
                        <span className="profile-trigger-name">{profile.username || "Profile"}</span>
                        <svg
                            className={`dropdown-chevron ${isProfileMenuOpen ? "rotated" : ""}`}
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {/* Profile Dropdown Window */}
                    {isProfileMenuOpen && (
                        <div className="profile-dropdown-menu">
                            <div className="dropdown-user-info">
                                <div className="dropdown-avatar">{getInitials()}</div>
                                <div className="dropdown-user-details">
                                    <span className="dropdown-name">{displayName}</span>
                                    <span className="dropdown-username">@{profile.username}</span>
                                    <span className="dropdown-email">{profile.email}</span>
                                </div>
                            </div>

                            <button className="dropdown-item-btn edit-btn" onClick={handleOpenEditModal}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span>Edit Profile</span>
                            </button>

                            <Link to="/requests" className="dropdown-item-btn" onClick={() => setIsProfileMenuOpen(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                                </svg>
                                <span>My Requests</span>
                            </Link>

                            <Link to="/chat" className="dropdown-item-btn" onClick={() => setIsProfileMenuOpen(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>My Chats</span>
                            </Link>

                            <div className="dropdown-divider"></div>

                            <button className="dropdown-item-btn logout" onClick={handleLogout}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </nav>

            {/* Normal Home Dashboard Content */}
            <main className="home-dashboard-main">
                {/* Welcome Hero Banner */}
                <div className="home-hero-banner">
                    <div className="hero-content">
                        <h1>Welcome back, {profile.first_name || profile.username || "Friend"}! 👋</h1>
                        <p>Browse other members, send interest requests, and chat in real-time when matched.</p>
                    </div>

                    <div className="hero-status-pill">
                        <span className="pulse-dot"></span>
                        <span>Online</span>
                    </div>
                </div>

                {/* Profile Completion Card */}
                <section className={`profile-completion-card ${isProfileReady ? "completed" : "incomplete"}`}>
                    <div className="completion-header">
                        <div className="completion-info">
                            <div className="completion-title-row">
                                <h3>{isProfileReady ? "Profile Complete & Discoverable" : "Complete Your Profile"}</h3>
                                <span className="completion-badge">{completionPercentage}%</span>
                            </div>
                            <p>
                                {isProfileReady
                                    ? "Your profile is active and visible to other members on the browsing page."
                                    : "Add your name and gender to be listed on the browsing page and connect with others!"}
                            </p>
                        </div>

                        <button className="completion-action-btn" onClick={handleOpenEditModal}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span>{isProfileReady ? "Update Profile" : "Complete Profile"}</span>
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="progress-bar-track">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${completionPercentage}%` }}
                        ></div>
                    </div>
                </section>

                {/* Dashboard Stats Overview */}
                <section className="stats-overview-grid">
                    <div className="stat-card">
                        <div className="stat-icon members">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <div className="stat-data">
                            <span className="stat-number">{stats.membersCount}</span>
                            <span className="stat-label">Available Members</span>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-icon received">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                            </svg>
                        </div>
                        <div className="stat-data">
                            <span className="stat-number">{stats.receivedCount}</span>
                            <span className="stat-label">Received Requests ({stats.pendingReceived} new)</span>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-icon sent">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </div>
                        <div className="stat-data">
                            <span className="stat-number">{stats.sentCount}</span>
                            <span className="stat-label">Sent Interests</span>
                        </div>
                    </div>
                </section>

                {/* Quick Navigation Hub Cards */}
                <section className="dashboard-hub-section">
                    <h2 className="hub-heading">Explore & Connect</h2>

                    <div className="dashboard-hub-grid">
                        {/* Browse Users */}
                        <div className="hub-box">
                            <div className="hub-box-icon browse">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                            <h3>Browse Members</h3>
                            <p>Discover other users on the platform, view their profile bios and gender, and send interest messages.</p>
                            <Link to="/browse" className="hub-link-btn">
                                <span>Browse Members</span>
                                <span>→</span>
                            </Link>
                        </div>

                        {/* Requests Hub */}
                        <div className="hub-box">
                            <div className="hub-box-icon requests">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                                </svg>
                            </div>
                            <h3>Connection Requests</h3>
                            <p>View received interest messages from other members to accept or reject, or track your sent requests.</p>
                            <Link to="/requests" className="hub-link-btn">
                                <span>Manage Requests</span>
                                <span>→</span>
                            </Link>
                        </div>

                        {/* Live Chat */}
                        <div className="hub-box">
                            <div className="hub-box-icon chat">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </div>
                            <h3>Real-Time Chat</h3>
                            <p>When an interest is mutually accepted, start real-time messaging with your connection.</p>
                            <Link to="/chat" className="hub-link-btn">
                                <span>Open Chats</span>
                                <span>→</span>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            {/* Edit Profile Modal Dialog */}
            {isEditModalOpen && (
                <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
                    <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Profile</h3>
                            <button className="modal-close-btn" onClick={() => setIsEditModalOpen(false)} aria-label="Close modal">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                {message && <div className="modal-alert success">{message}</div>}
                                {error && <div className="modal-alert error">{error}</div>}

                                <div className="form-grid-2">
                                    <div className="edit-input-group">
                                        <label htmlFor="first_name">First Name</label>
                                        <input
                                            id="first_name"
                                            className="edit-input-field"
                                            type="text"
                                            name="first_name"
                                            placeholder="First Name"
                                            value={editForm.first_name}
                                            onChange={handleEditChange}
                                        />
                                    </div>

                                    <div className="edit-input-group">
                                        <label htmlFor="last_name">Last Name</label>
                                        <input
                                            id="last_name"
                                            className="edit-input-field"
                                            type="text"
                                            name="last_name"
                                            placeholder="Last Name"
                                            value={editForm.last_name}
                                            onChange={handleEditChange}
                                        />
                                    </div>
                                </div>

                                <div className="form-grid-2">
                                    <div className="edit-input-group">
                                        <label htmlFor="email">Email Address</label>
                                        <input
                                            id="email"
                                            className="edit-input-field"
                                            type="email"
                                            name="email"
                                            placeholder="email@example.com"
                                            value={editForm.email}
                                            onChange={handleEditChange}
                                            required
                                        />
                                    </div>

                                    <div className="edit-input-group">
                                        <label htmlFor="gender">Gender</label>
                                        <select
                                            id="gender"
                                            className="edit-select-field"
                                            name="gender"
                                            value={editForm.gender}
                                            onChange={handleEditChange}
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                            <option value="prefer_not_to_say">Prefer not to say</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="edit-input-group">
                                    <label htmlFor="bio">About Me / Bio</label>
                                    <textarea
                                        id="bio"
                                        className="edit-textarea"
                                        name="bio"
                                        placeholder="Write about yourself, your hobbies, interests, etc."
                                        value={editForm.bio}
                                        onChange={handleEditChange}
                                        rows="4"
                                    />
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="modal-cancel-btn"
                                    onClick={() => setIsEditModalOpen(false)}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="modal-save-btn" disabled={saving}>
                                    {saving ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Home;
