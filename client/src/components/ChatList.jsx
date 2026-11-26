import { useEffect, useRef, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useData } from "../context/DataContext";
import { useOnlineIds } from "../hooks/useOnlineIds";
import { shortTime } from "../utils/time";
import Avatar, { RoomAvatar } from "./Avatar";
import Icon from "./Icon";
import NewChatModal from "./NewChatModal";
import { useMinuteTick } from "../hooks/useMinuteTick";

const FILTERS = [
  { id: "all", label: "All chats", heading: "All chats" },
  { id: "dm", label: "Direct messages", heading: "Direct messages" },
  { id: "group", label: "Rooms", heading: "Rooms" },
  { id: "unread", label: "Unread", heading: "Unread" },
];

// The Chats page: search, a compact filter, and every conversation (DMs + rooms)
export default function ChatList() {
  const [params] = useSearchParams(); // /chats?filter=group opens straight on Rooms
  const { conversations, loaded } = useData();
  const onlineIds = useOnlineIds();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(() =>
    ["dm", "group", "unread"].includes(params.get("filter")) ? params.get("filter") : "all"
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const filterRef = useRef(null);
  useMinuteTick();

  // Close the filter menu when clicking anywhere else
  useEffect(() => {
    if (!filterOpen) return;
    const close = (e) => !filterRef.current?.contains(e.target) && setFilterOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  const titleOf = (c) => (c.type === "dm" ? c.user?.name : c.name) || "";
  const counts = {
    all: conversations.length,
    dm: conversations.filter((c) => c.type === "dm").length,
    group: conversations.filter((c) => c.type === "group").length,
    unread: conversations.filter((c) => c.unreadCount > 0).length,
  };

  const q = search.trim().toLowerCase();
  const shown = conversations.filter((c) => {
    if (filter === "dm" && c.type !== "dm") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (filter === "unread" && !c.unreadCount) return false;
    if (!q) return true;
    return titleOf(c).toLowerCase().includes(q) || (c.user?.username || "").includes(q);
  });

  const active = FILTERS.find((f) => f.id === filter);

  return (
    <div className="panel">
      <div className="panel-search">
        <label className="search-box">
          <Icon name="search" size={17} />
          <input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conversations"
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
        <div className="filter-wrap" ref={filterRef}>
          <button
            className={`square-btn ${filter !== "all" ? "on" : ""}`}
            onClick={() => setFilterOpen((v) => !v)}
            title="Filter"
            aria-label="Filter conversations"
          >
            <Icon name="filter" size={18} />
          </button>
          {filterOpen && (
            <div className="popover filter-menu">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`popover-item ${filter === f.id ? "selected" : ""}`}
                  onClick={() => {
                    setFilter(f.id);
                    setFilterOpen(false);
                  }}
                >
                  <span className="grow">{f.label}</span>
                  <span className="muted small">{counts[f.id]}</span>
                  {filter === f.id && <Icon name="check" size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel-heading">
        <span>{active.heading}</span>
        {filter !== "all" && (
          <button className="chip" onClick={() => setFilter("all")} title="Show all chats">
            {active.label} <Icon name="close" size={12} />
          </button>
        )}
        <span className="grow" />
        <button className="ghost-icon" onClick={() => setComposing(true)} title="New message" aria-label="New message">
          <Icon name="pencil" size={17} />
        </button>
      </div>

      <div className="panel-scroll">
        {!loaded && <p className="panel-empty">Loading...</p>}
        {loaded && conversations.length === 0 && (
          <div className="panel-empty">
            <p>No conversations yet.</p>
            <button className="btn-primary small" onClick={() => setComposing(true)}>
              Start a chat
            </button>
          </div>
        )}
        {loaded && conversations.length > 0 && shown.length === 0 && (
          <p className="panel-empty">Nothing matches{q ? ` "${search}"` : ""}.</p>
        )}

        {shown.map((c) => {
          const isDm = c.type === "dm";
          const p = c.preview;
          const previewText = !p
            ? isDm
              ? "Say hi 👋"
              : "No messages yet"
            : p.system
            ? p.text
            : isDm && !p.fromMe
            ? p.text
            : `${p.who}: ${p.text}`;
          return (
            <NavLink
              key={c.id}
              to={`/chat/${c.id}`}
              state={{ from: "/chats" }}
              className={({ isActive }) => `convo ${isActive ? "active" : ""} ${c.unreadCount ? "unread" : ""}`}
            >
              {isDm ? (
                <Avatar user={c.user} size={44} online={onlineIds.has(c.user?.id)} />
              ) : (
                <RoomAvatar name={c.name} size={44} />
              )}
              <div className="convo-text">
                <div className="convo-top">
                  <span className="convo-name">{titleOf(c)}</span>
                  <span className="convo-time">{shortTime(c.activityAt)}</span>
                </div>
                <div className="convo-bottom">
                  <span className="convo-preview">
                    {c.unreadCount > 1 && !p?.fromMe ? `${c.unreadCount} new messages` : previewText}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="count-badge">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>
                  )}
                </div>
              </div>
            </NavLink>
          );
        })}
      </div>

      {composing && <NewChatModal onClose={() => setComposing(false)} />}
    </div>
  );
}
