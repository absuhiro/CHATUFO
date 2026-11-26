import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { api } from "../utils/api";
import { useData } from "../context/DataContext";
import { useOnlineIds } from "../hooks/useOnlineIds";

// Pick friends to invite. Each friend shows Invite / Invited / Member.
export default function InviteModal({ room, onClose }) {
  const { friends } = useData();
  const onlineIds = useOnlineIds();
  const [memberIds, setMemberIds] = useState(new Set());
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api(`/rooms/${room.id}`), api(`/rooms/${room.id}/invites`)])
      .then(([details, inv]) => {
        if (cancelled) return;
        setMemberIds(new Set(details.room.members.map((m) => m.id)));
        setInvitedIds(new Set(inv.invitedUserIds));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [room.id]);

  const invite = async (friend) => {
    setError("");
    setBusyId(friend.id);
    try {
      await api(`/rooms/${room.id}/invites`, { method: "POST", body: { userId: friend.id } });
      setInvitedIds((prev) => new Set(prev).add(friend.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = friends.filter((f) => f.name.toLowerCase().includes(q) || (f.username || "").includes(q));

  return (
    <Modal title={`Invite friends to #${room.name}`} onClose={onClose}>
      {friends.length === 0 ? (
        <div className="modal-empty">
          <div className="empty-icon">🛸</div>
          <p>You need friends before you can invite anyone.</p>
          <Link className="btn-primary" to="/friends?add=1" onClick={onClose}>
            Add a friend
          </Link>
        </div>
      ) : (
        <>
          <input
            className="modal-search"
            placeholder="Search your friends"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {error && <div className="form-error">{error}</div>}
          <div className="invite-list">
            {loading && <p className="muted">Loading...</p>}
            {!loading && shown.length === 0 && <p className="muted">No friends match "{search}"</p>}
            {!loading &&
              shown.map((f) => {
                const isMember = memberIds.has(f.id);
                const isInvited = invitedIds.has(f.id);
                return (
                  <div className="invite-row" key={f.id}>
                    <Avatar user={f} size={36} online={onlineIds.has(f.id)} />
                    <div className="person-text">
                      <span className="person-name">{f.name}</span>
                      <span className="muted small">@{f.username}</span>
                    </div>
                    {isMember ? (
                      <span className="tag">Member</span>
                    ) : isInvited ? (
                      <span className="tag success">Invited ✓</span>
                    ) : (
                      <button className="btn-primary small" disabled={busyId === f.id} onClick={() => invite(f)}>
                        Invite
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </Modal>
  );
}
