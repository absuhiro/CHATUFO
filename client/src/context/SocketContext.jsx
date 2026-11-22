import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

// One shared Socket.io connection for the whole app, plus the online users list.
// It connects when you log in and disconnects when you log out.
const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]); // [{ id, name, avatarUrl }]

  useEffect(() => {
    if (!token) return;

    // No URL: connects to the same address as the page. Vite's proxy forwards it to :5000.
    const s = io({ auth: { token } });

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", (err) => {
      setConnected(false);
      // Server rejected our token (expired or invalid): log out
      if (/token|User not found/i.test(err.message)) logout();
    });

    // ----- Online users -----
    const sortByName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
    s.on("online_users", (users) => setOnlineUsers(sortByName(users)));
    s.on("user_online", (user) =>
      setOnlineUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : sortByName([...prev, user])))
    );
    s.on("user_offline", ({ id }) => setOnlineUsers((prev) => prev.filter((u) => u.id !== id)));
    // Someone changed their name or photo (Step 8)
    s.on("user_updated", (card) =>
      setOnlineUsers((prev) => sortByName(prev.map((u) => (u.id === card.id ? { ...u, ...card } : u))))
    );

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setOnlineUsers([]);
    };
  }, [token, logout]);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineUsers }}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
