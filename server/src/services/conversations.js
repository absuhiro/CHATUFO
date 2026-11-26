const Room = require("../models/Room");
const Message = require("../models/Message");

const MAX_UNREAD = 99; // the app shows "99+" past this, so no need to count further

/**
 * Everything the chat list needs, for one user: their rooms and DMs, newest activity first.
 * Each conversation has:
 *   - for DMs: the other person; for rooms: name, description, member count
 *   - lastMessage: still encrypted (with only this user's locked key). The browser decrypts the preview.
 *   - unreadCount: messages from others since this user last read the chat
 */
async function listConversations(userId) {
  const me = String(userId);
  const rooms = await Room.find({
    members: userId,
    // A DM shows up once you opened it, or once the other person messaged you
    $or: [{ type: "group" }, { createdBy: userId }, { lastMessageAt: { $exists: true } }],
  }).populate("members", "name username avatarUrl bio");

  const list = await Promise.all(
    rooms.map(async (room) => {
      const roomId = room._id;
      const readAt = room.readAt && room.readAt.get(me);

      const [last, unreadCount] = await Promise.all([
        Message.findOne({ room: roomId })
          .sort({ _id: -1 })
          .populate("sender", "name username avatarUrl"),
        Message.countDocuments(
          {
            room: roomId,
            type: "encrypted",
            sender: { $ne: userId },
            ...(readAt ? { createdAt: { $gt: readAt } } : {}),
          },
          { limit: MAX_UNREAD + 1 }
        ),
      ]);

      const base = room.toPublic();
      const conversation = {
        ...base,
        lastMessage: last ? last.toPublic(null, me) : null,
        unreadCount,
        // What to sort by: the last message, or when the chat was made
        activityAt: (last && last.createdAt) || room.lastMessageAt || room.createdAt,
      };
      if (room.type === "dm") {
        const other = room.members.find((m) => m && String(m._id) !== me);
        conversation.user = other ? other.toCard() : { id: null, name: "Deleted user", username: "", avatarUrl: "" };
      }
      return conversation;
    })
  );

  return list.sort((a, b) => new Date(b.activityAt) - new Date(a.activityAt));
}

// Remember that this user has read the chat up to now
function markRead(roomId, userId) {
  return Room.updateOne({ _id: roomId, members: userId }, { $set: { [`readAt.${userId}`]: new Date() } });
}

module.exports = { listConversations, markRead };
