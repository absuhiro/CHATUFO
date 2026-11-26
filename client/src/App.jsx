import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import ChatsPage from "./pages/ChatsPage";
import FriendsPage from "./pages/FriendsPage";
import ChatPage from "./pages/ChatPage";

// Only logged in users get through; everyone else goes to /login
function Protected({ children }) {
  const { user, keys, checking } = useAuth();
  if (checking) return <div className="splash">🛸</div>;
  // Logged in AND your keys are unlocked in this browser
  return user && keys ? children : <Navigate to="/login" replace />;
}

// Logged in users skip the login and signup pages
function GuestOnly({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="splash">🛸</div>;
  return user ? <Navigate to="/" replace /> : children;
}

// Old links (/dm/:id, /rooms/:id) now live at /chat/:id
function OldChatLink() {
  const { roomId } = useParams();
  return <Navigate to={`/chat/${roomId}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />

      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="chat/:roomId" element={<ChatPage />} />
        <Route path="dm/:roomId" element={<OldChatLink />} />
        <Route path="rooms/:roomId" element={<OldChatLink />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
