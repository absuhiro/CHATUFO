import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useSocket } from "../context/SocketContext";
import Avatar from "./Avatar";
import Icon from "./Icon";
import SettingsModal from "./SettingsModal";

// The slim column on the far left: Dashboard, Chats, Friends, Settings, and you at the bottom.
// On phones it turns into a bottom tab bar (see index.css).
export default function NavRail() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { unreadChats, incoming, invites } = useData();
  const { pathname } = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const onChats = pathname.startsWith("/chats") || pathname.startsWith("/chat/");
  const pending = incoming.length + invites.length;

  // Close the "you" menu when clicking anywhere else
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-top">
        <NavLink to="/" end className={({ isActive }) => `rail-btn ${isActive ? "active" : ""}`} title="Dashboard" aria-label="Dashboard">
          <Icon name="grid" size={22} />
        </NavLink>
        <NavLink to="/chats" className={`rail-btn ${onChats ? "active" : ""}`} title="Chats" aria-label="Chats">
          <Icon name="chat" size={22} />
          {unreadChats > 0 && <span className="rail-badge">{unreadChats > 9 ? "9+" : unreadChats}</span>}
        </NavLink>
        <NavLink to="/friends" className={({ isActive }) => `rail-btn ${isActive ? "active" : ""}`} title="Friends" aria-label="Friends">
          <Icon name="users" size={22} />
          {pending > 0 && <span className="rail-badge">{pending}</span>}
        </NavLink>
        <button className="rail-btn" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" size={22} />
        </button>
      </div>

      <div className="rail-me" ref={menuRef}>
        <button className="rail-avatar" onClick={() => setMenuOpen((v) => !v)} title={user.name} aria-label="Your account">
          <Avatar user={user} size={40} online={connected} />
        </button>
        {menuOpen && (
          <div className="popover rail-menu">
            <div className="popover-head">
              <strong>{user.name}</strong>
              <span className="muted small">{connected ? `@${user.username}` : "Reconnecting..."}</span>
            </div>
            <button
              className="popover-item"
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
            >
              <Icon name="settings" size={16} /> Settings
            </button>
            <button className="popover-item danger" onClick={logout}>
              <Icon name="logout" size={16} /> Log out
            </button>
          </div>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
}
