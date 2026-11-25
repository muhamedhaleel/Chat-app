import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import "./Requests.css";

function Requests() {
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    const [activeTab, setActiveTab] = useState("received"); // "received" or "sent"
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [alertMessage, setAlertMessage] = useState("");

    // Current user for navbar
    const [currentUser, setCurrentUser] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const [receivedRes, sentRes] = await Promise.all([
                api.get("interests/received/"),
                api.get("interests/sent/"),
            ]);

            if (receivedRes.data?.data) {
                setReceivedRequests(receivedRes.data.data);
            }
            if (sentRes.data?.data) {
                setSentRequests(sentRes.data.data);
            }
        } catch (err) {
            console.error("Failed to load requests:", err);
            if (err.response?.status === 401) {
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchCurrent = async () => {
            try {
                const res = await api.get("profile/");
                if (res.data?.data) setCurrentUser(res.data.data);
            } catch (err) {
                if (err.response?.status === 401) navigate("/login");
            }
        };

        fetchCurrent();
        fetchRequests();
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

    const handleRespond = async (interestId, action) => {
        setProcessingId(interestId);
        try {
            const response = await api.post(`interests/${interestId}/respond/`, { action });
            setAlertMessage(response.data.message || `Request ${action}ed!`);

            // Update local state
            setReceivedRequests((prev) =>
                prev.map((r) =>
                    r.id === interestId ? { ...r, status: action === "accept" ? "accepted" : "rejected" } : r
                )
            );
        } catch (err) {
            alert(err.response?.data?.message || `Failed to ${action} request.`);
        } finally {
            setProcessingId(null);
        }
    };

    const handleCancelSent = async (interestId) => {
        setProcessingId(interestId);
        try {
            const response = await api.delete(`interests/${interestId}/cancel/`);
            setAlertMessage(response.data.message || "Sent interest request cancelled.");
            setSentRequests((prev) => prev.filter((r) => r.id !== interestId));
        } catch (err) {
            alert(err.response?.data?.message || "Failed to cancel request.");
        } finally {
            setProcessingId(null);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    const getInitials = (name, username) => {
        if (name) return name[0].toUpperCase();
        return (username?.[0] || "U").toUpperCase();
    };

    const formatGender = (gender) => {
        if (!gender) return "Not specified";
        if (gender === "male") return "Male";
        if (gender === "female") return "Female";
        if (gender === "other") return "Other";
        return gender;
    };

    const pendingCount = receivedRequests.filter((r) => r.status === "pending").length;

    return (
        <div className="requests-container">
            {/* Navbar */}
            <nav className="requests-navbar">
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

                    <Link to="/browse" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span>Browse Users</span>
                    </Link>

                    <Link to="/requests" className="nav-item active">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                        <span>Requests</span>
                        {pendingCount > 0 && <span className="nav-badge-count">{pendingCount}</span>}
                    </Link>

                    <Link to="/chat" className="nav-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Chats</span>
                    </Link>
                </div>

                {/* Profile menu */}
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

            {/* Main Requests Content */}
            <main className="requests-main">
                {/* Header Banner */}
                <div className="requests-header-banner">
                    <div className="header-info">
                        <h1>Interest Requests</h1>
                        <p>Manage incoming requests from other members or track the interest messages you have sent.</p>
                    </div>

                    {/* Tab Navigation */}
                    <div className="requests-tabs-row">
                        <button
                            className={`req-tab-btn ${activeTab === "received" ? "active" : ""}`}
                            onClick={() => {
                                setActiveTab("received");
                                setAlertMessage("");
                            }}
                        >
                            <span>Received Requests</span>
                            {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
                        </button>

                        <button
                            className={`req-tab-btn ${activeTab === "sent" ? "active" : ""}`}
                            onClick={() => {
                                setActiveTab("sent");
                                setAlertMessage("");
                            }}
                        >
                            <span>Sent Requests ({sentRequests.length})</span>
                        </button>
                    </div>
                </div>

                {alertMessage && (
                    <div className="requests-alert-banner">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{alertMessage}</span>
                    </div>
                )}

                {/* Tab 1: Received Requests */}
                {activeTab === "received" && (
                    <div className="requests-list-wrapper">
                        {loading ? (
                            <div className="loading-box">
                                <div className="loading-spinner"></div>
                                <p>Loading received requests...</p>
                            </div>
                        ) : receivedRequests.length === 0 ? (
                            <div className="empty-requests-card">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
                                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                                </svg>
                                <h3>No Received Requests Yet</h3>
                                <p>When other members discover your profile and send an interest message, it will appear here!</p>
                                <Link to="/browse" className="empty-action-btn">
                                    Browse Active Members
                                </Link>
                            </div>
                        ) : (
                            <div className="requests-cards-grid">
                                {receivedRequests.map((req) => {
                                    const senderName = req.sender_first_name || req.sender_last_name
                                        ? `${req.sender_first_name} ${req.sender_last_name}`.trim()
                                        : req.sender_username;
                                    const isProcessing = processingId === req.id;

                                    return (
                                        <div key={req.id} className={`request-item-card ${req.status}`}>
                                            <div className="card-top-row">
                                                <div className="sender-avatar">
                                                    {getInitials(req.sender_first_name, req.sender_username)}
                                                </div>
                                                <div className="sender-info">
                                                    <h3 className="sender-name">{senderName}</h3>
                                                    <span className="sender-username">@{req.sender_username}</span>
                                                </div>
                                                <span className={`status-badge ${req.status}`}>
                                                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                                </span>
                                            </div>

                                            <div className="sender-badges">
                                                <span className="info-tag">Gender: {formatGender(req.sender_gender)}</span>
                                                <span className="info-tag date">
                                                    {new Date(req.created_at).toLocaleDateString()}
                                                </span>
                                            </div>

                                            <div className="message-quote-box">
                                                <p>&ldquo;{req.message}&rdquo;</p>
                                            </div>

                                            {/* Action Buttons */}
                                            {req.status === "pending" ? (
                                                <div className="respond-actions-row">
                                                    <button
                                                        className="accept-btn"
                                                        onClick={() => handleRespond(req.id, "accept")}
                                                        disabled={isProcessing}
                                                    >
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                        <span>Accept Request</span>
                                                    </button>
                                                    <button
                                                        className="reject-btn"
                                                        onClick={() => handleRespond(req.id, "reject")}
                                                        disabled={isProcessing}
                                                    >
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <line x1="18" y1="6" x2="6" y2="18" />
                                                            <line x1="6" y1="6" x2="18" y2="18" />
                                                        </svg>
                                                        <span>Reject</span>
                                                    </button>
                                                </div>
                                            ) : req.status === "accepted" ? (
                                                <div className="status-note accepted-action-box">
                                                    <span>Mutually connected! You can now chat in real-time.</span>
                                                    <Link to={`/chat/${req.sender_id}`} className="req-chat-btn">
                                                        💬 Chat with {senderName}
                                                    </Link>
                                                </div>
                                            ) : req.status === "closed" ? (
                                                <div className="status-note closed">
                                                    <span>🔒 Chat closed.</span>
                                                </div>
                                            ) : (
                                                <div className="status-note rejected">
                                                    <span>Request was rejected.</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Tab 2: Sent Requests */}
                {activeTab === "sent" && (
                    <div className="requests-list-wrapper">
                        {loading ? (
                            <div className="loading-box">
                                <div className="loading-spinner"></div>
                                <p>Loading sent requests...</p>
                            </div>
                        ) : sentRequests.length === 0 ? (
                            <div className="empty-requests-card">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                                <h3>No Sent Requests Yet</h3>
                                <p>You haven&apos;t sent any interest requests yet. Browse other members and make a connection!</p>
                                <Link to="/browse" className="empty-action-btn">
                                    Browse Members Now
                                </Link>
                            </div>
                        ) : (
                            <div className="requests-cards-grid">
                                {sentRequests.map((req) => {
                                    const receiverName = req.receiver_first_name || req.receiver_last_name
                                        ? `${req.receiver_first_name} ${req.receiver_last_name}`.trim()
                                        : req.receiver_username;

                                    return (
                                        <div key={req.id} className={`request-item-card ${req.status}`}>
                                            <div className="card-top-row">
                                                <div className="sender-avatar">
                                                    {getInitials(req.receiver_first_name, req.receiver_username)}
                                                </div>
                                                <div className="sender-info">
                                                    <h3 className="sender-name">{receiverName}</h3>
                                                    <span className="sender-username">@{req.receiver_username}</span>
                                                </div>
                                                <span className={`status-badge ${req.status}`}>
                                                    {req.status === "pending"
                                                        ? "Pending"
                                                        : req.status === "accepted"
                                                        ? "Accepted"
                                                        : req.status === "closed"
                                                        ? "Closed"
                                                        : "Declined"}
                                                </span>
                                            </div>

                                            <div className="sender-badges">
                                                <span className="info-tag">Gender: {formatGender(req.receiver_gender)}</span>
                                                <span className="info-tag date">
                                                    Sent {new Date(req.created_at).toLocaleDateString()}
                                                </span>
                                            </div>

                                            <div className="message-quote-box">
                                                <p>&ldquo;{req.message}&rdquo;</p>
                                            </div>

                                            {req.status === "accepted" && (
                                                <div className="status-note accepted-action-box">
                                                    <span>🎉 {receiverName} accepted your interest! Connection active.</span>
                                                    <Link to={`/chat/${req.receiver_id}`} className="req-chat-btn">
                                                        💬 Chat with {receiverName}
                                                    </Link>
                                                </div>
                                            )}
                                            {req.status === "pending" && (
                                                <div className="status-note pending-with-cancel">
                                                    <span>Waiting for {receiverName} to review your interest request.</span>
                                                    <button
                                                        className="cancel-sent-btn"
                                                        onClick={() => handleCancelSent(req.id)}
                                                        disabled={processingId === req.id}
                                                    >
                                                        {processingId === req.id ? "Cancelling..." : "Cancel Request"}
                                                    </button>
                                                </div>
                                            )}
                                            {req.status === "rejected" && (
                                                <div className="status-note rejected">
                                                    <span>{receiverName} declined this request.</span>
                                                </div>
                                            )}
                                            {req.status === "closed" && (
                                                <div className="status-note closed">
                                                    <span>🔒 Chat closed.</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

export default Requests;
