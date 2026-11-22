import { useLayoutEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { linkify } from "../utils/linkify";

const GROUP_GAP_MS = 5 * 60 * 1000; // messages from the same person within 5 min are grouped

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

const isSystem = (m) => m.type === "system";

export default function MessageList({ messages, myId, hasMore, onLoadOlder, emptyText }) {
  const boxRef = useRef(null);
  const prev = useRef({ firstId: null, lastId: null, height: 0, nearBottom: true });
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Runs after each render, before the browser paints, so scroll changes don't flicker
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const firstId = messages[0]?.id ?? null;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const last = messages[messages.length - 1];

    if (prev.current.firstId && firstId !== prev.current.firstId && lastId === prev.current.lastId) {
      // Older messages were added on top: keep the view on what you were reading
      box.scrollTop += box.scrollHeight - prev.current.height;
    } else if (lastId !== prev.current.lastId) {
      // New message at the bottom (or a fresh room): follow it if you were already
      // at the bottom, or if you sent it yourself
      const mine = last && !isSystem(last) && last.sender.id === myId;
      if (prev.current.nearBottom || mine || !prev.current.lastId) box.scrollTop = box.scrollHeight;
    }

    prev.current = { ...prev.current, firstId, lastId, height: box.scrollHeight };
  }, [messages, myId]);

  const handleScroll = () => {
    const box = boxRef.current;
    prev.current.nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  };

  const handleLoadOlder = async () => {
    setLoadingOlder(true);
    try {
      await onLoadOlder();
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className="message-list" ref={boxRef} onScroll={handleScroll}>
      {hasMore && (
        <button className="btn-ghost load-older" onClick={handleLoadOlder} disabled={loadingOlder}>
          {loadingOlder ? "Loading..." : "Load older messages"}
        </button>
      )}

      {messages.length === 0 && (
        <div className="empty-chat">
          <div className="empty-icon">👽</div>
          {emptyText || "No messages yet. Say hi!"}
        </div>
      )}

      {messages.map((msg, i) => {
        const before = messages[i - 1];
        const newDay = !before || formatDay(before.createdAt) !== formatDay(msg.createdAt);
        const dayDivider = newDay && (
          <div className="day-divider">
            <span>{formatDay(msg.createdAt)}</span>
          </div>
        );

        if (isSystem(msg)) {
          // Saved notices like "Alien joined the room" (posted by the server)
          const left = / left the room$/.test(msg.text);
          return (
            <div key={msg.id}>
              {dayDivider}
              <div className={`system-msg ${left ? "left" : "joined"}`}>
                <span className="system-arrow">{left ? "←" : "→"}</span>
                {msg.text}
                <span className="msg-time">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        }

        const mine = msg.sender.id === myId;
        // Grouped = same sender as the message right before, close in time, same day
        const grouped =
          !newDay &&
          before &&
          !isSystem(before) &&
          before.sender.id === msg.sender.id &&
          new Date(msg.createdAt) - new Date(before.createdAt) < GROUP_GAP_MS;

        return (
          <div key={msg.id}>
            {dayDivider}
            <div className={`msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`}>
              <div className="msg-avatar">{!grouped && !mine && <Avatar user={msg.sender} size={32} />}</div>
              <div className="msg-body">
                {!grouped && (
                  <div className="msg-meta">
                    {!mine && <span className="msg-name">{msg.sender.name}</span>}
                    <span className="msg-time">{formatTime(msg.createdAt)}</span>
                  </div>
                )}
                <div className="bubble" title={new Date(msg.createdAt).toLocaleString()}>
                  {linkify(msg.text)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
