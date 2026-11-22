import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import { api } from "../utils/api";

const TYPING_EXPIRE_MS = 6000; // forget someone typing if we hear nothing for this long

/**
 * Everything the chat needs for one room or DM:
 *   messages, hasMore, loadOlder()   history + live messages ("joined"/"left" notices are saved messages)
 *   typingUsers                      [{ id, name }] typing right now
 *   status, error                    "loading" | "ready" | "error"
 *
 * Opening = socket join_room (start listening + get the latest messages).
 * You must already be a member (invite accepted, or one of the two people in a DM).
 * Re-runs after a reconnect so missed messages show up.
 */
export function useRoomChat(roomId) {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [typing, setTyping] = useState({}); // { userId: name }
  const typingTimers = useRef({});
  const loadingOlder = useRef(false);

  const removeTyping = useCallback((userId) => {
    clearTimeout(typingTimers.current[userId]);
    delete typingTimers.current[userId];
    setTyping((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!socket || !connected || !roomId) return;
    let cancelled = false;

    setStatus((s) => (s === "ready" ? s : "loading"));
    socket.emit("join_room", { roomId }, (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setStatus("error");
        setError(res.error);
        return;
      }
      setMessages(res.messages);
      setHasMore(res.hasMore);
      setStatus("ready");
    });

    const onNewMessage = (msg) => {
      if (msg.roomId !== roomId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender) removeTyping(msg.sender.id); // they sent it, so they've stopped typing
    };
    const onTyping = ({ roomId: rid, user, isTyping }) => {
      if (rid !== roomId) return;
      if (!isTyping) return removeTyping(user.id);
      clearTimeout(typingTimers.current[user.id]);
      typingTimers.current[user.id] = setTimeout(() => removeTyping(user.id), TYPING_EXPIRE_MS);
      setTyping((prev) => (prev[user.id] === user.name ? prev : { ...prev, [user.id]: user.name }));
    };
    const onUserOffline = ({ id }) => removeTyping(id);
    // Someone changed their name or photo: update it on messages already on screen (Step 8)
    const onUserUpdated = (card) =>
      setMessages((prev) =>
        prev.some((m) => m.sender?.id === card.id)
          ? prev.map((m) => (m.sender?.id === card.id ? { ...m, sender: { ...m.sender, ...card } } : m))
          : prev
      );

    socket.on("new_message", onNewMessage);
    socket.on("typing", onTyping);
    socket.on("user_offline", onUserOffline);
    socket.on("user_updated", onUserUpdated);

    // Cleanup: switching rooms, logging out or losing the connection.
    // leave_room only stops LISTENING. Nobody sees a "left" notice for this.
    return () => {
      cancelled = true;
      socket.off("new_message", onNewMessage);
      socket.off("typing", onTyping);
      socket.off("user_offline", onUserOffline);
      socket.off("user_updated", onUserUpdated);
      if (socket.connected) socket.emit("leave_room", { roomId });
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
      setTyping({});
    };
  }, [socket, connected, roomId, removeTyping]);

  // "Load older messages": ask for messages before the oldest one we have
  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || !messages.length) return;
    loadingOlder.current = true;
    try {
      const res = await api(`/rooms/${roomId}/messages?before=${messages[0].id}`);
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...res.messages.filter((m) => !have.has(m.id)), ...prev];
      });
      setHasMore(res.hasMore);
    } finally {
      loadingOlder.current = false;
    }
  }, [messages, roomId]);

  const typingUsers = Object.entries(typing).map(([id, name]) => ({ id, name }));

  return { messages, hasMore, loadOlder, typingUsers, status, error };
}
