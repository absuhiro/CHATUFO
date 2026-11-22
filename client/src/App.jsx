import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AppLayout from "./layout/AppLayout";
import FriendsPage from "./pages/FriendsPage";
import ChatPage from "./pages/ChatPage";

// Only logged in users get through; everyone else goes to /login
function Protected({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="splash">🛸</div>;
  return user ? children : <Navigate to="/login" replace />;
}

// Logged in users skip the login and signup pages
function GuestOnly({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="splash">🛸</div>;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />

      {/* Everything inside the Discord-style frame */}
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<FriendsPage />} />
        <Route path="dm/:roomId" element={<ChatPage kind="dm" />} />
        <Route path="rooms/:roomId" element={<ChatPage kind="group" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
