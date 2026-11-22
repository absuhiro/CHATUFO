import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import Avatar from "./Avatar";
import SettingsModal from "./SettingsModal";

// Bottom of the sidebar: you, settings, and the log out button
export default function UserBar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="user-bar">
      <Avatar user={user} size={34} online={connected} />
      <div className="person-text">
        <span className="person-name">{user.name}</span>
        <span className="muted small">{connected ? `@${user.username}` : "Reconnecting..."}</span>
      </div>
      <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings">
        ⚙
      </button>
      <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
        ⏻
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
