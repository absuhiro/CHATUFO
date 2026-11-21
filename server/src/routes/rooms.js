const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const { requireAuth } = require("../middleware/auth");
const { getMessages } = require("../services/messages");
const presence = require("../socket/presence");

const router = express.Router();

// Every room route needs a logged in user
router.use(requireAuth);

const isStr = (v) => typeof v === "string";

// Runs for any route with :id. Rejects bad ids and loads the room into req.room.
router.param("id", async (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid room id" });
  }
  try {
    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    req.room = room;
    next();
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms  list all rooms, newest first
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json({ rooms: rooms.map((r) => r.toPublic(req.userId)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/rooms  { name, description? }  create a room (creator joins automatically)
router.post("/", async (req, res) => {
  try {
    const { name, description = "" } = req.body || {};
    if (!isStr(name) || name.trim().length < 2 || name.trim().length > 40) {
      return res.status(400).json({ message: "Room name must be 2 to 40 characters" });
    }
    if (!isStr(description) || description.length > 200) {
      return res.status(400).json({ message: "Description must be under 200 characters" });
    }

    const cleanName = name.trim();
    const exists = await Room.findOne({ nameLower: cleanName.toLowerCase() });
    if (exists) return res.status(409).json({ message: "A room with that name already exists" });

    const room = await Room.create({
      name: cleanName,
      nameLower: cleanName.toLowerCase(),
      description: description.trim(),
      createdBy: req.userId,
      members: [req.userId],
    });

    res.status(201).json({ room: room.toPublic(req.userId) });
  } catch (err) {
    // 11000 = duplicate key (two people created the same name at the same moment)
    if (err.code === 11000) {
      return res.status(409).json({ message: "A room with that name already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/rooms/:id  one room with its member names and avatars
router.get("/:id", async (req, res) => {
  try {
    await req.room.populate("members", "name avatarUrl");
    res.json({
      room: {
        ...req.room.toPublic(req.userId),
        members: req.room.members.map((m) => ({
          id: m._id,
          name: m.name,
          avatarUrl: m.avatarUrl,
          online: presence.isOnline(m._id), // Step 5
        })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/rooms/:id/messages?before=<messageId>&limit=50
// Message history, oldest first. Use "before" with the oldest id you have to load earlier messages.
router.get("/:id/messages", async (req, res) => {
  try {
    const isMember = req.room.members.some((m) => String(m) === String(req.userId));
    if (!isMember) return res.status(403).json({ message: "Join the room to see messages" });

    const { before, limit } = req.query;
    if (before !== undefined && (typeof before !== "string" || !mongoose.isValidObjectId(before))) {
      return res.status(400).json({ message: "Invalid 'before' id" });
    }

    const result = await getMessages(req.room._id, { before, limit });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/rooms/:id/join
router.post("/:id/join", async (req, res) => {
  try {
    // $addToSet only adds the user if they are not already a member
    const room = await Room.findByIdAndUpdate(
      req.room._id,
      { $addToSet: { members: req.userId } },
      { new: true }
    );
    res.json({ room: room.toPublic(req.userId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/rooms/:id/leave
router.post("/:id/leave", async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(
      req.room._id,
      { $pull: { members: req.userId } },
      { new: true }
    );
    res.json({ room: room.toPublic(req.userId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
