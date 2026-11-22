const Friendship = require("../models/Friendship");

async function areFriends(a, b) {
  const f = await Friendship.findOne({ pairKey: Friendship.pairKeyFor(a, b), status: "accepted" });
  return !!f;
}

// Ids (as strings) of everyone this user is friends with
async function getFriendIds(userId) {
  const list = await Friendship.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  });
  return list.map((f) => (String(f.requester) === String(userId) ? String(f.recipient) : String(f.requester)));
}

module.exports = { areFriends, getFriendIds };
