import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useSocket } from "../context/SocketContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import { useMinuteTick } from "../hooks/useMinuteTick";
import { shortTime } from "../utils/time";
import { api } from "../utils/api";
import Avatar, { RoomAvatar } from "../components/Avatar";
import Icon from "../components/Icon";
import NewChatModal from "../components/NewChatModal";
import AddFriendModal from "../components/AddFriendModal";
import CreateRoomModal from "../components/CreateRoomModal";
import SettingsModal from "../components/SettingsModal";

const MAX_ONLINE_SHOWN = 11; // the 12th spot becomes "+N"

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// The home screen: a "bento" grid of cards, each a different size.
// Clicking any chat opens the full chat view instead of squeezing it in here.
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { connected } = useSocket();
  const { conversations, friends, incoming, invites, loaded, openDm, loadConversations } = useData();
  const onlineIds = useOnlineIds();
  const [modal, setModal] = useState(null); // "new" | "add" | "room" | "settings"
  const [busy, setBusy] = useState(null);
  useMinuteTick();

  const openChat = (id) => navigate(`/chat/${id}`, { state: { from: "/" } });

  // Runs an action, disabling its buttons meanwhile, and shows errors
  const run = async (id, fn) => {
    setBusy(id);
    try {
      await fn();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  };

  const recent = conversations.slice(0, 5);
  const groups = conversations.filter((c) => c.type === "group");
  const onlineFriends = friends.filter((f) => onlineIds.has(f.id));
  const extraOnline = onlineFriends.length - MAX_ONLINE_SHOWN;
  const pending = [
    ...invites.map((inv) => ({ kind: "invite", id: inv.id, inv })),
    ...incoming.map((req) => ({ kind: "friend", id: req.id, req })),
  ];
  const unreadTotal = conversations.reduce((n, c) => n + (c.unreadCount || 0), 0);

  const previewOf = (c) => {
    const p = c.preview;
    if (!p) return c.type === "dm" ? "Say hi 👋" : "No messages yet";
    if (c.unreadCount > 1 && !p.fromMe) return `${c.unreadCount} new messages`;
    if (p.system || (c.type === "dm" && !p.fromMe)) return p.text;
    return `${p.who}: ${p.text}`;
  };

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h1>
            {greeting()}, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="muted">
            {unreadTotal > 0
              ? `You have ${unreadTotal} unread ${unreadTotal === 1 ? "message" : "messages"}.`
              : "You're all caught up."}
          </p>
        </div>
        <button className="btn-primary pill" onClick={() => setModal("new")}>
          <Icon name="pencil" size={17} /> New message
        </button>
      </header>

      <div className="bento">
        {/* ---------- Recent chats (big) ---------- */}
        <section className="card card-recent">
          <div className="card-head">
            <h2>Recent Chats</h2>
            <Link className="see-all" to="/chats">
              See all <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          {!loaded ? (
            <p className="card-empty">Loading...</p>
          ) : recent.length === 0 ? (
            <div className="card-empty">
              <p>No chats yet.</p>
              <button className="btn-primary small" onClick={() => setModal("new")}>
                Start a chat
              </button>
            </div>
          ) : (
            <div className="card-list">
              {recent.map((c) => (
                <button key={c.id} className={`row ${c.unreadCount ? "unread" : ""}`} onClick={() => openChat(c.id)}>
                  {c.type === "dm" ? (
                    <Avatar user={c.user} size={46} online={onlineIds.has(c.user?.id)} />
                  ) : (
                    <RoomAvatar name={c.name} size={46} />
                  )}
                  <span className="row-text">
                    <span className="row-name">{c.type === "dm" ? c.user?.name : c.name}</span>
                    <span className="row-sub">{previewOf(c)}</span>
                  </span>
                  <span className="row-end">
                    <span className="row-time">{shortTime(c.activityAt)}</span>
                    {c.unreadCount > 0 && <span className="count-badge">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Online friends ---------- */}
        <section className="card card-online">
          <div className="card-head">
            <h2>Online Friends</h2>
            <span className="online-count">
              <span className="dot" /> {onlineFriends.length}
            </span>
          </div>
          {onlineFriends.length === 0 ? (
            <div className="card-empty">
              <p>{friends.length ? "None of your friends are online right now." : "Add friends to see who's around."}</p>
              {!friends.length && (
                <button className="btn-primary small" onClick={() => setModal("add")}>
                  Add a friend
                </button>
              )}
            </div>
          ) : (
            <div className="face-grid">
              {onlineFriends.slice(0, MAX_ONLINE_SHOWN + (extraOnline === 1 ? 1 : 0)).map((f) => (
                <button
                  key={f.id}
                  className="face"
                  title={`Message ${f.name}`}
                  disabled={busy === f.id}
                  onClick={() => run(f.id, async () => openChat(await openDm(f.id)))}
                >
                  <Avatar user={f} size={52} online />
                  <span className="face-name">{f.name.split(" ")[0]}</span>
                </button>
              ))}
              {extraOnline > 1 && (
                <Link className="face more" to="/friends" title="See everyone online">
                  <span className="face-more">+{extraOnline}</span>
                  <span className="face-name">more</span>
                </Link>
              )}
            </div>
          )}
        </section>

        {/* ---------- Groups ---------- */}
        <section className="card card-groups">
          <div className="card-head">
            <h2>Groups</h2>
            <span className="head-actions">
              <button className="ghost-icon" title="Create a room" aria-label="Create a room" onClick={() => setModal("room")}>
                <Icon name="plus" size={18} />
              </button>
              <Link className="see-all" to="/chats?filter=group">
                See all <Icon name="arrowRight" size={15} />
              </Link>
            </span>
          </div>
          {groups.length === 0 ? (
            <div className="card-empty">
              <p>No rooms yet. Make one and invite your friends.</p>
              <button className="btn-primary small" onClick={() => setModal("room")}>
                Create a room
              </button>
            </div>
          ) : (
            <div className="card-list">
              {groups.slice(0, 3).map((g) => (
                <button key={g.id} className={`row ${g.unreadCount ? "unread" : ""}`} onClick={() => openChat(g.id)}>
                  <RoomAvatar name={g.name} size={46} />
                  <span className="row-text">
                    <span className="row-name">{g.name}</span>
                    <span className="row-sub">
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    </span>
                  </span>
                  {g.unreadCount > 0 && <span className="count-badge">{g.unreadCount > 99 ? "99+" : g.unreadCount}</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Pending requests ---------- */}
        <section className="card card-pending">
          <div className="card-head">
            <h2>Pending Requests</h2>
            {pending.length > 0 && <span className="muted">{pending.length}</span>}
          </div>
          {pending.length === 0 ? (
            <div className="card-empty">
              <Icon name="inbox" size={26} />
              <p>No requests right now.</p>
              <button className="btn-ghost small" onClick={() => setModal("add")}>
                <Icon name="userPlus" size={15} /> Add a friend
              </button>
            </div>
          ) : (
            <div className="card-list">
              {pending.slice(0, 4).map((p) =>
                p.kind === "friend" ? (
                  <div className="row static" key={p.id}>
                    <Avatar user={p.req.user} size={42} />
                    <span className="row-text">
                      <span className="row-name">{p.req.user.name}</span>
                      <span className="row-sub">Wants to be your friend</span>
                    </span>
                    <span className="yes-no">
                      <button
                        className="round-yes"
                        title="Accept"
                        aria-label={`Accept ${p.req.user.name}`}
                        disabled={busy === p.id}
                        onClick={() => run(p.id, () => api(`/friends/requests/${p.id}/accept`, { method: "POST" }))}
                      >
                        <Icon name="check" size={16} strokeWidth={2.4} />
                      </button>
                      <button
                        className="round-no"
                        title="Decline"
                        aria-label={`Decline ${p.req.user.name}`}
                        disabled={busy === p.id}
                        onClick={() => run(p.id, () => api(`/friends/requests/${p.id}`, { method: "DELETE" }))}
                      >
                        <Icon name="close" size={15} strokeWidth={2.4} />
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="row static" key={p.id}>
                    <RoomAvatar name={p.inv.room.name} size={42} />
                    <span className="row-text">
                      <span className="row-name">{p.inv.room.name}</span>
                      <span className="row-sub">{p.inv.from.name} invited you</span>
                    </span>
                    <span className="yes-no">
                      <button
                        className="round-yes"
                        title="Join"
                        aria-label={`Join ${p.inv.room.name}`}
                        disabled={busy === p.id}
                        onClick={() =>
                          run(p.id, async () => {
                            const { room } = await api(`/invites/${p.id}/accept`, { method: "POST" });
                            await loadConversations();
                            openChat(room.id);
                          })
                        }
                      >
                        <Icon name="check" size={16} strokeWidth={2.4} />
                      </button>
                      <button
                        className="round-no"
                        title="Decline"
                        aria-label={`Decline ${p.inv.room.name}`}
                        disabled={busy === p.id}
                        onClick={() => run(p.id, () => api(`/invites/${p.id}/decline`, { method: "POST" }))}
                      >
                        <Icon name="close" size={15} strokeWidth={2.4} />
                      </button>
                    </span>
                  </div>
                )
              )}
              {pending.length > 4 && (
                <Link className="see-all centered" to="/friends">
                  {pending.length - 4} more <Icon name="arrowRight" size={15} />
                </Link>
              )}
            </div>
          )}
        </section>

        {/* ---------- Your profile (full width) ---------- */}
        <section className="card card-profile">
          <Avatar user={user} size={56} online={connected} />
          <span className="row-text">
            <span className="row-name">{user.name}</span>
            <span className={`row-sub ${connected ? "online-text" : ""}`}>
              {connected ? "Online" : "Reconnecting..."} · @{user.username}
            </span>
          </span>
          <span className="profile-stats">
            <span>
              <strong>{friends.length}</strong> {friends.length === 1 ? "friend" : "friends"}
            </span>
            <span>
              <strong>{groups.length}</strong> {groups.length === 1 ? "room" : "rooms"}
            </span>
            <span className="e2ee-chip">
              <Icon name="lock" size={13} /> Encrypted
            </span>
          </span>
          <button className="btn-soft" onClick={() => setModal("settings")}>
            Edit Profile <Icon name="arrowRight" size={16} />
          </button>
        </section>
      </div>

      {modal === "new" && <NewChatModal onClose={() => setModal(null)} />}
      {modal === "add" && <AddFriendModal onClose={() => setModal(null)} />}
      {modal === "room" && <CreateRoomModal onClose={() => setModal(null)} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
    </div>
  );
}
