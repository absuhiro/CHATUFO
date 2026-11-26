import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useData } from "../context/DataContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import { api } from "../utils/api";
import Avatar, { RoomAvatar } from "./Avatar";
import Icon from "./Icon";
import AddFriendModal from "./AddFriendModal";

// The second panel on the Friends screen: search + compact filter chips instead of big tabs
export default function FriendsPanel() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { friends, incoming, outgoing, invites, loaded, openDm, loadConversations } = useData();
  const onlineIds = useOnlineIds();
  const [filter, setFilter] = useState("online");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);

  // /friends?add=1 opens the Add Friend popup (used by "Add a friend" buttons elsewhere)
  useEffect(() => {
    if (params.get("add")) {
      setAdding(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const pending = incoming.length + outgoing.length + invites.length;
  const onlineFriends = friends.filter((f) => onlineIds.has(f.id));
  const q = search.trim().toLowerCase();
  const matches = (u) => !q || u.name.toLowerCase().includes(q) || (u.username || "").includes(q);

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

  const message = (friend) =>
    run(friend.id, async () => navigate(`/chat/${await openDm(friend.id)}`, { state: { from: "/friends" } }));
  const remove = (friend) => {
    if (!window.confirm(`Remove ${friend.name} from your friends? Your messages stay.`)) return;
    run(friend.id, () => api(`/friends/${friend.id}`, { method: "DELETE" }));
  };
  const acceptInvite = (inv) =>
    run(inv.id, async () => {
      const { room } = await api(`/invites/${inv.id}/accept`, { method: "POST" });
      await loadConversations();
      navigate(`/chat/${room.id}`, { state: { from: "/friends" } });
    });

  const list = filter === "online" ? onlineFriends : friends;

  return (
    <div className="panel">
      <div className="panel-search">
        <label className="search-box">
          <Icon name="search" size={17} />
          <input placeholder="Search friends..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search friends" />
        </label>
        <button className="square-btn accent" onClick={() => setAdding(true)} title="Add a friend" aria-label="Add a friend">
          <Icon name="userPlus" size={18} />
        </button>
      </div>

      <div className="chips" role="tablist">
        {[
          ["online", `Online · ${onlineFriends.length}`],
          ["all", `All · ${friends.length}`],
          ["pending", "Pending"],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={`chip ${filter === id ? "on" : ""}`} onClick={() => setFilter(id)}>
            {label}
            {id === "pending" && pending > 0 && <span className="count-badge small">{pending}</span>}
          </button>
        ))}
      </div>

      <div className="panel-scroll">
        {!loaded && <p className="panel-empty">Loading...</p>}

        {loaded && filter !== "pending" && (
          <>
            {friends.length === 0 ? (
              <div className="panel-empty">
                <p>No friends yet. Add someone by their username.</p>
                <button className="btn-primary small" onClick={() => setAdding(true)}>
                  Add a friend
                </button>
              </div>
            ) : list.filter(matches).length === 0 ? (
              <p className="panel-empty">{filter === "online" && !q ? "None of your friends are online right now." : "No one matches."}</p>
            ) : (
              list.filter(matches).map((f) => (
                <div className="convo person-row" key={f.id} onClick={() => message(f)} role="button" tabIndex={0}>
                  <Avatar user={f} size={40} online={onlineIds.has(f.id)} />
                  <div className="convo-text">
                    <span className="convo-name">{f.name}</span>
                    <span className="convo-preview">{onlineIds.has(f.id) ? "Online" : `@${f.username}`}</span>
                  </div>
                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="ghost-icon" title="Message" onClick={() => message(f)} disabled={busy === f.id}>
                      <Icon name="chat" size={17} />
                    </button>
                    <button className="ghost-icon danger" title="Remove friend" onClick={() => remove(f)} disabled={busy === f.id}>
                      <Icon name="userMinus" size={17} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {loaded && filter === "pending" && (
          <>
            {pending === 0 && (
              <div className="panel-empty">
                <Icon name="inbox" size={28} />
                <p>Nothing pending. Friend requests and room invites show up here.</p>
              </div>
            )}

            {invites.filter((i) => matches({ name: i.room.name })).length > 0 && <div className="section-label">Room invites</div>}
            {invites
              .filter((i) => matches({ name: i.room.name }))
              .map((inv) => (
                <div className="convo person-row static" key={inv.id}>
                  <RoomAvatar name={inv.room.name} size={40} />
                  <div className="convo-text">
                    <span className="convo-name">{inv.room.name}</span>
                    <span className="convo-preview">From {inv.from.name}</span>
                  </div>
                  <div className="row-actions show">
                    <button className="ghost-icon success" title="Join" onClick={() => acceptInvite(inv)} disabled={busy === inv.id}>
                      <Icon name="check" size={18} />
                    </button>
                    <button
                      className="ghost-icon danger"
                      title="Decline"
                      disabled={busy === inv.id}
                      onClick={() => run(inv.id, () => api(`/invites/${inv.id}/decline`, { method: "POST" }))}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                </div>
              ))}

            {incoming.filter((r) => matches(r.user)).length > 0 && <div className="section-label">Friend requests</div>}
            {incoming
              .filter((r) => matches(r.user))
              .map((r) => (
                <div className="convo person-row static" key={r.id}>
                  <Avatar user={r.user} size={40} />
                  <div className="convo-text">
                    <span className="convo-name">{r.user.name}</span>
                    <span className="convo-preview">@{r.user.username} wants to be friends</span>
                  </div>
                  <div className="row-actions show">
                    <button
                      className="ghost-icon success"
                      title="Accept"
                      disabled={busy === r.id}
                      onClick={() => run(r.id, () => api(`/friends/requests/${r.id}/accept`, { method: "POST" }))}
                    >
                      <Icon name="check" size={18} />
                    </button>
                    <button
                      className="ghost-icon danger"
                      title="Decline"
                      disabled={busy === r.id}
                      onClick={() => run(r.id, () => api(`/friends/requests/${r.id}`, { method: "DELETE" }))}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                </div>
              ))}

            {outgoing.filter((r) => matches(r.user)).length > 0 && <div className="section-label">Sent</div>}
            {outgoing
              .filter((r) => matches(r.user))
              .map((r) => (
                <div className="convo person-row static" key={r.id}>
                  <Avatar user={r.user} size={40} />
                  <div className="convo-text">
                    <span className="convo-name">{r.user.name}</span>
                    <span className="convo-preview">Waiting for them to accept</span>
                  </div>
                  <div className="row-actions show">
                    <button
                      className="ghost-icon danger"
                      title="Cancel request"
                      disabled={busy === r.id}
                      onClick={() => run(r.id, () => api(`/friends/requests/${r.id}`, { method: "DELETE" }))}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>

      {adding && <AddFriendModal onClose={() => setAdding(false)} />}
    </div>
  );
}
