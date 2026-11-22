import { useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import { api } from "../utils/api";
import Avatar from "../components/Avatar";

const TABS = [
  { id: "online", label: "Online" },
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
];

// The Home screen: your friends, requests, room invites and "Add Friend"
export default function FriendsPage() {
  const { openNav } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "online";
  const setTab = (id) => setParams(id === "online" ? {} : { tab: id });

  const { friends, incoming, outgoing, invites, loaded } = useData();
  const onlineIds = useOnlineIds();
  const onlineFriends = friends.filter((f) => onlineIds.has(f.id));
  const pendingCount = incoming.length + invites.length;

  return (
    <div className="friends-page">
      <header className="page-header">
        <button className="icon-btn mobile-only" onClick={openNav} aria-label="Menu">
          ☰
        </button>
        <span className="page-title">👥 Friends</span>
        <span className="header-sep" />
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "pending" && pendingCount > 0 && <span className="badge inline">{pendingCount}</span>}
            </button>
          ))}
          <button className={`tab add ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
            Add Friend
          </button>
        </nav>
      </header>

      <div className="friends-body">
        <section className="friends-main">
          {!loaded ? (
            <p className="muted">Loading...</p>
          ) : tab === "add" ? (
            <AddFriend />
          ) : tab === "pending" ? (
            <Pending />
          ) : (
            <FriendList list={tab === "online" ? onlineFriends : friends} tab={tab} total={friends.length} />
          )}
        </section>
        <ActiveNow friends={onlineFriends} />
      </div>
    </div>
  );
}

function FriendList({ list, tab, total }) {
  const navigate = useNavigate();
  const { openDm } = useData();
  const onlineIds = useOnlineIds();
  const [search, setSearch] = useState("");
  const [, setParams] = useSearchParams();

  const message = async (friend) => {
    try {
      navigate(`/dm/${await openDm(friend.id)}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const remove = async (friend) => {
    if (!window.confirm(`Remove ${friend.name} from your friends? Your DMs stay.`)) return;
    try {
      await api(`/friends/${friend.id}`, { method: "DELETE" });
    } catch (err) {
      alert(err.message);
    }
  };

  if (total === 0) {
    return (
      <Empty icon="🛸" title="No friends yet">
        UFOCHAT is better with friends. Add someone by their username.
        <button className="btn-primary" onClick={() => setParams({ tab: "add" })}>
          Add Friend
        </button>
      </Empty>
    );
  }
  if (list.length === 0) {
    return (
      <Empty icon="🌙" title="Nobody's online">
        None of your friends are around right now. Check the All tab.
      </Empty>
    );
  }

  const q = search.trim().toLowerCase();
  const shown = list.filter((f) => f.name.toLowerCase().includes(q) || (f.username || "").includes(q));

  return (
    <>
      <input className="friends-search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="section-label">
        {tab === "online" ? "Online" : "All friends"} · {shown.length}
      </div>
      {shown.map((f) => (
        <div className="friend-row" key={f.id} onClick={() => message(f)}>
          <Avatar user={f} size={36} online={onlineIds.has(f.id)} />
          <div className="person-text">
            <span className="person-name">
              {f.name} <span className="muted small">@{f.username}</span>
            </span>
            <span className="muted small">{onlineIds.has(f.id) ? "Online" : "Offline"}</span>
          </div>
          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button className="round-btn" title="Message" onClick={() => message(f)}>
              💬
            </button>
            <button className="round-btn danger" title="Remove friend" onClick={() => remove(f)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function Pending() {
  const navigate = useNavigate();
  const { incoming, outgoing, invites, loadRooms } = useData();
  const [busy, setBusy] = useState(null);

  // Runs an action, keeps the button disabled meanwhile, shows errors
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

  const acceptInvite = (inv) =>
    run(inv.id, async () => {
      const { room } = await api(`/invites/${inv.id}/accept`, { method: "POST" });
      await loadRooms();
      navigate(`/rooms/${room.id}`);
    });

  if (!incoming.length && !outgoing.length && !invites.length) {
    return (
      <Empty icon="📭" title="Nothing pending">
        Friend requests and room invites show up here.
      </Empty>
    );
  }

  return (
    <>
      {invites.length > 0 && (
        <>
          <div className="section-label">Room invites · {invites.length}</div>
          {invites.map((inv) => (
            <div className="friend-row static" key={inv.id}>
              <span className="room-badge">#</span>
              <div className="person-text">
                <span className="person-name">{inv.room.name}</span>
                <span className="muted small">
                  {inv.from.name} invited you · {inv.room.memberCount}{" "}
                  {inv.room.memberCount === 1 ? "member" : "members"}
                </span>
              </div>
              <div className="row-actions">
                <button className="round-btn success" title="Join" disabled={busy === inv.id} onClick={() => acceptInvite(inv)}>
                  ✓
                </button>
                <button
                  className="round-btn danger"
                  title="Decline"
                  disabled={busy === inv.id}
                  onClick={() => run(inv.id, () => api(`/invites/${inv.id}/decline`, { method: "POST" }))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {incoming.length > 0 && (
        <>
          <div className="section-label">Friend requests · {incoming.length}</div>
          {incoming.map((r) => (
            <div className="friend-row static" key={r.id}>
              <Avatar user={r.user} size={36} />
              <div className="person-text">
                <span className="person-name">
                  {r.user.name} <span className="muted small">@{r.user.username}</span>
                </span>
                <span className="muted small">Wants to be your friend</span>
              </div>
              <div className="row-actions">
                <button
                  className="round-btn success"
                  title="Accept"
                  disabled={busy === r.id}
                  onClick={() => run(r.id, () => api(`/friends/requests/${r.id}/accept`, { method: "POST" }))}
                >
                  ✓
                </button>
                <button
                  className="round-btn danger"
                  title="Decline"
                  disabled={busy === r.id}
                  onClick={() => run(r.id, () => api(`/friends/requests/${r.id}`, { method: "DELETE" }))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <div className="section-label">Sent · {outgoing.length}</div>
          {outgoing.map((r) => (
            <div className="friend-row static" key={r.id}>
              <Avatar user={r.user} size={36} />
              <div className="person-text">
                <span className="person-name">
                  {r.user.name} <span className="muted small">@{r.user.username}</span>
                </span>
                <span className="muted small">Waiting for them to accept</span>
              </div>
              <div className="row-actions">
                <button
                  className="round-btn danger"
                  title="Cancel request"
                  disabled={busy === r.id}
                  onClick={() => run(r.id, () => api(`/friends/requests/${r.id}`, { method: "DELETE" }))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function AddFriend() {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [result, setResult] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await api("/friends/requests", { method: "POST", body: { username: username.trim() } });
      setResult({
        ok: true,
        text:
          res.status === "accepted"
            ? `You and ${res.user.name} are now friends!`
            : `Friend request sent to @${res.user.username}.`,
      });
      setUsername("");
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-friend">
      <h3>Add Friend</h3>
      <p className="muted">
        Add friends with their UFOCHAT username. Yours is <strong>@{user.username}</strong>, so share it around.
      </p>
      <form className={`add-friend-box ${result ? (result.ok ? "ok" : "bad") : ""}`} onSubmit={send}>
        <input
          placeholder="Type a username, like alien"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value.toLowerCase().replace(/\s/g, ""));
            setResult(null);
          }}
          autoCapitalize="none"
          autoFocus
        />
        <button className="btn-primary" disabled={busy || !username.trim()}>
          {busy ? "Sending..." : "Send Friend Request"}
        </button>
      </form>
      {result && <p className={result.ok ? "success-text" : "error-text"}>{result.text}</p>}
      <div className="add-friend-art">👽 🛸 👽</div>
    </div>
  );
}

function ActiveNow({ friends }) {
  return (
    <aside className="active-now">
      <h3>Active now</h3>
      {friends.length === 0 ? (
        <div className="active-empty">
          <strong>It's quiet for now...</strong>
          <p className="muted small">When friends come online, they'll show up here.</p>
        </div>
      ) : (
        friends.map((f) => (
          <div className="active-card" key={f.id}>
            <Avatar user={f} size={32} online />
            <div className="person-text">
              <span className="person-name">{f.name}</span>
              <span className="muted small">@{f.username}</span>
            </div>
          </div>
        ))
      )}
    </aside>
  );
}

function Empty({ icon, title, children }) {
  return (
    <div className="empty-state">
      <div className="empty-icon big">{icon}</div>
      <h3>{title}</h3>
      <div className="muted empty-body">{children}</div>
    </div>
  );
}
