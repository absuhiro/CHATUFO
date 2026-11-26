import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useSocket } from "../context/SocketContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import { useRoomChat } from "../hooks/useRoomChat";
import { api } from "../utils/api";
import Avatar, { RoomAvatar } from "../components/Avatar";
import Icon from "../components/Icon";
import MessageList from "../components/MessageList";
import MessageInput from "../components/MessageInput";
import TypingIndicator from "../components/TypingIndicator";
import InviteModal from "../components/InviteModal";
import { encryptMessage } from "../crypto/e2ee";
import { getPublicKeys, rememberKeys } from "../crypto/publicKeys";
import { acceptCodes, checkCodes } from "../crypto/trust";

// socket.emit with a reply, as a Promise (gives up after 10 seconds)
function emitWithAck(socket, event, data) {
  return new Promise((resolve) => {
    socket.timeout(10000).emit(event, data, (err, res) => {
      resolve(err ? { ok: false, error: "The server didn't answer. Check your connection." } : res);
    });
  });
}

// One page for both rooms and DMs: /chat/:roomId
// key={roomId} gives every chat a fresh page, so the old chat's messages never flash on screen.
export default function ChatPage() {
  const { roomId } = useParams();
  return <Chat key={roomId} roomId={roomId} />;
}

function Chat({ roomId }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Back goes to wherever you opened the chat from (dashboard, chats, friends)
  const backTo = location.state?.from || "/chats";
  const { user, keys } = useAuth();
  const { socket } = useSocket();
  const { setActiveRoom, loadConversations } = useData();
  const onlineIds = useOnlineIds();

  const [room, setRoom] = useState(null); // details with members
  const [loadError, setLoadError] = useState("");
  const [showInfo, setShowInfo] = useState(false); // members / profile panel (closed by default)
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [memberKeys, setMemberKeys] = useState(new Map()); // userId -> public keys + security code (null = not set up)
  const [changedIds, setChangedIds] = useState([]); // members whose security code changed
  const menuRef = useRef(null);

  const chat = useRoomChat(roomId);
  const roomRef = useRef(null); // latest room for the send function

  const loadRoom = useCallback(async () => {
    try {
      const { room } = await api(`/rooms/${roomId}`);
      rememberKeys(room.members);
      roomRef.current = room;
      setRoom(room);
      setLoadError("");
      return room;
    } catch (err) {
      setLoadError(err.message);
      return null;
    }
  }, [roomId]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  // Import every member's public keys, and check nobody's security code changed
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    getPublicKeys(room.members.map((m) => m.id)).then((map) => {
      if (cancelled) return;
      setMemberKeys(map);
      setChangedIds(checkCodes(user.id, room.members.map((m) => ({ id: m.id, code: map.get(m.id)?.code }))));
    });
    return () => {
      cancelled = true;
    };
  }, [room, user.id]);

  // Tell the shared data this chat is open (clears its unread count)
  useEffect(() => {
    setActiveRoom(roomId);
    return () => setActiveRoom(null);
  }, [roomId, setActiveRoom]);

  // Someone accepted an invite or left, or a member changed their name/photo: refresh the members
  useEffect(() => {
    if (!socket) return;
    const onUpdated = ({ roomId: rid }) => rid === roomId && loadRoom();
    const onUserUpdated = (card) => roomRef.current?.members.some((m) => m.id === card.id) && loadRoom();
    socket.on("room_updated", onUpdated);
    socket.on("user_updated", onUserUpdated);
    return () => {
      socket.off("room_updated", onUpdated);
      socket.off("user_updated", onUserUpdated);
    };
  }, [socket, roomId, loadRoom]);

  // Close the "more" menu when clicking anywhere else
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // Encrypt in this browser, then send. The server only ever sees scrambled data.
  const send = useCallback(
    async (text) => {
      let current = roomRef.current;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!current) throw new Error("Still loading this chat");
        const map = await getPublicKeys(current.members.map((m) => m.id));
        // Lock the message key for every member who has encryption set up (including you)
        const recipients = current.members
          .filter((m) => map.get(m.id))
          .map((m) => ({ id: m.id, encryptKey: map.get(m.id).encryptKey }));
        if (!recipients.some((r) => r.id === user.id)) throw new Error("Your encryption keys aren't ready. Log in again.");

        const payload = await encryptMessage({ text, roomId, senderId: user.id, recipients, signKey: keys.signKey });
        const res = await emitWithAck(socket, "send_message", { roomId, ...payload });
        if (res.ok) return;
        if (res.code !== "members_changed") throw new Error(res.error);
        current = await loadRoom(); // someone joined/left a moment ago: get the fresh list and try again
      }
      throw new Error("Couldn't send: the member list keeps changing. Try again.");
    },
    [roomId, user.id, keys, socket, loadRoom]
  );

  const leave = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Leave ${room.name}? You'll need a new invite to come back.`)) return;
    try {
      await api(`/rooms/${roomId}/leave`, { method: "POST" });
      navigate(backTo === `/chat/${roomId}` ? "/" : backTo);
      loadConversations();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loadError) {
    return (
      <div className="empty-main">
        <div className="empty-icon">🕳️</div>
        <h2>Can't open this chat</h2>
        <p className="muted">It doesn't exist, or you're not a member.</p>
        <Link className="btn-primary pill" to="/">
          Back to chats
        </Link>
      </div>
    );
  }

  const isDm = room?.type === "dm";
  const other = isDm ? room.members.find((m) => m.id !== user.id) : null;
  const title = !room ? "" : isDm ? other?.name : room.name;
  const otherOnline = !!(other && onlineIds.has(other.id));
  const onlineCount = room && !isDm ? room.members.filter((m) => onlineIds.has(m.id)).length : 0;
  const subtitle = !room
    ? ""
    : isDm
    ? otherOnline
      ? "Online"
      : `@${other?.username || ""}`
    : `${room.members.length} ${room.members.length === 1 ? "member" : "members"}${onlineCount ? ` · ${onlineCount} online` : ""}`;

  // Warnings shown above the messages
  const nameOf = (id) => room?.members.find((m) => m.id === id)?.name || "Someone";
  const listNames = (ids) => ids.map(nameOf).join(", ");
  const keyless = room ? room.members.filter((m) => memberKeys.has(m.id) && memberKeys.get(m.id) === null) : [];
  const acceptChanged = () => {
    acceptCodes(user.id, changedIds.map((id) => ({ id, code: memberKeys.get(id)?.code })));
    setChangedIds([]);
  };

  return (
    <div className={`chat ${showInfo ? "info-open" : ""}`}>
      <div className="chat-column">
        <header className="chat-header">
          <button className="ghost-icon back-btn" onClick={() => navigate(backTo)} title="Back" aria-label="Back">
            <Icon name="back" size={20} />
          </button>
          <button className="chat-who" onClick={() => setShowInfo((v) => !v)} title={isDm ? "View profile" : "View members"}>
            {room && (isDm ? <Avatar user={other} size={38} online={otherOnline} /> : <RoomAvatar name={room.name} size={38} />)}
            <span className="chat-who-text">
              <span className="chat-title">{title || "..."}</span>
              <span className={`chat-sub ${isDm && otherOnline ? "online" : ""}`}>{subtitle}</span>
            </span>
          </button>
          <span className="grow" />
          <span className="e2ee-pill" title="End-to-end encrypted: only the people in this chat can read it">
            <Icon name="lock" size={13} /> <span className="e2ee-pill-text">Encrypted</span>
          </span>
          {room && !isDm && (
            <button className="ghost-icon hide-narrow" title="Invite friends" aria-label="Invite friends" onClick={() => setInviting(true)}>
              <Icon name="userPlus" size={19} />
            </button>
          )}
          <button
            className={`ghost-icon ${showInfo ? "on" : ""}`}
            title={isDm ? "Profile" : "Members"}
            aria-label={isDm ? "Profile" : "Members"}
            onClick={() => setShowInfo((v) => !v)}
          >
            <Icon name="info" size={19} />
          </button>
          {room && !isDm && (
            <div className="menu-wrap" ref={menuRef}>
              <button className="ghost-icon" title="More" aria-label="More options" onClick={() => setMenuOpen((v) => !v)}>
                <Icon name="more" size={19} />
              </button>
              {menuOpen && (
                <div className="popover header-menu">
                  <button
                    className="popover-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setInviting(true);
                    }}
                  >
                    <Icon name="userPlus" size={16} /> Invite friends
                  </button>
                  <button
                    className="popover-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowInfo(true);
                    }}
                  >
                    <Icon name="users" size={16} /> Members
                  </button>
                  <button className="popover-item danger" onClick={leave}>
                    <Icon name="leave" size={16} /> Leave room
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {changedIds.length > 0 && (
          <div className="chat-banner warn">
            <span>⚠ {listNames(changedIds)}'s security code changed. Check it with them before sharing anything private.</span>
            <button className="btn-ghost small" onClick={acceptChanged}>
              I checked it
            </button>
          </div>
        )}
        {keyless.length > 0 && (
          <div className="chat-banner">
            🔓 {listNames(keyless.map((m) => m.id))} {keyless.length === 1 ? "hasn't" : "haven't"} logged in since
            encryption was added, so they can't read new messages until they do.
          </div>
        )}

        {chat.status === "error" ? (
          <div className="empty-main">
            <p className="muted">{chat.error}</p>
          </div>
        ) : chat.status === "loading" ? (
          <div className="empty-main muted">Loading messages...</div>
        ) : (
          <MessageList
            messages={chat.messages}
            myId={user.id}
            hasMore={chat.hasMore}
            onLoadOlder={chat.loadOlder}
            emptyText={
              isDm && other
                ? `This is the start of your conversation with ${other.name}. Say hi! 👋`
                : "This is the start of the room. Say hi!"
            }
          />
        )}
        <TypingIndicator users={chat.typingUsers} />
        <MessageInput
          roomId={roomId}
          disabled={chat.status !== "ready"}
          placeholder={isDm && other ? `Message ${other.name}` : room ? `Message ${room.name}` : ""}
          onSend={send}
        />
      </div>

      {showInfo && room && (
        <aside className="info-panel">
          <div className="info-head">
            <span>{isDm ? "Profile" : "Room info"}</span>
            <button className="ghost-icon" onClick={() => setShowInfo(false)} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
          {isDm ? (
            <ProfileCard user={other} online={otherOnline} code={other && memberKeys.get(other.id)?.code} />
          ) : (
            <RoomInfo
              room={room}
              onlineIds={onlineIds}
              myId={user.id}
              memberKeys={memberKeys}
              onInvite={() => setInviting(true)}
              onLeave={leave}
            />
          )}
        </aside>
      )}

      {inviting && room && <InviteModal room={room} onClose={() => setInviting(false)} />}
    </div>
  );
}

// Group room: description, members (online first), invite + leave
function RoomInfo({ room, onlineIds, myId, memberKeys, onInvite, onLeave }) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const online = room.members.filter((m) => onlineIds.has(m.id)).sort(byName);
  const offline = room.members.filter((m) => !onlineIds.has(m.id)).sort(byName);

  const row = (m, isOnline) => (
    <div className={`member ${isOnline ? "" : "offline"}`} key={m.id}>
      <Avatar user={m} size={34} online={isOnline} />
      <span className="member-name">
        {m.name}
        {m.id === myId && <span className="muted"> (you)</span>}
      </span>
      {memberKeys.has(m.id) && memberKeys.get(m.id) === null && (
        <span className="member-tag" title="Hasn't set up encryption yet">
          🔓
        </span>
      )}
      {m.id === room.createdBy && (
        <span className="member-tag" title="Room creator">
          👑
        </span>
      )}
    </div>
  );

  return (
    <div className="info-body">
      <div className="info-hero">
        <RoomAvatar name={room.name} size={72} />
        <h3>{room.name}</h3>
        {room.description && <p className="muted">{room.description}</p>}
      </div>
      <button className="btn-primary pill wide" onClick={onInvite}>
        <Icon name="userPlus" size={16} /> Invite friends
      </button>
      <div className="section-label">Online · {online.length}</div>
      {online.map((m) => row(m, true))}
      {offline.length > 0 && <div className="section-label">Offline · {offline.length}</div>}
      {offline.map((m) => row(m, false))}
      <button className="text-danger-btn" onClick={onLeave}>
        <Icon name="leave" size={16} /> Leave room
      </button>
    </div>
  );
}

// DM: a profile card for the other person, with their security code
function ProfileCard({ user, online, code }) {
  if (!user) return null;
  return (
    <div className="info-body">
      <div className="info-hero">
        <Avatar user={user} size={88} online={online} />
        <h3>{user.name}</h3>
        <p className="muted">@{user.username}</p>
        <span className={`status-pill ${online ? "online" : ""}`}>{online ? "Online" : "Offline"}</span>
      </div>
      {user.bio && (
        <div className="info-card">
          <div className="section-label">About me</div>
          <p>{user.bio}</p>
        </div>
      )}
      <div className="info-card">
        <div className="section-label">
          <Icon name="lock" size={12} /> Security code
        </div>
        {code ? (
          <>
            <p className="security-code">{code}</p>
            <p className="muted small">
              Ask {user.name} to open Settings → Encryption. If their code matches this one, your chat is private.
            </p>
          </>
        ) : (
          <p className="muted small">{user.name} hasn't set up encryption yet.</p>
        )}
      </div>
    </div>
  );
}
