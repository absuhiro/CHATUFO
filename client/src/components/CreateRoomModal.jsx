import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { api } from "../utils/api";
import { useData } from "../context/DataContext";

export default function CreateRoomModal({ onClose }) {
  const navigate = useNavigate();
  const { loadRooms } = useData();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { room } = await api("/rooms", { method: "POST", body: { name: name.trim(), description } });
      await loadRooms();
      onClose();
      navigate(`/rooms/${room.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create a room"
      subtitle="Rooms are private. Once it's made, invite your friends to join."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={create}>
        <label>
          Room name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus required />
        </label>
        <label>
          Description <span className="muted">(optional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || name.trim().length < 2}>
            {busy ? "Creating..." : "Create room"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
