import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import "./BrowseUsers.css";

function BrowseUsers() {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [genderFilter, setGenderFilter] = useState("all");

    // Modal state for viewing another user's profile
    const [selectedUser, setSelectedUser] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);

    // Modal state for sending custom interest message
    const [interestModalUser, setInterestModalUser] = useState(null);
    const [customMessage, setCustomMessage] = useState("");
    const [sendingInterest, setSendingInterest] = useState(false);
    const [interestError, setInterestError] = useState("");
    const [interestSuccess, setInterestSuccess] = useState("");

    // Current logged-in user profile
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const saved = localStorage.getItem("user");
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [toast, setToast] = useState({ msg: "", type: "" });

    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: "", type: "" }), 3500);
    };

    // Fetch users and current user profile
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.append("search", searchQuery);
            if (genderFilter !== "all") params.append("gender", genderFilter);

            const response = await api.get(`browse/?${params.toString()}`);
            if (response.data?.data) {
                setUsers(response.data.data);
            }
        } catch (err) {
            console.error("Failed to fetch users:", err);
            if (err.response?.status === 401) {
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Fetch current user details & pending received interests
        const fetchCurrent = async () => {
            try {
                const profileRes = await api.get("profile/");
                if (profileRes.data?.data) {
                    setCurrentUser(profileRes.data.data);
                    localStorage.setItem("user", JSON.stringify(profileRes.data.data));
                }
            } catch (err) {
                if (err.response?.status === 401) {
                    navigate("/login");
                    return;
                }
            }

            try {
                const receivedRes = await api.get("interests/received/");
                const receivedList = receivedRes.data?.data || [];
                setPendingRequestsCount(receivedList.filter((r) => r.status === "pending").length);
            } catch (err) {
                console.error("Failed to fetch pending requests count:", err);
            }
        };

        fetchCurrent();
        fetchUsers();
    }, [genderFilter, navigate]);

    // Handle search form submit
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        fetchUsers();
    };

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

    const handleOpenProfileModal = (user) => {
        setSelectedUser(user);
        setIsViewModalOpen(true);
    };

    const handleOpenInterestModal = (user) => {
        setInterestModalUser(user);
        setInterestError("");
        setInterestSuccess("");
        setCustomMessage(`Hi ${user.first_name || user.username}, I would like to connect with you!`);
    };

    const handleSendInterestSubmit = async (e) => {
        e.preventDefault();
        if (!interestModalUser) return;
        setSendingInterest(true);
        setInterestError("");
        setInterestSuccess("");

        try {
            const response = await api.post(`interests/send/${interestModalUser.user_id}/`, {
                message: customMessage,
            });

            setInterestSuccess(response.data.message || `Interest sent to ${interestModalUser.username}!`);
            const newInterestId = response.data?.data?.id || null;

            // Update user in local state to reflect sent status
            setUsers((prev) =>
                prev.map((u) =>
                    u.user_id === interestModalUser.user_id
                        ? { ...u, interest_id: newInterestId, interest_direction: "sent", interest_status: "pending" }
                        : u
                )
            );

            setTimeout(() => {
                setInterestModalUser(null);
                setIsViewModalOpen(false);
                showToast(response.data.message || "Interest sent successfully!", "success");
            }, 1200);
        } catch (err) {
            setInterestError(err.response?.data?.message || "Failed to send interest request.");
        } finally {
            setSendingInterest(false);
        }
    };

    const handleCancelInterest = async (user) => {
        if (!user.interest_id) return;
        try {
            const response = await api.delete(`interests/${user.interest_id}/cancel/`);
            setUsers((prev) =>
                prev.map((u) =>
                    u.user_id === user.user_id
                        ? { ...u, interest_id: null, interest_direction: null, interest_status: null }
                        : u
                )
            );
            showToast(response.data.message || "Interest request cancelled.", "success");
        } catch (err) {
            showToast(err.response?.data?.message || "Failed to cancel request.", "error");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const getInitials = (firstName, username) => {
        if (firstName) return firstName[0].toUpperCase();
        return (username?.[0] || "U").toUpperCase();
    };

    const formatGender = (gender) => {
        if (!gender) return "Not specified";
        if (gender === "male") return "Male";
        if (gender === "female") return "Female";
        if (gender === "other") return "Other";
        return gender;
    };

    // Check if current user profile is completed (requires first_name AND gender — not just username)
    const isCurrentUserComplete = Boolean(
        currentUser?.first_name?.trim() &&
        currentUser?.gender?.trim()
    );

    return (
        <div className="browse-container">
            {/* Toast notification */}
            {toast.msg && (
                <div className={`browse-toast ${toast.type}`}>
                    {toast.type === "success" ? "✓" : "✕"} {toast.msg}
                </div>
            )}
            {/* Top Navbar */}
            <nav className="browse-navbar">
                <Link to="/home" className="navbar-brand">
                    <div className="brand-icon-box">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            <path d="M8 10h.01" />
                            <path d="M12 10h.01" />
                            <path d="M16 10h.01" />
                        </svg>
                    </div>
                    <span className="brand-name">ChatFlow</span>
                </Link>

                <div className="navbar-nav">
                    <Link to="/home" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        <span>Home</span>
                    </Link>

                    <Link to="/browse" className="nav-item active">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span>Browse Users</span>
                    </Link>

                    <Link to="/requests" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                        <span>Requests</span>
                        {pendingRequestsCount > 0 && (
                            <span className="navbar-pill-badge">{pendingRequestsCount}</span>
                        )}
                    </Link>

                    <Link to="/chat" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Chats</span>
                    </Link>
                </div>

                {/* Profile menu dropdown */}
                <div className="profile-menu-container" ref={dropdownRef}>
                    <button
                        className="profile-trigger-btn"
                        onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                    >
                        <div className="avatar-small">
                            {getInitials(currentUser?.first_name, currentUser?.username)}
                        </div>
                        <span className="profile-trigger-name">{currentUser?.username || "Profile"}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {isProfileMenuOpen && (
                        <div className="profile-dropdown-menu">
                            <Link to="/home" className="dropdown-item-btn" onClick={() => setIsProfileMenuOpen(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                <span>My Profile</span>
                            </Link>

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

            {/* Main Content Area */}
            <main className="browse-main">
                {/* Profile Completion Warning if incomplete */}
                {!isCurrentUserComplete && currentUser && !bannerDismissed && (
                    <div className="profile-incomplete-banner">
                        <div className="incomplete-text">
                            <strong>⚠️ Complete your profile:</strong> You have not added your name and gender yet.
                            Completed profiles get more interest requests and better visibility!
                        </div>
                        <div className="banner-actions-cluster">
                            <Link to="/home" className="incomplete-action-link">
                                Complete Now →
                            </Link>
                            <button
                                className="banner-dismiss-btn"
                                onClick={() => setBannerDismissed(true)}
                                aria-label="Dismiss banner"
                                title="Dismiss notification"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* Search & Filter Header Banner */}
                <div className="browse-header-banner">
                    <div className="browse-header-info">
                        <h1>Discover Members</h1>
                        <p>Browse user profiles, view their details, and send an interest message to connect!</p>
                    </div>

                    {/* Search Form */}
                    <form className="browse-search-bar" onSubmit={handleSearchSubmit}>
                        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search by username or name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <button type="submit" className="search-submit-btn">Search</button>
                    </form>
                </div>

                {/* Filter Pills */}
                <div className="gender-filters-row">
                    <span className="filter-label">Filter by Gender:</span>
                    {["all", "male", "female", "other"].map((gender) => (
                        <button
                            key={gender}
                            className={`filter-pill ${genderFilter === gender ? "active" : ""}`}
                            onClick={() => setGenderFilter(gender)}
                        >
                            {gender === "all" ? "All Members" : gender.charAt(0).toUpperCase() + gender.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Users Grid */}
                {loading ? (
                    <div className="browse-loading-box">
                        <div className="loading-spinner"></div>
                        <p>Finding members...</p>
                    </div>
                ) : users.length === 0 ? (
                    <div className="no-users-box">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                        <h3>No members found</h3>
                        <p>Try clearing your search query or gender filter to view all users.</p>
                        <button
                            className="clear-filters-btn"
                            onClick={() => {
                                setSearchQuery("");
                                setGenderFilter("all");
                            }}
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <div className="users-cards-grid">
                        {users.map((user) => {
                            const fullName = user.first_name || user.last_name
                                ? `${user.first_name} ${user.last_name}`.trim()
                                : user.username;
                            const isInterestSent = user.interest_direction === "sent" && user.interest_status === "pending";
                            const isConnected = user.interest_status === "accepted";
                            const isReceivedPending = user.interest_direction === "received" && user.interest_status === "pending";

                            return (
                                <div key={user.user_id} className="user-member-card">
                                    <div className="member-card-header">
                                        <div className="member-avatar">
                                            {getInitials(user.first_name, user.username)}
                                        </div>
                                        <div className="member-info">
                                            <h3 className="member-name">{fullName}</h3>
                                            <span className="member-username">@{user.username}</span>
                                        </div>
                                    </div>

                                    <div className="member-meta-tags">
                                        <span className="member-gender-tag">
                                            {formatGender(user.gender)}
                                        </span>
                                        {user.is_profile_completed && (
                                            <span className="verified-badge">✓ Profile Complete</span>
                                        )}
                                    </div>

                                    <div className="member-bio-preview">
                                        {user.bio ? (
                                            <p>&ldquo;{user.bio}&rdquo;</p>
                                        ) : (
                                            <p className="no-bio">No bio available</p>
                                        )}
                                    </div>

                                    <div className="member-card-actions">
                                        <button
                                            className="view-profile-btn"
                                            onClick={() => handleOpenProfileModal(user)}
                                        >
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                            <span>View Profile</span>
                                        </button>

                                        {isConnected ? (
                                            <Link to={`/chat/${user.user_id}`} className="chat-now-action-btn">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                                </svg>
                                                <span>💬 Chat Now</span>
                                            </Link>
                                        ) : isInterestSent ? (
                                            <div className="sent-actions-group">
                                                <span className="interest-status-pill sent">
                                                    Interest Sent
                                                </span>
                                                {user.interest_id && (
                                                    <button
                                                        className="cancel-interest-mini-btn"
                                                        onClick={() => handleCancelInterest(user)}
                                                        title="Cancel sent interest request"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        ) : isReceivedPending ? (
                                            <Link to="/requests" className="interest-status-pill respond">
                                                Respond in Requests →
                                            </Link>
                                        ) : (
                                            <button
                                                className="send-interest-btn"
                                                onClick={() => handleOpenInterestModal(user)}
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                                </svg>
                                                <span>Send Interest</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* View Full Profile Modal */}
            {isViewModalOpen && selectedUser && (
                <div className="modal-overlay" onClick={() => setIsViewModalOpen(false)}>
                    <div className="view-user-modal-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="view-modal-header">
                            <span className="view-modal-title">Member Profile</span>
                            <button
                                className="modal-close-btn"
                                onClick={() => setIsViewModalOpen(false)}
                                aria-label="Close"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <div className="view-modal-hero">
                            <div className="view-modal-avatar">
                                {getInitials(selectedUser.first_name, selectedUser.username)}
                            </div>
                            <h2>
                                {selectedUser.first_name || selectedUser.last_name
                                    ? `${selectedUser.first_name} ${selectedUser.last_name}`.trim()
                                    : selectedUser.username}
                            </h2>
                            <p className="view-modal-username">@{selectedUser.username}</p>
                        </div>

                        <div className="view-modal-badges">
                            <div className="view-badge">
                                <span>Gender:</span>
                                <strong>{formatGender(selectedUser.gender)}</strong>
                            </div>
                            <div className="view-badge">
                                <span>Member Since:</span>
                                <strong>
                                    {selectedUser.date_joined
                                        ? new Date(selectedUser.date_joined).toLocaleDateString()
                                        : "Recent"}
                                </strong>
                            </div>
                        </div>

                        <div className="view-modal-bio-box">
                            <h4>About</h4>
                            {selectedUser.bio ? (
                                <p>&ldquo;{selectedUser.bio}&rdquo;</p>
                            ) : (
                                <p className="no-bio">This user has not written a bio yet.</p>
                            )}
                        </div>

                        <div className="view-modal-footer">
                            {selectedUser.interest_status === "accepted" ? (
                                <Link
                                    to={`/chat/${selectedUser.user_id}`}
                                    className="view-modal-chat-btn"
                                >
                                    💬 Open Real-Time Chat
                                </Link>
                            ) : (
                                <button
                                    className="view-modal-interest-btn"
                                    onClick={() => {
                                        setIsViewModalOpen(false);
                                        handleOpenInterestModal(selectedUser);
                                    }}
                                    disabled={selectedUser.interest_status === "pending"}
                                >
                                    {selectedUser.interest_status === "pending"
                                        ? "Interest Already Sent"
                                        : "Send Interest Message"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Send Custom Interest Message Modal */}
            {interestModalUser && (
                <div className="modal-overlay" onClick={() => setInterestModalUser(null)}>
                    <div className="interest-compose-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Connect with {interestModalUser.first_name || interestModalUser.username}</h3>
                            <button
                                className="modal-close-btn"
                                onClick={() => setInterestModalUser(null)}
                                aria-label="Close"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSendInterestSubmit}>
                            <div className="modal-body">
                                {interestSuccess && (
                                    <div className="modal-alert success">{interestSuccess}</div>
                                )}
                                {interestError && (
                                    <div className="modal-alert error">{interestError}</div>
                                )}
                                <p className="interest-compose-hint">
                                    Write a short interest note to introduce yourself. If they accept, you will both be able to chat in real-time!
                                </p>

                                <div className="edit-input-group">
                                    <label htmlFor="interest-msg">Your Message</label>
                                    <textarea
                                        id="interest-msg"
                                        className="edit-textarea"
                                        rows="3"
                                        value={customMessage}
                                        onChange={(e) => setCustomMessage(e.target.value)}
                                        placeholder="Write a message..."
                                        required
                                    />
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="modal-cancel-btn"
                                    onClick={() => setInterestModalUser(null)}
                                    disabled={sendingInterest}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="modal-save-btn interest-send-gradient"
                                    disabled={sendingInterest}
                                >
                                    {sendingInterest ? "Sending Request..." : "Send Interest"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BrowseUsers;
