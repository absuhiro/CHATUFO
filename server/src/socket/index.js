const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const registerChatHandlers = require("./chatHandlers");
const presence = require("./presence");

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });

  // Socket "login check". Runs once when a client connects, before any events.
  // The client sends its JWT like: io(URL, { auth: { token } })
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error("No token provided"));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.id);
      if (!user) return next(new Error("User not found"));

      // Saved on the socket so every event handler knows who is talking
      socket.data.user = { ...user.toPublic(), id: String(user._id) };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    console.log(`🛸 ${user.name} connected (${socket.id})`);

    // ----- Presence (Step 5) -----
    const cameOnline = presence.addConnection(user, socket.id);
    // Tell everyone else, but only on the user's first tab (no repeat alerts for extra tabs)
    if (cameOnline) socket.broadcast.emit("user_online", user);
    // Give this new connection the full current list
    socket.emit("online_users", presence.getOnlineUsers());

    // Client can ask for the list again any time
    socket.on("get_online_users", (ack) => {
      if (typeof ack === "function") ack({ ok: true, users: presence.getOnlineUsers() });
    });

    registerChatHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`👋 ${user.name} disconnected (${reason})`);
      const wentOffline = presence.removeConnection(user.id, socket.id);
      // Only announce when their LAST tab closes
      if (wentOffline) socket.broadcast.emit("user_offline", { id: user.id });
    });
  });

  return io;
}

module.exports = initSocket;
