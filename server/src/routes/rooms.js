const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Message = require("../models/Message");
const User = require("../models/User");
const RoomInvite = require("../models/RoomInvite");
const { requireAuth } = require("../middleware/auth");
const { getMessages, postSystemMessage } = require("../services/messages");
const { areFriends } = require("../services/friends");
const { notifyUsers } = require("../services/notify");
const presence = require("../socket/presence");

const router = express.Router();

// Every room route needs a logged in user
router.use(requireAuth);

const isStr = (v) => typeof v === "string";
const fail = (res, err) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
};

// Runs for any route with :id. Loads the room into req.room, and only lets MEMBERS through.
// Non-members get 404 (not 403) so private rooms don't reveal that they exist.
router.param("id", async (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid room id" });
  }
  try {
    const room = await Room.findById(id);
    if (!room || !room.isMember(req.userId)) return res.status(404).json({ message: "Room not found" });
    req.room = room;
    next();
  } catch (err) {
    next(err);
  }
});

// GET /api/rooms   the group rooms YOU are in (rooms are invite-only, so there's no public list)
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({ type: "group", members: req.userId }).sort({ createdAt: 1 });
    res.json({ rooms: rooms.map((r) => r.toPublic()) });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/rooms  { name, description? }  create a room, you're its first member
router.post("/", async (req, res) => {
  try {
    const { name, description = "" } = req.body || {};
    if (!isStr(name) || name.trim().length < 2 || name.trim().length > 40) {
      return res.status(400).json({ message: "Room name must be 2 to 40 characters" });
    }
    if (!isStr(description) || description.length > 200) {
      return res.status(400).json({ message: "Description must be under 200 characters" });
    }

    const room = await Room.create({
      type: "group",
      name: name.trim(),
      description: description.trim(),
      createdBy: req.userId,
      members: [req.userId],
    });
    notifyUsers(req, [req.userId], "rooms_changed");
    res.status(201).json({ room: room.toPublic() });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/rooms/:id   one room (group or DM) with its members and their online status
router.get("/:id", async (req, res) => {
  try {
    await req.room.populate("members", "name username avatarUrl bio");
    res.json({
      room: {
        ...req.room.toPublic(),
        members: req.room.members
          .filter(Boolean)
          .map((m) => ({ ...m.toCard(), online: presence.isOnline(m._id) })),
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/rooms/:id/messages?before=<messageId>&limit=50   history, oldest first
router.get("/:id/messages", async (req, res) => {
  try {
    const { before, limit } = req.query;
    if (before !== undefined && (!isStr(before) || !mongoose.isValidObjectId(before))) {
      return res.status(400).json({ message: "Invalid 'before' id" });
    }
    res.json(await getMessages(req.room._id, { before, limit }));
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/rooms/:id/leave   really leave (this is what posts "X left the room")
router.post("/:id/leave", async (req, res) => {
  try {
    const room = req.room;
    if (room.type !== "group") return res.status(400).json({ message: "You can't leave a DM" });

    const io = req.app.get("io");
    const roomKey = String(room._id);
    const updated = await Room.findByIdAndUpdate(room._id, { $pull: { members: req.userId } }, { new: true });

    // Stop this user's open tabs from receiving the room's messages
    if (io) io.in(`user:${req.userId}`).socketsLeave(roomKey);
    // The leaver and everyone still inside refresh their room lists and member counts
    notifyUsers(req, [req.userId, ...updated.members], "rooms_changed");

    if (updated.members.length === 0) {
      // Last one out: remove the room and everything in it
      await Promise.all([
        Message.deleteMany({ room: room._id }),
        RoomInvite.deleteMany({ room: room._id }),
        updated.deleteOne(),
      ]);
    } else {
      const me = await User.findById(req.userId);
      await postSystemMessage(io, room._id, `${me ? me.name : "Someone"} left the room`);
      if (io) io.to(roomKey).emit("room_updated", { roomId: roomKey });
    }
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/rooms/:id/invites   who has a pending invite (so the invite screen can show "Invited")
router.get("/:id/invites", async (req, res) => {
  try {
    const invites = await RoomInvite.find({ room: req.room._id });
    res.json({ invitedUserIds: invites.map((i) => String(i.to)) });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/rooms/:id/invites  { userId }   invite one of your friends
router.post("/:id/invites", async (req, res) => {
  try {
    const room = req.room;
    const { userId } = req.body || {};
    if (room.type !== "group") return res.status(400).json({ message: "You can't invite people to a DM" });
    if (!isStr(userId) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (room.isMember(userId)) return res.status(409).json({ message: "They're already in this room" });
    if (!(await areFriends(req.userId, userId))) {
      return res.status(403).json({ message: "You can only invite your friends" });
    }

    await RoomInvite.create({ room: room._id, from: req.userId, to: userId });
    notifyUsers(req, [userId], "invites_changed");
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Already invited" });
    fail(res, err);
  }
});

module.exports = router;
