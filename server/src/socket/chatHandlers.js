const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");
const { getMessages } = require("../services/messages");
const User = require("../models/User");
const { stopTyping } = require("./typingHandlers");
const { check } = require("../services/e2ee");
const { markRead } = require("../services/conversations");

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
      const { messages, hasMore } = await getMessages(room._id, { forUserId: user.id });
      ack({ ok: true, roomId: roomKey, messages, hasMore });

      // Opening a chat means you've read it (clears its unread count everywhere)
      await markRead(room._id, user.id);
      io.to(`user:${user.id}`).emit("conversation_read", { roomId: roomKey });
    } catch (err) {
      console.error(err);
      ack({ ok: false, error: "Server error" });
    }
  });

  // mark_read: the app is open on this chat and a new message arrived, so it's read.
  // Only for chats this socket is listening to.
  socket.on("mark_read", async (data) => {
    try {
      const roomId = data && data.roomId;
      if (typeof roomId !== "string" || !socket.rooms.has(roomId)) return;
      await markRead(roomId, user.id);
      io.to(`user:${user.id}`).emit("conversation_read", { roomId });
    } catch (err) {
      console.error(err);
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

  // send_message: { roomId, ciphertext, iv, signature, keys: { userId: lockedKey } }
  // The message is already encrypted in the sender's browser. The server can't read it:
  // it only checks the shape, saves it, and passes it on.
  socket.on("send_message", async (data, ack) => {
    ack = safeAck(ack);
    try {
      const { roomId, ciphertext, iv, signature, keys } = data || {};

      // Must have joined the socket room first (cheap check, no database)
      if (typeof roomId !== "string" || !socket.rooms.has(roomId)) {
        return ack({ ok: false, error: "Join the room before sending" });
      }
      if (!check("ciphertext", ciphertext) || !check("iv", iv) || !check("signature", signature)) {
        return ack({ ok: false, error: "Messages must be end-to-end encrypted" });
      }
      if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
        return ack({ ok: false, error: "Missing message keys" });
      }

      // Still a member? (they might have left through the REST route)
      const { room, error } = await getRoomIfMember(roomId);
      if (error) return ack({ ok: false, error });

      // Every member who has encryption set up must get a locked key, and nobody else.
      // If the list doesn't match (someone joined or left a moment ago), the app
      // reloads the member list and tries again.
      const withKeys = await User.find({ _id: { $in: room.members }, publicKey: { $exists: true, $ne: null } }).select("_id");
      const expected = new Set(withKeys.map((u) => String(u._id)));
      const given = Object.keys(keys);
      const sameMembers = given.length === expected.size && given.every((id) => expected.has(id));
      if (!sameMembers) {
        return ack({ ok: false, code: "members_changed", error: "The member list changed. Retrying..." });
      }
      if (!given.every((id) => check("lockedKey", keys[id]))) {
        return ack({ ok: false, error: "Invalid message keys" });
      }

      const message = await Message.create({
        room: roomId,
        type: "encrypted",
        sender: user.id,
        ciphertext,
        iv,
        signature,
        keys,
      });
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
