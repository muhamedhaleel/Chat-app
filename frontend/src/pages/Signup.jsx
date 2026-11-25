import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import "./Signup.css";

function Signup() {
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
    });

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setMessage("");
        setError("");
        setLoading(true);

        try {
            const response = await api.post("signup/", formData);

            setMessage(response.data.message || "Account created successfully!");
            setFormData({
                username: "",
                email: "",
                password: "",
            });
        } catch (err) {
            console.error("Signup error:", err);
            const data = err.response?.data;
            const errors = data?.errors;

            if (errors) {
                if (typeof errors === "object") {
                    const formatted = Object.entries(errors)
                        .map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(", ") : msg}`)
                        .join(" | ");
                    setError(formatted);
                } else {
                    setError(String(errors));
                }
            } else if (data?.message) {
                setError(data.message);
            } else if (err.message === "Network Error" || !err.response) {
                setError("Cannot reach backend server. Please check if Django is running at http://127.0.0.1:8000");
            } else {
                setError(
                    err.response?.statusText ||
                    "Signup failed. Please try again."
                );
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-page-container">
            <div className="signup-card">
                {/* Brand Header */}
                <div className="signup-header">
                    <div className="signup-brand-icon">
                        <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            <path d="M8 10h.01" />
                            <path d="M12 10h.01" />
                            <path d="M16 10h.01" />
                        </svg>
                    </div>
                    <h1>Create Account</h1>
                    <p>Join the conversation and connect with your team</p>
                </div>

                {/* Success Message Alert */}
                {message && (
                    <div className="signup-alert success" role="alert">
                        <svg
                            className="signup-alert-icon"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>{message}</span>
                    </div>
                )}

                {/* Error Message Alert */}
                {error && (
                    <div className="signup-alert error" role="alert">
                        <svg
                            className="signup-alert-icon"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                {/* Form */}
                <form className="signup-form" onSubmit={handleSubmit} noValidate={false}>
                    {/* Username Field */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="username">
                            Username
                        </label>
                        <div className="input-wrapper">
                            <span className="input-icon-left">
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            </span>
                            <input
                                id="username"
                                className="input-field"
                                type="text"
                                name="username"
                                placeholder="Choose a username"
                                value={formData.username}
                                onChange={handleChange}
                                required
                                autoComplete="username"
                            />
                        </div>
                    </div>

                    {/* Email Field */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="email">
                            Email Address
                        </label>
                        <div className="input-wrapper">
                            <span className="input-icon-left">
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                            </span>
                            <input
                                id="email"
                                className="input-field"
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="password">
                            Password
                        </label>
                        <div className="input-wrapper">
                            <span className="input-icon-left">
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </span>
                            <input
                                id="password"
                                className="input-field has-trailing"
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder="Create a secure password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="password-toggle-btn"
                                onClick={() => setShowPassword((prev) => !prev)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? (
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <span className="input-hint">Must be at least 8 characters</span>
                    </div>

                    {/* Submit Button */}
                    <button className="signup-submit-btn" type="submit" disabled={loading}>
                        {loading ? (
                            <>
                                <span className="signup-spinner" aria-hidden="true" />
                                <span>Creating account...</span>
                            </>
                        ) : (
                            <>
                                <span>Sign Up</span>
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                    <polyline points="12 5 19 12 12 19" />
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                {/* Footer Section */}
                <div className="signup-footer">
                    <p className="signup-footer-text">
                        Already have an account?
                        <Link to="/login" className="signup-footer-link">
                            Sign In
                        </Link>
                    </p>
                    <p className="signup-terms-text">
                        By continuing, you agree to our Terms of Service and Privacy Policy.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Signup;
