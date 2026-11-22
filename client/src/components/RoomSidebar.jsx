import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useData } from "../context/DataContext";
import { api } from "../utils/api";
import InviteModal from "./InviteModal";

// Sidebar inside a room: room info, invite button, the chat channel, and Leave
export default function RoomSidebar({ roomId }) {
  const { rooms, loadRooms } = useData();
  const navigate = useNavigate();
  const [inviting, setInviting] = useState(false);
  const room = rooms.find((r) => r.id === roomId);

  const leave = async () => {
    if (!window.confirm(`Leave #${room.name}? You'll need a new invite to come back.`)) return;
    try {
      await api(`/rooms/${roomId}/leave`, { method: "POST" });
      navigate("/");
      loadRooms();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!room) {
    return (
      <div className="side-content">
        <div className="side-header" />
      </div>
    );
  }

  return (
    <div className="side-content">
      <div className="side-header">
        <span className="side-title" title={room.name}>
          {room.name}
        </span>
      </div>
      <div className="side-scroll">
        {room.description && <p className="room-desc">{room.description}</p>}

        <button className="invite-cta" onClick={() => setInviting(true)}>
          <span>👤+</span> Invite friends
        </button>

        <div className="section-label">Text channel</div>
        <NavLink to={`/rooms/${roomId}`} className="side-link active">
          <span className="side-link-icon">#</span>
          <span className="side-link-text">chat</span>
        </NavLink>

        <div className="section-label">Room</div>
        <p className="side-meta">
          {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
        </p>
        <button className="side-link danger" onClick={leave}>
          <span className="side-link-icon">⎋</span>
          <span className="side-link-text">Leave room</span>
        </button>
      </div>

      {inviting && <InviteModal room={room} onClose={() => setInviting(false)} />}
    </div>
  );
}
