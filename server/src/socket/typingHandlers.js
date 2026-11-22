// Typing indicator (Step 6)
//
// The server never stores typing state in MongoDB. It just passes the signal on:
//   client A: "typing_start"  ->  server  ->  everyone else in the room: "typing" { isTyping: true }
//   client A: "typing_stop"   ->  server  ->  everyone else in the room: "typing" { isTyping: false }
//
// Each socket remembers which rooms it is typing in (socket.data.typingIn), so the
// server can send a "stopped" signal by itself when the user sends a message,
// leaves the room, or closes the tab mid-sentence.

function emitTyping(socket, roomId, isTyping) {
  socket.to(roomId).emit("typing", { roomId, user: socket.data.user, isTyping });
}

// Clear typing for one room (used after sending a message or leaving)
function stopTyping(socket, roomId) {
  if (socket.data.typingIn && socket.data.typingIn.delete(roomId)) {
    emitTyping(socket, roomId, false);
  }
}

function registerTypingHandlers(io, socket) {
  socket.data.typingIn = new Set();

  socket.on("typing_start", (data) => {
    const roomId = data && data.roomId;
    // Only rooms this socket has joined, so nobody can spam rooms they're not in
    if (typeof roomId !== "string" || !socket.rooms.has(roomId)) return;

    socket.data.typingIn.add(roomId);
    // Sent every time (not just the first) so clients can refresh their auto-expiry timer
    emitTyping(socket, roomId, true);
  });

  socket.on("typing_stop", (data) => {
    const roomId = data && data.roomId;
    if (typeof roomId !== "string") return;
    stopTyping(socket, roomId);
  });

  // "disconnecting" runs just BEFORE the socket leaves its rooms, so we can still reach them
  socket.on("disconnecting", () => {
    for (const roomId of socket.data.typingIn) emitTyping(socket, roomId, false);
    socket.data.typingIn.clear();
  });
}

module.exports = { registerTypingHandlers, stopTyping };
