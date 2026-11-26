import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../utils/api";
import { decryptMessage } from "../crypto/e2ee";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

// The app's shared lists: friends, requests, room invites, and your conversations (rooms + DMs).
// The server sends small "something changed" signals over the socket, and this refetches.
const DataContext = createContext(null);

// Turn a conversation's encrypted last message into a short preview, in this browser
async function buildPreview(msg, me, keys) {
  if (!msg) return null;
  if (msg.type === "system") return { text: msg.text, system: true };
  const fromMe = msg.sender?.id === me;
  const who = fromMe ? "You" : msg.sender?.name?.split(" ")[0];
  if (msg.type !== "encrypted") return { text: msg.text || "", who, fromMe };
  const result = await decryptMessage({ msg, myId: me, decryptKey: keys.decryptKey });
  if (result.status !== "ok") return { text: "🔒 Encrypted message", who, fromMe, locked: true };
  return { text: result.text.replace(/\s+/g, " "), who, fromMe };
}

export function DataProvider({ children }) {
  const { user, keys, setUser } = useAuth();
  const { socket, connected } = useSocket();

  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]); // friend requests sent to you
  const [outgoing, setOutgoing] = useState([]); // friend requests you sent
  const [invites, setInvites] = useState([]); // room invites for you
  const [conversations, setConversations] = useState([]); // rooms + DMs, newest first
  const [loaded, setLoaded] = useState(false);

  // Which chat is open right now (a ref, because socket listeners need the latest value)
  const activeRoomId = useRef(null);
  const reloadTimer = useRef(null);

  const loadFriends = useCallback(async () => {
    const data = await api("/friends");
    setFriends(data.friends);
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }, []);

  const loadInvites = useCallback(async () => setInvites((await api("/invites")).invites), []);

  const loadConversations = useCallback(async () => {
    if (!user || !keys) return;
    const { conversations } = await api("/conversations");
    const withPreviews = await Promise.all(
      conversations.map(async (c) => ({
        ...c,
        preview: await buildPreview(c.lastMessage, user.id, keys).catch(() => null),
        // The chat you're looking at is always read
        unreadCount: c.id === activeRoomId.current ? 0 : c.unreadCount,
        lastMessage: undefined,
      }))
    );
    setConversations(withPreviews);
  }, [user, keys]);

  // Many signals can arrive at once (a busy room): wait a moment and reload just once
  const scheduleConversations = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => loadConversations().catch(console.error), 250);
  }, [loadConversations]);

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadFriends(), loadInvites(), loadConversations()]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoaded(true);
    }
  }, [loadFriends, loadInvites, loadConversations]);

  // Load everything after login, and again after every reconnect (we may have missed signals)
  useEffect(() => {
    if (user && connected) loadAll();
  }, [user, connected, loadAll]);

  // Clear everything on logout
  useEffect(() => {
    if (user) return;
    setFriends([]);
    setIncoming([]);
    setOutgoing([]);
    setInvites([]);
    setConversations([]);
    setLoaded(false);
  }, [user]);

  // Server signals
  useEffect(() => {
    if (!socket || !user) return;
    const safe = (fn) => () => fn().catch(console.error);
    const onFriends = safe(loadFriends);
    const onInvites = safe(loadInvites);
    const onRooms = () => scheduleConversations();
    // A message in any of your chats: refresh previews, order and unread counts
    const onActivity = () => scheduleConversations();
    // You read a chat (maybe in another tab): clear its count
    const onRead = ({ roomId }) =>
      setConversations((prev) => prev.map((c) => (c.id === roomId ? { ...c, unreadCount: 0 } : c)));
    // Someone changed their name or photo: refresh lists that show people
    const onUserUpdated = (card) => {
      if (card.id === user.id) setUser((me) => (me ? { ...me, ...card } : me)); // you, in another tab
      loadFriends().catch(console.error);
      loadInvites().catch(console.error);
      scheduleConversations();
    };
    socket.on("friends_changed", onFriends);
    socket.on("invites_changed", onInvites);
    socket.on("rooms_changed", onRooms);
    socket.on("room_activity", onActivity);
    socket.on("conversation_read", onRead);
    socket.on("user_updated", onUserUpdated);
    return () => {
      socket.off("friends_changed", onFriends);
      socket.off("invites_changed", onInvites);
      socket.off("rooms_changed", onRooms);
      socket.off("room_activity", onActivity);
      socket.off("conversation_read", onRead);
      socket.off("user_updated", onUserUpdated);
    };
  }, [socket, user, setUser, loadFriends, loadInvites, scheduleConversations]);

  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  // Browser tab title shows unread chats + pending requests, e.g. "(3) UFOCHAT"
  const unreadChats = conversations.filter((c) => c.unreadCount > 0).length;
  useEffect(() => {
    const count = unreadChats + incoming.length + invites.length;
    document.title = count ? `(${count}) UFOCHAT` : "UFOCHAT";
  }, [unreadChats, incoming, invites]);

  // ChatPage calls this when a chat opens (id) and closes (null)
  const setActiveRoom = useCallback((roomId) => {
    activeRoomId.current = roomId;
    if (roomId) setConversations((prev) => prev.map((c) => (c.id === roomId ? { ...c, unreadCount: 0 } : c)));
  }, []);

  // Open (or create) the DM with a friend, returns its room id
  const openDm = useCallback(
    async (userId) => {
      const { dm } = await api("/dms", { method: "POST", body: { userId } });
      await loadConversations();
      return dm.id;
    },
    [loadConversations]
  );

  const value = useMemo(
    () => ({
      friends, incoming, outgoing, invites, conversations, loaded, unreadChats,
      loadFriends, loadInvites, loadConversations, setActiveRoom, openDm,
    }),
    [friends, incoming, outgoing, invites, conversations, loaded, unreadChats,
      loadFriends, loadInvites, loadConversations, setActiveRoom, openDm]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
