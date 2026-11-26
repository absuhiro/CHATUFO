import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { decryptMessage } from "../crypto/e2ee";
import { getPublicKeys } from "../crypto/publicKeys";

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
 *
 * Encrypted messages are decrypted here, before they reach the screen. Each one gets:
 *   text      the decrypted text
 *   e2ee      "ok" | "no-key" (sent before you joined) | "failed" (damaged or tampered with)
 *   verified  true if the sender's signature checks out, false if it doesn't, null if unknown
 */

// Sort by id: ids grow over time, so this is the order messages were sent
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function useRoomChat(roomId) {
  const { socket, connected } = useSocket();
  const { user, keys } = useAuth();
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

  // Decrypt a batch of messages (system notices pass straight through)
  const decryptAll = useCallback(
    async (list) => {
      const senderIds = list.filter((m) => m.type === "encrypted" && m.sender?.id).map((m) => m.sender.id);
      const senderKeys = senderIds.length ? await getPublicKeys(senderIds).catch(() => new Map()) : new Map();
      return Promise.all(
        list.map(async (msg) => {
          if (msg.type !== "encrypted") return msg;
          const result = await decryptMessage({
            msg,
            myId: user.id,
            decryptKey: keys.decryptKey,
            verifyKey: senderKeys.get(msg.sender?.id)?.verifyKey,
          });
          // Drop the scrambled fields once decrypted: nothing else needs them
          const { ciphertext, iv, signature, keys: _locked, ...rest } = msg;
          return { ...rest, text: result.text || "", e2ee: result.status, verified: result.verified ?? null };
        })
      );
    },
    [user.id, keys]
  );

  useEffect(() => {
    if (!socket || !connected || !roomId) return;
    let cancelled = false;

    setStatus((s) => (s === "ready" ? s : "loading"));
    socket.emit("join_room", { roomId }, async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setStatus("error");
        setError(res.error);
        return;
      }
      const decrypted = await decryptAll(res.messages);
      if (cancelled) return;
      // Keep any live message that arrived while we were decrypting
      setMessages((prev) => {
        const ids = new Set(decrypted.map((m) => m.id));
        return [...decrypted, ...prev.filter((m) => !ids.has(m.id) && m.id > (decrypted.at(-1)?.id || ""))].sort(byId);
      });
      setHasMore(res.hasMore);
      setStatus("ready");
    });

    const onNewMessage = async (msg) => {
      if (msg.roomId !== roomId) return;
      if (msg.sender) removeTyping(msg.sender.id); // they sent it, so they've stopped typing
      // You're looking at this chat, so someone else's new message counts as read straight away
      if (msg.sender && msg.sender.id !== user.id) socket.emit("mark_read", { roomId });
      const [ready] = await decryptAll([msg]);
      if (cancelled) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === ready.id)) return prev;
        const next = [...prev, ready];
        // Decrypting takes a moment, so two quick messages could finish out of order: re-sort if needed
        return prev.length && prev[prev.length - 1].id > ready.id ? next.sort(byId) : next;
      });
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
  }, [socket, connected, roomId, removeTyping, decryptAll, user.id]);

  // "Load older messages": ask for messages before the oldest one we have
  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || !messages.length) return;
    loadingOlder.current = true;
    try {
      const res = await api(`/rooms/${roomId}/messages?before=${messages[0].id}`);
      const older = await decryptAll(res.messages);
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !have.has(m.id)), ...prev];
      });
      setHasMore(res.hasMore);
    } finally {
      loadingOlder.current = false;
    }
  }, [messages, roomId, decryptAll]);

  const typingUsers = Object.entries(typing).map(([id, name]) => ({ id, name }));

  return { messages, hasMore, loadOlder, typingUsers, status, error };
}
