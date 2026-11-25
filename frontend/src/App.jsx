import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";
import BrowseUsers from "./pages/BrowseUsers";
import Requests from "./pages/Requests";
import Chat from "./pages/Chat";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";

// Route protection component: redirects to /login if token is missing
function ProtectedRoute({ children }) {
    const token = localStorage.getItem("access_token");
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return children;
}

// Admin route protection: redirects to /admin/login if admin token is missing
function AdminProtectedRoute({ children }) {
    const token = localStorage.getItem("admin_access_token");
    if (!token) {
        return <Navigate to="/admin/login" replace />;
    }
    return children;
}

function App() {
    return (
        <Router>
            <Routes>
                {/* Root redirects to /home if authenticated, otherwise to /login */}
                <Route
                    path="/"
                    element={
                        localStorage.getItem("access_token") ? (
                            <Navigate to="/home" replace />
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />
                <Route
                    path="/home"
                    element={
                        <ProtectedRoute>
                            <Home />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/browse"
                    element={
                        <ProtectedRoute>
                            <BrowseUsers />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/requests"
                    element={
                        <ProtectedRoute>
                            <Requests />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/chat"
                    element={
                        <ProtectedRoute>
                            <Chat />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/chat/:partnerId"
                    element={
                        <ProtectedRoute>
                            <Chat />
                        </ProtectedRoute>
                    }
                />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                {/* Admin Portal Routes */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                    path="/admin/dashboard"
                    element={
                        <AdminProtectedRoute>
                            <AdminDashboard />
                        </AdminProtectedRoute>
                    }
                />
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
