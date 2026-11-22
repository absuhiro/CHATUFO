import { useMemo } from "react";
import { useSocket } from "../context/SocketContext";

// A Set of ids of everyone online right now, for quick "is X online?" checks
export function useOnlineIds() {
  const { onlineUsers } = useSocket();
  return useMemo(() => new Set(onlineUsers.map((u) => u.id)), [onlineUsers]);
}
