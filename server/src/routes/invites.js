const express = require("express");
const mongoose = require("mongoose");
const Room = require("../models/Room");
const User = require("../models/User");
const RoomInvite = require("../models/RoomInvite");
const { requireAuth } = require("../middleware/auth");
const { postSystemMessage } = require("../services/messages");
const { notifyUsers } = require("../services/notify");

const router = express.Router();
router.use(requireAuth);

const fail = (res, err) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
};

// GET /api/invites   room invites waiting for YOU
router.get("/", async (req, res) => {
  try {
    const invites = await RoomInvite.find({ to: req.userId })
      .sort({ createdAt: -1 })
      .populate("room")
      .populate("from", "name username avatarUrl bio");
    res.json({
      invites: invites
        .filter((i) => i.room && i.from) // room deleted or inviter gone
        .map((i) => ({
          id: String(i._id),
          room: i.room.toPublic(),
          from: i.from.toCard(),
          createdAt: i.createdAt,
        })),
    });
  } catch (err) {
    fail(res, err);
  }
});

async function loadInvite(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid invite id" });
    return null;
  }
  const invite = await RoomInvite.findById(req.params.id);
  if (!invite || String(invite.to) !== String(req.userId)) {
    res.status(404).json({ message: "Invite not found" });
    return null;
  }
  return invite;
}

// POST /api/invites/:id/accept   join the room (this is what posts "X joined the room")
router.post("/:id/accept", async (req, res) => {
  try {
    const invite = await loadInvite(req, res);
    if (!invite) return;
    await invite.deleteOne();

    const room = await Room.findOneAndUpdate(
      { _id: invite.room, type: "group" },
      { $addToSet: { members: req.userId } },
      { new: true }
    );
    if (!room) {
      notifyUsers(req, [req.userId], "invites_changed");
      return res.status(404).json({ message: "That room no longer exists" });
    }

    const io = req.app.get("io");
    const me = await User.findById(req.userId);
    await postSystemMessage(io, room._id, `${me.name} joined the room`);
    if (io) io.to(String(room._id)).emit("room_updated", { roomId: String(room._id) });
    notifyUsers(req, [req.userId], "invites_changed");
    // Everyone in the room (including the new member) refreshes their room list and member counts
    notifyUsers(req, room.members, "rooms_changed");
    res.json({ room: room.toPublic() });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/invites/:id/decline
router.post("/:id/decline", async (req, res) => {
  try {
    const invite = await loadInvite(req, res);
    if (!invite) return;
    await invite.deleteOne();
    notifyUsers(req, [req.userId], "invites_changed");
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
