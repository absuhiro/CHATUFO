const mongoose = require("mongoose");
const Message = require("../models/Message");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Get a page of messages for a room, oldest first (the order a chat screen shows them).
 *   roomId  the room
 *   before  optional message id: only return messages older than this one
 *   limit   how many (default 50, max 100)
 * Returns { messages, hasMore } where hasMore says if even older messages exist.
 */
async function getMessages(roomId, { before, limit } = {}) {
  const size = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const filter = { room: roomId };
  if (before) filter._id = { $lt: new mongoose.Types.ObjectId(before) };

  // Newest first so limit() keeps the most recent ones. Fetch one extra to know if there's more.
  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(size + 1)
    .populate("sender", "name avatarUrl");

  const hasMore = docs.length > size;
  const page = docs.slice(0, size).reverse(); // back to oldest first

  return { messages: page.map((m) => m.toPublic()), hasMore };
}

module.exports = { getMessages };
