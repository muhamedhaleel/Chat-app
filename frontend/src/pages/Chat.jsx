import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { ensureAccessToken } from "../services/api";
import "./Chat.css";

// Empty VITE_WS_URL (Docker/nginx) uses the page host so /ws is proxied.
// A set value (local .env) talks to Daphne directly.
function resolveWsBase() {
    const configured = (import.meta.env.VITE_WS_URL || "").trim();
    if (configured) return configured.replace(/\/$/, "");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
}

const WS_BASE = resolveWsBase();

function Chat() {
    const { partnerId } = useParams();
    const navigate = useNavigate();
    const messagesEndRef = useRef(null);
    const dropdownRef = useRef(null);
    const wsRef = useRef(null);           // active WebSocket instance
    const reconnectTimer = useRef(null);  // reconnection back-off timer
    const heartbeatTimer = useRef(null);  // keep-alive ping interval
    const connectGen = useRef(0);         // ignore a socket opened for a previous partner

    // Current user
    const [currentUser, setCurrentUser] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    // Conversations list (accepted matches)
    const [conversations, setConversations] = useState([]);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [convSearch, setConvSearch] = useState("");

    // Active chat state
    const [activePartnerId, setActivePartnerId] = useState(
        partnerId ? parseInt(partnerId) : null
    );
    const [activePartner, setActivePartner] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [messageInput, setMessageInput] = useState("");
    const [sending, setSending] = useState(false);
    const [wsStatus, setWsStatus] = useState("disconnected"); // connected | connecting | disconnected | error
    const [errorMsg, setErrorMsg] = useState("");
    const [chatMeta, setChatMeta] = useState({
        is_closed: false,
        can_close_chat: false,
        close_available_in_seconds: 0,
    });
    const [closingChat, setClosingChat] = useState(false);

    // Mobile layout
    const [showMobileChat, setShowMobileChat] = useState(Boolean(partnerId));

    // ------------------------------------------------------------------ //
    // Helpers
    // ------------------------------------------------------------------ //

    const scrollToBottom = (behavior = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    const getInitials = (firstName, username) => {
        if (firstName) return firstName[0].toUpperCase();
        return (username?.[0] || "U").toUpperCase();
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return isNaN(d.getTime())
            ? ""
            : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const handleLogout = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    // ------------------------------------------------------------------ //
    // 1. Load current user profile
    // ------------------------------------------------------------------ //

    useEffect(() => {
        api.get("profile/")
            .then((res) => {
                if (res.data?.data) setCurrentUser(res.data.data);
            })
            .catch((err) => {
                if (err.response?.status === 401) navigate("/login");
            });
    }, [navigate]);

    // ------------------------------------------------------------------ //
    // 2. Load conversations list (accepted matches)
    // ------------------------------------------------------------------ //

    const fetchConversations = useCallback(async () => {
        try {
            const res = await api.get("chat/conversations/");
            if (res.data?.data) setConversations(res.data.data);
        } catch (err) {
            if (err.response?.status === 401) navigate("/login");
        } finally {
            setLoadingConversations(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // ------------------------------------------------------------------ //
    // 3. Sync URL param → active partner
    // ------------------------------------------------------------------ //

    useEffect(() => {
        if (partnerId) {
            const pid = parseInt(partnerId);
            setActivePartnerId(pid);
            setShowMobileChat(true);
        }
    }, [partnerId]);

    useEffect(() => {
        if (!activePartnerId || conversations.length === 0) return;
        const found = conversations.find((c) => c.partner_id === activePartnerId);
        if (found) setActivePartner(found);
    }, [activePartnerId, conversations]);

    // ------------------------------------------------------------------ //
    // 4. Load message history (REST) when partner changes
    // ------------------------------------------------------------------ //

    useEffect(() => {
        if (!activePartnerId) {
            setMessages([]);
            return;
        }

        setLoadingMessages(true);
        api.get(`chat/messages/${activePartnerId}/`)
            .then((res) => {
                if (res.data?.data) {
                    setMessages(res.data.data);
                    setTimeout(() => scrollToBottom("auto"), 80);
                }
                if (res.data?.chat_meta) {
                    setChatMeta(res.data.chat_meta);
                }
                setErrorMsg("");
            })
            .catch((err) => {
                if (err.response?.status === 403) {
                    setErrorMsg("You can only chat with users whose interest has been accepted.");
                }
            })
            .finally(() => setLoadingMessages(false));
    }, [activePartnerId]);

    // ------------------------------------------------------------------ //
    // 5. WebSocket lifecycle
    // ------------------------------------------------------------------ //

    const openWebSocket = useCallback(async () => {
        const gen = ++connectGen.current;
        const token = await ensureAccessToken();
        if (gen !== connectGen.current || !token || !activePartnerId) return;

        // Close existing socket before opening a new one
        if (wsRef.current) {
            wsRef.current.onclose = null; // prevent reconnect loop
            wsRef.current.close(1000);
        }
        if (heartbeatTimer.current) {
            clearInterval(heartbeatTimer.current);
            heartbeatTimer.current = null;
        }

        const url = `${WS_BASE}/ws/chat/${activePartnerId}/?token=${encodeURIComponent(token)}`;
        setWsStatus("connecting");

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            if (wsRef.current !== ws) return;
            setWsStatus("connected");
            setErrorMsg("");
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }

            // Re-sync messages on (re)connect so nothing is missed during brief drops
            api.get(`chat/messages/${activePartnerId}/`)
                .then((res) => {
                    if (wsRef.current === ws && res.data?.data) {
                        setMessages(res.data.data);
                    }
                })
                .catch(() => {});

            // Start 20s heartbeat ping to keep connection alive
            heartbeatTimer.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "ping" }));
                }
            }, 20000);
        };

        ws.onmessage = (event) => {
            if (wsRef.current !== ws) return;
            try {
                const data = JSON.parse(event.data);
                if (data.type === "pong") return;
                if (data.type === "chat_closed") {
                    setChatMeta({
                        is_closed: true,
                        can_close_chat: false,
                        close_available_in_seconds: 0,
                    });
                    setConversations((prev) =>
                        prev.map((c) =>
                            c.partner_id === activePartnerId ? { ...c, is_closed: true } : c
                        )
                    );
                    ws.close(1000);
                    return;
                }
                if (data.type === "chat_message" && data.message) {
                    const incoming = data.message;

                    setMessages((prev) => {
                        // Deduplicate by id
                        if (prev.some((m) => m.id === incoming.id)) return prev;
                        return [...prev, incoming];
                    });

                    // Update last message in conversation sidebar
                    setConversations((prev) =>
                        prev.map((c) =>
                            c.partner_id === activePartnerId
                                ? {
                                      ...c,
                                      last_message: incoming.content,
                                      last_message_time: incoming.created_at,
                                  }
                                : c
                        )
                    );
                }
            } catch (e) {
                console.error("WS parse error:", e);
            }
        };

        ws.onerror = () => {
            if (wsRef.current !== ws) return;
            setWsStatus("error");
        };

        ws.onclose = (evt) => {
            if (wsRef.current !== ws) return;
            if (heartbeatTimer.current) {
                clearInterval(heartbeatTimer.current);
                heartbeatTimer.current = null;
            }
            setWsStatus("disconnected");
            // Auto-reconnect unless intentionally closed (code 1000) or auth/permission error
            if (![1000, 4001, 4002, 4003].includes(evt.code)) {
                reconnectTimer.current = setTimeout(() => openWebSocket(), 2500);
            } else if ([4001, 4002, 4003].includes(evt.code)) {
                setErrorMsg(
                    "Chat connection refused. Make sure this interest is accepted."
                );
            }
        };
    }, [activePartnerId]);

    // Open / close WebSocket when partner changes (skip if chat is closed)
    useEffect(() => {
        if (!activePartnerId || chatMeta.is_closed || activePartner?.is_closed) return;
        openWebSocket();

        return () => {
            connectGen.current += 1;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (heartbeatTimer.current) {
                clearInterval(heartbeatTimer.current);
                heartbeatTimer.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close(1000);
                wsRef.current = null;
            }
        };
    }, [activePartnerId, chatMeta.is_closed, activePartner?.is_closed, openWebSocket]);

    // Safety-net sync: if WebSocket is not connected (and chat is not closed), poll messages every 3s
    useEffect(() => {
        if (!activePartnerId || wsStatus === "connected" || chatMeta.is_closed) return;
        const fallbackTimer = setInterval(() => {
            api.get(`chat/messages/${activePartnerId}/`)
                .then((res) => {
                    if (res.data?.data) {
                        setMessages(res.data.data);
                    }
                })
                .catch(() => {});
        }, 3000);
        return () => clearInterval(fallbackTimer);
    }, [activePartnerId, wsStatus]);

    // Auto-scroll when new messages arrive
    useEffect(() => {
        scrollToBottom("smooth");
    }, [messages.length]);

    // ------------------------------------------------------------------ //
    // 6. Send message
    // ------------------------------------------------------------------ //

    const formatRemainingTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.ceil((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const handleCloseChat = async () => {
        if (!activePartnerId || closingChat) return;
        if (!window.confirm("Are you sure you want to close this chat? Neither user will be able to send new messages.")) {
            return;
        }
        setClosingChat(true);
        try {
            const res = await api.post(`chat/close/${activePartnerId}/`);
            setChatMeta(
                res.data?.chat_meta || {
                    is_closed: true,
                    can_close_chat: false,
                    close_available_in_seconds: 0,
                }
            );
            setConversations((prev) =>
                prev.map((c) =>
                    c.partner_id === activePartnerId ? { ...c, is_closed: true } : c
                )
            );
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close(1000);
            }
            setWsStatus("disconnected");
        } catch (err) {
            setErrorMsg(err.response?.data?.message || "Could not close chat.");
        } finally {
            setClosingChat(false);
        }
    };

    const handleSendMessage = (e) => {
        e.preventDefault();
        const content = messageInput.trim();
        if (!content || sending) return;

        // Prefer WebSocket (true real-time). Fall back to REST if WS is down.
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "chat_message", content }));
            setMessageInput("");
        } else {
            // REST fallback
            setSending(true);
            api.post(`chat/messages/${activePartnerId}/`, { content })
                .then((res) => {
                    if (res.data?.data) {
                        setMessages((prev) => [...prev, res.data.data]);
                    }
                    setMessageInput("");
                })
                .catch((err) => alert(err.response?.data?.message || "Failed to send message."))
                .finally(() => setSending(false));
        }
    };

    // ------------------------------------------------------------------ //
    // 7. Select conversation from sidebar
    // ------------------------------------------------------------------ //

    const handleSelectConversation = (c) => {
        setActivePartnerId(c.partner_id);
        setActivePartner(c);
        setShowMobileChat(true);
        navigate(`/chat/${c.partner_id}`, { replace: true });
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ------------------------------------------------------------------ //
    // Derived values
    // ------------------------------------------------------------------ //

    const filteredConversations = conversations.filter((c) => {
        const q = convSearch.toLowerCase();
        return (
            (c.partner_username || "").toLowerCase().includes(q) ||
            (c.partner_first_name || "").toLowerCase().includes(q) ||
            (c.partner_last_name || "").toLowerCase().includes(q)
        );
    });

    const chatPartner = activePartner || (activePartnerId
        ? {
            partner_id: activePartnerId,
            partner_username: "member",
            partner_first_name: "",
            partner_last_name: "",
            partner_gender: "",
        }
        : null);

    const activePartnerName =
        chatPartner?.partner_first_name || chatPartner?.partner_last_name
            ? `${chatPartner.partner_first_name || ""} ${chatPartner.partner_last_name || ""}`.trim()
            : chatPartner?.partner_username || "Partner";

    const wsStatusLabel = {
        connected: "🟢 Connected",
        connecting: "🟡 Connecting...",
        disconnected: "🔴 Reconnecting...",
        error: "🔴 Connection error",
    }[wsStatus] || "";

    // ------------------------------------------------------------------ //
    // Render
    // ------------------------------------------------------------------ //

    return (
        <div className="chat-container">
            {/* ───────────────── Navbar ───────────────── */}
            <nav className="chat-navbar">
                <Link to="/home" className="navbar-brand">
                    <div className="brand-icon-box">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            <path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" />
                        </svg>
                    </div>
                    <span className="brand-name">ChatFlow</span>
                </Link>

                <div className="navbar-nav">
                    {[
                        { to: "/home", label: "Home", icon: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, extra: <polyline points="9 22 9 12 15 12 15 22" /> },
                        { to: "/browse", label: "Browse", icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></> },
                        { to: "/requests", label: "Requests", icon: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></> },
                        { to: "/chat", label: "Chats", icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, active: true },
                    ].map(({ to, label, icon, extra, active }) => (
                        <Link key={to} to={to} className={`nav-item ${active ? "active" : ""}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {icon}{extra}
                            </svg>
                            <span>{label}</span>
                        </Link>
                    ))}
                </div>

                {/* Profile dropdown */}
                <div className="profile-menu-container" ref={dropdownRef}>
                    <button className="profile-trigger-btn" onClick={() => setIsProfileMenuOpen((p) => !p)}>
                        <div className="avatar-small">{getInitials(currentUser?.first_name, currentUser?.username)}</div>
                        <span className="profile-trigger-name">{currentUser?.username || "Profile"}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                    {isProfileMenuOpen && (
                        <div className="profile-dropdown-menu">
                            <Link to="/home" className="dropdown-item-btn" onClick={() => setIsProfileMenuOpen(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
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
                            <div className="dropdown-divider" />
                            <button className="dropdown-item-btn logout" onClick={handleLogout}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </nav>

            {/* ───────────────── Two-column layout ───────────────── */}
            <div className="chat-layout-wrapper">

                {/* LEFT: Conversations Sidebar */}
                <aside className={`conversations-sidebar ${showMobileChat ? "hide-on-mobile" : ""}`}>
                    <div className="sidebar-header">
                        <h2>Messages</h2>
                        <span className="conversations-count">{conversations.length}</span>
                    </div>

                    <div className="sidebar-search-box">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search chats..."
                            value={convSearch}
                            onChange={(e) => setConvSearch(e.target.value)}
                        />
                    </div>

                    <div className="conversations-scroll-list">
                        {loadingConversations ? (
                            <div className="sidebar-loading">
                                <div className="loading-spinner small" />
                                <span>Loading matches...</span>
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="sidebar-empty">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <p>No conversations yet.</p>
                                <span className="empty-hint">
                                    Accept an interest request to start chatting!
                                </span>
                                <Link to="/browse" className="sidebar-browse-link">Browse Members →</Link>
                            </div>
                        ) : (
                            filteredConversations.map((c) => {
                                const name =
                                    c.partner_first_name || c.partner_last_name
                                        ? `${c.partner_first_name || ""} ${c.partner_last_name || ""}`.trim()
                                        : c.partner_username;
                                const isSelected = c.partner_id === activePartnerId;

                                return (
                                    <div
                                        key={c.partner_id}
                                        className={`conversation-item ${isSelected ? "selected" : ""}`}
                                        onClick={() => handleSelectConversation(c)}
                                    >
                                        <div className="conv-avatar">{getInitials(c.partner_first_name, c.partner_username)}</div>
                                        <div className="conv-content">
                                            <div className="conv-top-row">
                                                <span className="conv-name">{name}</span>
                                                <span className="conv-time">{formatTime(c.last_message_time)}</span>
                                            </div>
                                            <div className="conv-bottom-row">
                                                <p className="conv-last-msg">{c.last_message || "Matched! Say hello."}</p>
                                                {c.unread_count > 0 && (
                                                    <span className="conv-unread-badge">{c.unread_count}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* RIGHT: Chat Window */}
                <main className={`chat-window-pane ${!showMobileChat ? "hide-on-mobile" : ""}`}>
                    {activePartnerId && chatPartner ? (
                        <div className="chat-active-screen">
                            {/* Chat Header */}
                            <div className="chat-window-header">
                                <button className="mobile-back-btn" onClick={() => setShowMobileChat(false)}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                </button>

                                <div className="header-partner-avatar">
                                    {getInitials(chatPartner.partner_first_name, chatPartner.partner_username)}
                                </div>

                                <div className="header-partner-info">
                                    <div className="header-name-row">
                                        <h3>{activePartnerName}</h3>
                                        {chatPartner.partner_gender && (
                                            <span className="header-gender-pill">{chatPartner.partner_gender}</span>
                                        )}
                                    </div>
                                    <div className="header-sub-row">
                                        <span className="header-username">@{chatPartner.partner_username}</span>
                                        {!chatMeta.is_closed && (
                                            <span className={`ws-status-pill ${wsStatus}`}>{wsStatusLabel}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="header-close-actions">
                                    {chatMeta.is_closed ? (
                                        <span className="chat-closed-badge">🔒 Chat Closed</span>
                                    ) : (
                                        <button
                                            className="close-chat-btn"
                                            onClick={handleCloseChat}
                                            disabled={closingChat}
                                        >
                                            {closingChat ? "Closing..." : "✕ Close Chat"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Error banner */}
                            {errorMsg && (
                                <div className="chat-error-alert">⚠️ {errorMsg}</div>
                            )}

                            {/* Messages Feed */}
                            <div className="chat-messages-feed">
                                {loadingMessages ? (
                                    <div className="feed-loading">
                                        <div className="loading-spinner" />
                                        <span>Loading conversation...</span>
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="feed-empty-state">
                                        <div className="feed-empty-icon">💬</div>
                                        <h4>Start the conversation</h4>
                                        <p>You and {activePartnerName} are connected. Send your first message!</p>
                                    </div>
                                ) : (
                                    messages.map((msg, i) => {
                                        const isMine = currentUser && msg.sender_id === currentUser.id;
                                        return (
                                            <div key={msg.id ?? i} className={`chat-bubble-row ${isMine ? "outgoing" : "incoming"}`}>
                                                {!isMine && (
                                                    <div className="bubble-avatar">
                                                        {getInitials(chatPartner.partner_first_name, chatPartner.partner_username)}
                                                    </div>
                                                )}
                                                <div className="bubble-container">
                                                    <div className="bubble-content">{msg.content}</div>
                                                    <div className="bubble-meta">
                                                        <span className="bubble-time">{formatTime(msg.created_at)}</span>
                                                        {isMine && (
                                                            <span className="bubble-status">{msg.is_read ? "✓✓" : "✓"}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Bar or Closed Notice */}
                            {chatMeta.is_closed ? (
                                <div className="chat-closed-footer">
                                    🔒 This chat has been closed. No new messages can be sent.
                                </div>
                            ) : (
                                <form className="chat-input-bar" onSubmit={handleSendMessage}>
                                    <input
                                        type="text"
                                        className="message-text-input"
                                        placeholder={`Message ${activePartnerName}...`}
                                        value={messageInput}
                                        onChange={(e) => setMessageInput(e.target.value)}
                                        disabled={sending}
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        className="message-send-btn"
                                        disabled={!messageInput.trim() || sending}
                                        title="Send message (Enter)"
                                    >
                                        {sending ? (
                                            <div className="loading-spinner tiny" />
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                                <line x1="22" y1="2" x2="11" y2="13" />
                                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                            </svg>
                                        )}
                                    </button>
                                </form>
                            )}
                        </div>
                    ) : (
                        /* No conversation selected */
                        <div className="chat-no-selection">
                            <div className="no-selection-card">
                                <div className="no-selection-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                        <path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" />
                                    </svg>
                                </div>
                                <h3>Select a Connection</h3>
                                <p>
                                    Choose an accepted member from the list on the left to start
                                    a real-time WebSocket chat.
                                </p>
                                <div className="no-selection-actions">
                                    <Link to="/requests" className="action-pill primary">View Connection Requests</Link>
                                    <Link to="/browse" className="action-pill secondary">Discover Members</Link>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default Chat;
