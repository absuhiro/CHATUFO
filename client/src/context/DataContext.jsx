import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../utils/api";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

// The app's shared lists: friends, requests, room invites, your rooms and DMs, and unread dots.
// The server sends small "something changed" signals over the socket, and this refetches.
const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user, setUser } = useAuth();
  const { socket, connected } = useSocket();

  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]); // friend requests sent to you
  const [outgoing, setOutgoing] = useState([]); // friend requests you sent
  const [invites, setInvites] = useState([]); // room invites for you
  const [rooms, setRooms] = useState([]);
  const [dms, setDms] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(() => new Set()); // room/DM ids with new messages

  // Which room is open right now (a ref, because the socket listener needs the latest value)
  const activeRoomId = useRef(null);
  const dmsRef = useRef(dms);
  dmsRef.current = dms;

  const loadFriends = useCallback(async () => {
    const data = await api("/friends");
    setFriends(data.friends);
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }, []);
  const loadInvites = useCallback(async () => setInvites((await api("/invites")).invites), []);
  const loadRooms = useCallback(async () => setRooms((await api("/rooms")).rooms), []);
  const loadDms = useCallback(async () => setDms((await api("/dms")).dms), []);

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([loadFriends(), loadInvites(), loadRooms(), loadDms()]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoaded(true);
    }
  }, [loadFriends, loadInvites, loadRooms, loadDms]);

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
    setRooms([]);
    setDms([]);
    setUnread(new Set());
    setLoaded(false);
  }, [user]);

  // Server signals
  useEffect(() => {
    if (!socket || !user) return;
    const safe = (fn) => () => fn().catch(console.error);
    const onFriends = safe(loadFriends);
    const onInvites = safe(loadInvites);
    const onRooms = () => {
      loadRooms().catch(console.error);
      loadDms().catch(console.error);
    };
    const onActivity = ({ roomId, type, senderId }) => {
      // A DM we haven't listed yet (someone messaged us first), or a DM that should move to the top
      if (type === "dm") loadDms().catch(console.error);
      if (senderId !== user.id && roomId !== activeRoomId.current) {
        setUnread((prev) => (prev.has(roomId) ? prev : new Set(prev).add(roomId)));
      }
    };
    // Someone changed their name or photo: refresh lists that show people
    const onUserUpdated = (card) => {
      if (card.id === user.id) setUser((me) => (me ? { ...me, ...card } : me)); // you, in another tab
      loadFriends().catch(console.error);
      loadDms().catch(console.error);
      loadInvites().catch(console.error);
    };
    socket.on("friends_changed", onFriends);
    socket.on("user_updated", onUserUpdated);
    socket.on("invites_changed", onInvites);
    socket.on("rooms_changed", onRooms);
    socket.on("room_activity", onActivity);
    return () => {
      socket.off("friends_changed", onFriends);
      socket.off("user_updated", onUserUpdated);
      socket.off("invites_changed", onInvites);
      socket.off("rooms_changed", onRooms);
      socket.off("room_activity", onActivity);
    };
  }, [socket, user, setUser, loadFriends, loadInvites, loadRooms, loadDms]);

  // Browser tab title shows how many chats have unread messages, e.g. "(2) UFOCHAT"
  useEffect(() => {
    const count = unread.size + incoming.length + invites.length;
    document.title = count ? `(${count}) UFOCHAT` : "UFOCHAT";
  }, [unread, incoming, invites]);

  // ChatPage calls this when a room opens (id) and closes (null)
  const setActiveRoom = useCallback((roomId) => {
    activeRoomId.current = roomId;
    if (roomId) {
      setUnread((prev) => {
        if (!prev.has(roomId)) return prev;
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    }
  }, []);

  // Open (or create) the DM with a friend, returns its room id
  const openDm = useCallback(
    async (userId) => {
      const { dm } = await api("/dms", { method: "POST", body: { userId } });
      if (!dmsRef.current.some((d) => d.id === dm.id)) await loadDms();
      return dm.id;
    },
    [loadDms]
  );

  const value = useMemo(
    () => ({
      friends, incoming, outgoing, invites, rooms, dms, loaded, unread,
      loadFriends, loadInvites, loadRooms, loadDms, setActiveRoom, openDm,
    }),
    [friends, incoming, outgoing, invites, rooms, dms, loaded, unread,
      loadFriends, loadInvites, loadRooms, loadDms, setActiveRoom, openDm]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
