import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useSocket } from "../context/SocketContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import { useRoomChat } from "../hooks/useRoomChat";
import { api } from "../utils/api";
import Avatar from "../components/Avatar";
import MessageList from "../components/MessageList";
import MessageInput from "../components/MessageInput";
import TypingIndicator from "../components/TypingIndicator";
import InviteModal from "../components/InviteModal";

// One page for both group rooms (/rooms/:roomId) and DMs (/dm/:roomId).
// key={roomId} gives every room a fresh page, so the old room's messages never flash on screen.
export default function ChatPage({ kind }) {
  const { roomId } = useParams();
  return <Chat key={roomId} kind={kind} roomId={roomId} />;
}

function Chat({ kind, roomId }) {
  const { openNav } = useOutletContext();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { setActiveRoom } = useData();
  const onlineIds = useOnlineIds();

  const [room, setRoom] = useState(null); // details with members
  const [loadError, setLoadError] = useState("");
  const [showPanel, setShowPanel] = useState(true);
  const [inviting, setInviting] = useState(false);

  const chat = useRoomChat(roomId);

  const loadRoom = useCallback(async () => {
    try {
      const { room } = await api(`/rooms/${roomId}`);
      setRoom(room);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message);
    }
  }, [roomId]);

  useEffect(() => {
    setRoom(null);
    setLoadError("");
    loadRoom();
  }, [loadRoom]);

  // Tell the shared data this room is open (clears its unread dot, and no new dots while open)
  useEffect(() => {
    setActiveRoom(roomId);
    return () => setActiveRoom(null);
  }, [roomId, setActiveRoom]);

  // Someone accepted an invite or left: refresh the member list
  useEffect(() => {
    if (!socket) return;
    const onUpdated = ({ roomId: rid }) => rid === roomId && loadRoom();
    // A member changed their name or photo (Step 8)
    const onUserUpdated = (card) => room?.members.some((m) => m.id === card.id) && loadRoom();
    socket.on("room_updated", onUpdated);
    socket.on("user_updated", onUserUpdated);
    return () => {
      socket.off("room_updated", onUpdated);
      socket.off("user_updated", onUserUpdated);
    };
  }, [socket, roomId, loadRoom, room]);

  if (loadError) {
    return (
      <div className="page-message">
        <div className="empty-icon big">🕳️</div>
        <h3>Can't open this chat</h3>
        <p className="muted">It doesn't exist, or you're not a member.</p>
        <Link className="btn-primary" to="/">
          Back home
        </Link>
      </div>
    );
  }

  const isDm = kind === "dm";
  const other = isDm && room ? room.members.find((m) => m.id !== user.id) : null;
  const title = isDm ? other?.name : room ? `${room.name}` : "";

  return (
    <div className={`chat-page ${showPanel ? "with-panel" : ""}`}>
      <header className="page-header">
        <button className="icon-btn mobile-only" onClick={openNav} aria-label="Menu">
          ☰
        </button>
        {isDm ? (
          other && <Avatar user={other} size={26} online={onlineIds.has(other.id)} />
        ) : (
          <span className="header-hash">#</span>
        )}
        <span className="page-title">{title || "..."}</span>
        {isDm && other && <span className="muted small">@{other.username}</span>}
        {!isDm && room?.description && (
          <>
            <span className="header-sep" />
            <span className="muted header-desc">{room.description}</span>
          </>
        )}
        <span className="spacer" />
        {!isDm && room && (
          <button className="icon-btn" title="Invite friends" onClick={() => setInviting(true)}>
            👤+
          </button>
        )}
        <button
          className={`icon-btn ${showPanel ? "on" : ""}`}
          title={isDm ? "Profile" : "Members"}
          onClick={() => setShowPanel((v) => !v)}
        >
          {isDm ? "👤" : "👥"}
        </button>
      </header>

      <div className="chat-body">
        <section className="chat-main">
          {chat.status === "error" ? (
            <div className="page-message">
              <p className="muted">{chat.error}</p>
            </div>
          ) : chat.status === "loading" ? (
            <div className="page-message muted">Loading messages...</div>
          ) : (
            <MessageList
              messages={chat.messages}
              myId={user.id}
              hasMore={chat.hasMore}
              onLoadOlder={chat.loadOlder}
              emptyText={
                isDm && other
                  ? `This is the start of your DMs with ${other.name}. Say hi! 👋`
                  : "This is the start of the room. Say hi!"
              }
            />
          )}
          <TypingIndicator users={chat.typingUsers} />
          <MessageInput
            roomId={roomId}
            disabled={chat.status !== "ready"}
            placeholder={isDm && other ? `Message @${other.username}` : room ? `Message #${room.name}` : ""}
          />
        </section>

        {showPanel && room && (
          <aside className="right-panel">
            {isDm ? <ProfileCard user={other} online={other && onlineIds.has(other.id)} /> : <Members room={room} onlineIds={onlineIds} myId={user.id} />}
          </aside>
        )}
      </div>

      {inviting && room && <InviteModal room={room} onClose={() => setInviting(false)} />}
    </div>
  );
}

// Group room: members split into Online and Offline, like Discord
function Members({ room, onlineIds, myId }) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const online = room.members.filter((m) => onlineIds.has(m.id)).sort(byName);
  const offline = room.members.filter((m) => !onlineIds.has(m.id)).sort(byName);

  const row = (m, isOnline) => (
    <div className={`member ${isOnline ? "" : "offline"}`} key={m.id}>
      <Avatar user={m} size={32} online={isOnline} />
      <span className="member-name">
        {m.name}
        {m.id === myId && <span className="muted"> (you)</span>}
      </span>
      {m.id === room.createdBy && (
        <span className="crown" title="Room creator">
          👑
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className="section-label">Online · {online.length}</div>
      {online.map((m) => row(m, true))}
      {offline.length > 0 && <div className="section-label">Offline · {offline.length}</div>}
      {offline.map((m) => row(m, false))}
    </>
  );
}

// DM: a profile card for the other person
function ProfileCard({ user, online }) {
  if (!user) return null;
  return (
    <div className="profile-card">
      <div className="profile-banner" />
      <div className="profile-avatar">
        <Avatar user={user} size={80} online={online} />
      </div>
      <h3>{user.name}</h3>
      <p className="muted">@{user.username}</p>
      <div className="profile-status">{online ? "🟢 Online" : "⚫ Offline"}</div>
      {user.bio && (
        <div className="profile-about">
          <div className="section-label">About me</div>
          <p>{user.bio}</p>
        </div>
      )}
    </div>
  );
}
