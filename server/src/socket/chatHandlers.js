const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");
const { getMessages } = require("../services/messages");
const { stopTyping } = require("./typingHandlers");

// Every event takes an optional "ack" callback so the client finds out if it worked:
//   socket.emit("join_room", { roomId }, (res) => console.log(res))
// res is { ok: true, ... } or { ok: false, error: "..." }
function safeAck(ack) {
  return typeof ack === "function" ? ack : () => {};
}

function registerChatHandlers(io, socket) {
  const user = socket.data.user;

  // Checks the room exists and the user is a member (invite accepted, or one of the two people in a DM)
  async function getRoomIfMember(roomId) {
    if (typeof roomId !== "string" || !mongoose.isValidObjectId(roomId)) {
      return { error: "Invalid room id" };
    }
    const room = await Room.findById(roomId);
    if (!room) return { error: "Room not found" };
    const isMember = room.members.some((m) => String(m) === String(user.id));
    if (!isMember) return { error: "You're not a member of this room" };
    return { room };
  }

  // join_room: start receiving live messages for this room
  socket.on("join_room", async (data, ack) => {
    ack = safeAck(ack);
    try {
      const { room, error } = await getRoomIfMember(data && data.roomId);
      if (error) return ack({ ok: false, error });

      const roomKey = String(room._id);
      // Opening a room only means "listening". No announcement: "X joined the room"
      // is posted once, when someone accepts an invite (routes/invites.js).
      socket.join(roomKey);

      // Step 4: send the latest messages back with the reply
      const { messages, hasMore } = await getMessages(room._id);
      ack({ ok: true, roomId: roomKey, messages, hasMore });
    } catch (err) {
      console.error(err);
      ack({ ok: false, error: "Server error" });
    }
  });

  // leave_room: stop LISTENING to a room (switching rooms, closing the tab).
  // This is not leaving the room. Real leaving is POST /api/rooms/:id/leave.
  socket.on("leave_room", (data, ack) => {
    ack = safeAck(ack);
    const roomId = data && data.roomId;
    if (typeof roomId !== "string") return ack({ ok: false, error: "Invalid room id" });

    if (!socket.rooms.has(roomId)) return ack({ ok: true });

    stopTyping(socket, roomId); // Step 6: don't leave a "typing..." stuck behind
    socket.leave(roomId);
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
      const { room, error } = await getRoomIfMember(roomId);
      if (error) return ack({ ok: false, error });

      const message = await Message.create({ room: roomId, sender: user.id, text });
      const payload = message.toPublic(user);
      await Room.updateOne({ _id: roomId }, { lastMessageAt: message.createdAt });

      // Message sent, so they're no longer typing (Step 6)
      stopTyping(socket, roomId);

      // io.to = everyone in the room INCLUDING the sender
      io.to(roomId).emit("new_message", payload);

      // Also ping every member's personal channel, even if they're looking at another room.
      // Their app uses this for unread dots, and to show a brand new DM in the list.
      io.to(room.members.map((m) => `user:${m}`)).emit("room_activity", {
        roomId,
        type: room.type,
        senderId: user.id,
      });

      ack({ ok: true, message: payload });
    } catch (err) {
      console.error(err);
      ack({ ok: false, error: "Server error" });
    }
  });
}

module.exports = registerChatHandlers;
