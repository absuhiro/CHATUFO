import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Modal from "./Modal";
import Avatar from "./Avatar";
import Icon from "./Icon";
import CreateRoomModal from "./CreateRoomModal";
import { useData } from "../context/DataContext";
import { useOnlineIds } from "../hooks/useOnlineIds";

// "New Message": pick a friend to DM, or create a room
export default function NewChatModal({ onClose }) {
  const navigate = useNavigate();
  const { friends, openDm } = useData();
  const onlineIds = useOnlineIds();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  if (creatingRoom) return <CreateRoomModal onClose={onClose} />;

  const startDm = async (friend) => {
    setBusyId(friend.id);
    setError("");
    try {
      const id = await openDm(friend.id);
      onClose();
      navigate(`/chat/${id}`, { state: { from: "/" } });
    } catch (err) {
      setError(err.message);
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = friends.filter((f) => f.name.toLowerCase().includes(q) || (f.username || "").includes(q));

  return (
    <Modal title="New message" onClose={onClose}>
      <button className="option-row" onClick={() => setCreatingRoom(true)}>
        <span className="option-icon">
          <Icon name="hash" size={18} />
        </span>
        <span className="grow">
          <strong>Create a room</strong>
          <span className="muted small block">A private group. Invite friends once it's made.</span>
        </span>
      </button>

      <div className="section-label">Message a friend</div>
      {friends.length === 0 ? (
        <div className="modal-empty">
          <p className="muted">Add friends to start a conversation.</p>
          <Link className="btn-primary small" to="/friends?add=1" onClick={onClose}>
            Add a friend
          </Link>
        </div>
      ) : (
        <>
          <label className="search-box in-modal">
            <Icon name="search" size={16} />
            <input placeholder="Search friends" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="pick-list">
            {shown.length === 0 && <p className="muted small">No friends match "{search}"</p>}
            {shown.map((f) => (
              <button className="pick-row" key={f.id} onClick={() => startDm(f)} disabled={busyId === f.id}>
                <Avatar user={f} size={36} online={onlineIds.has(f.id)} />
                <span className="person-text">
                  <span className="person-name">{f.name}</span>
                  <span className="muted small">@{f.username}</span>
                </span>
                <Icon name="chat" size={17} />
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
