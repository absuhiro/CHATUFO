import { NavLink } from "react-router-dom";
import { useData } from "../context/DataContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import Avatar from "./Avatar";

// Sidebar on the Home screen: Friends link + your direct messages
export default function HomeSidebar() {
  const { dms, unread, incoming, invites, loaded } = useData();
  const onlineIds = useOnlineIds();
  const pending = incoming.length + invites.length;

  return (
    <div className="side-content">
      <div className="side-header">
        <span className="side-title">Home</span>
      </div>
      <div className="side-scroll">
        <NavLink to="/" end className={({ isActive }) => `side-link big ${isActive ? "active" : ""}`}>
          <span className="side-link-icon">👥</span>
          <span className="side-link-text">Friends</span>
          {pending > 0 && <span className="badge inline">{pending}</span>}
        </NavLink>

        <div className="section-label">Direct messages</div>
        {loaded && dms.length === 0 && (
          <p className="side-empty">No DMs yet. Message a friend from the Friends page.</p>
        )}
        {dms.map((dm) => (
          <NavLink
            key={dm.id}
            to={`/dm/${dm.id}`}
            className={({ isActive }) => `side-link ${isActive ? "active" : ""} ${unread.has(dm.id) ? "unread" : ""}`}
          >
            <Avatar user={dm.user} size={32} online={onlineIds.has(dm.user.id)} />
            <span className="side-link-text">{dm.user.name}</span>
            {unread.has(dm.id) && <span className="unread-dot inline" />}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
