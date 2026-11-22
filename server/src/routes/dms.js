const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { areFriends } = require("../services/friends");

const router = express.Router();
router.use(requireAuth);

// The other person in a DM, as a public card
function dmCard(room, myId) {
  const other = room.members.find((m) => m && String(m._id) !== String(myId));
  return {
    ...room.toPublic(),
    user: other ? other.toCard() : { id: null, name: "Deleted user", username: "", avatarUrl: "" },
  };
}

// GET /api/dms   your DMs, most recent first
// A DM shows up for you once you opened it, or once the other person messaged you.
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({
      type: "dm",
      members: req.userId,
      $or: [{ createdBy: req.userId }, { lastMessageAt: { $exists: true } }],
    })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .populate("members", "name username avatarUrl bio");
    res.json({ dms: rooms.map((r) => dmCard(r, req.userId)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/dms  { userId }   open (or create) your DM with a friend
router.post("/", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (userId === String(req.userId)) return res.status(400).json({ message: "You can't DM yourself" });
    if (!(await User.exists({ _id: userId }))) return res.status(404).json({ message: "User not found" });

    const dmKey = Room.dmKeyFor(req.userId, userId);
    let room = await Room.findOne({ dmKey });
    if (!room) {
      // Only friends can START a DM. An existing DM stays usable after unfriending.
      if (!(await areFriends(req.userId, userId))) {
        return res.status(403).json({ message: "You can only message friends" });
      }
      try {
        room = await Room.create({ type: "dm", dmKey, createdBy: req.userId, members: [req.userId, userId] });
      } catch (err) {
        if (err.code !== 11000) throw err;
        room = await Room.findOne({ dmKey }); // both opened it at the same moment
      }
    }
    await room.populate("members", "name username avatarUrl bio");
    res.json({ dm: dmCard(room, req.userId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
