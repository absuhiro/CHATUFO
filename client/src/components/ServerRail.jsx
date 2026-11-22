import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useData } from "../context/DataContext";
import CreateRoomModal from "./CreateRoomModal";

// "Web Development Club" -> "WD"
function roomInitials(name = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "#";
}

// The thin column on the far left: Home, your rooms, and the + button (like Discord's server list)
export default function ServerRail() {
  const { rooms, dms, unread, incoming, invites } = useData();
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);

  const onHome = pathname === "/" || pathname.startsWith("/dm/");
  const pending = incoming.length + invites.length;
  const dmUnread = dms.some((d) => unread.has(d.id));

  return (
    <nav className="rail">
      {/* Home is "active" on the Friends page AND in DMs, so it sets its own class */}
      <Link to="/" className={`rail-item home ${onHome ? "active" : ""}`} title="Home">
        <span className="rail-pill" />
        <span className="rail-icon">🛸</span>
        {pending > 0 && <span className="badge">{pending}</span>}
        {!pending && dmUnread && <span className="unread-dot" />}
      </Link>

      <div className="rail-sep" />

      {rooms.map((room) => (
        <NavLink
          key={room.id}
          to={`/rooms/${room.id}`}
          className={({ isActive }) => `rail-item ${isActive ? "active" : ""} ${unread.has(room.id) ? "unread" : ""}`}
          title={room.name}
        >
          <span className="rail-pill" />
          <span className="rail-icon">{roomInitials(room.name)}</span>
        </NavLink>
      ))}

      <button className="rail-item add" title="Create a room" onClick={() => setCreating(true)}>
        <span className="rail-icon">+</span>
      </button>

      {creating && <CreateRoomModal onClose={() => setCreating(false)} />}
    </nav>
  );
}
