const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");
const { getMessages } = require("../services/messages");

// Every event takes an optional "ack" callback so the client finds out if it worked:
//   socket.emit("join_room", { roomId }, (res) => console.log(res))
// res is { ok: true, ... } or { ok: false, error: "..." }
function safeAck(ack) {
  return typeof ack === "function" ? ack : () => {};
}

function registerChatHandlers(io, socket) {
  const user = socket.data.user;

  // Checks the room exists and the user is a member (joined via POST /api/rooms/:id/join)
  async function getRoomIfMember(roomId) {
    if (typeof roomId !== "string" || !mongoose.isValidObjectId(roomId)) {
      return { error: "Invalid room id" };
    }
    const room = await Room.findById(roomId);
    if (!room) return { error: "Room not found" };
    const isMember = room.members.some((m) => String(m) === String(user.id));
    if (!isMember) return { error: "Join the room first" };
    return { room };
  }

  // join_room: start receiving live messages for this room
  socket.on("join_room", async (data, ack) => {
    ack = safeAck(ack);
    try {
      const { room, error } = await getRoomIfMember(data && data.roomId);
      if (error) return ack({ ok: false, error });

      const roomKey = String(room._id);
      // Already listening (e.g. rejoining after a reconnect)? Don't announce again.
      const alreadyIn = socket.rooms.has(roomKey);
      socket.join(roomKey);

      // Step 4: send the latest messages back with the reply
      const { messages, hasMore } = await getMessages(room._id);
      ack({ ok: true, roomId: roomKey, messages, hasMore });

      // Tell everyone else in the room
      if (!alreadyIn) socket.to(roomKey).emit("user_joined", { roomId: roomKey, user });
    } catch (err) {
      console.error(err);
      ack({ ok: false, error: "Server error" });
    }
  });

  // leave_room: stop receiving live messages for this room
  socket.on("leave_room", (data, ack) => {
    ack = safeAck(ack);
    const roomId = data && data.roomId;
    if (typeof roomId !== "string") return ack({ ok: false, error: "Invalid room id" });

    socket.leave(roomId);
    socket.to(roomId).emit("user_left", { roomId, user });
    ack({ ok: true });
  });

  // send_message: save to MongoDB, then broadcast to everyone in the room
  socket.on("send_message", async (data, ack) => {
    ack = safeAck(ack);
    try {
      const roomId = data && data.roomId;
      const text = data && typeof data.text === "string" ? data.text.trim() : "";

      if (!text) return ack({ ok: false, error: "Message cannot be empty" });
      if (text.length > 2000) return ack({ ok: false, error: "Message is too long (max 2000)" });

      // Must have joined the socket room first (cheap check, no database)
      if (typeof roomId !== "string" || !socket.rooms.has(roomId)) {
        return ack({ ok: false, error: "Join the room before sending" });
      }
      // Still a member? (they might have left through the REST route)
      const { error } = await getRoomIfMember(roomId);
      if (error) return ack({ ok: false, error });

      const message = await Message.create({ room: roomId, sender: user.id, text });
      const payload = message.toPublic(user);

      // io.to = everyone in the room INCLUDING the sender
      io.to(roomId).emit("new_message", payload);
      ack({ ok: true, message: payload });
    } catch (err) {
      console.error(err);
      ack({ ok: false, error: "Server error" });
    }
  });
}

module.exports = registerChatHandlers;
