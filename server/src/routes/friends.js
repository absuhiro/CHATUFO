const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Friendship = require("../models/Friendship");
const { requireAuth } = require("../middleware/auth");
const { notifyUsers } = require("../services/notify");

const router = express.Router();
router.use(requireAuth);

const fail = (res, err) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
};

// GET /api/friends
// -> { friends: [user], incoming: [{ id, user }], outgoing: [{ id, user }] }
router.get("/", async (req, res) => {
  try {
    const me = req.userId;
    const all = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] })
      .populate("requester", "name username avatarUrl bio")
      .populate("recipient", "name username avatarUrl bio");

    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const f of all) {
      if (!f.requester || !f.recipient) continue; // one side's account was deleted
      const iAmRequester = String(f.requester._id) === String(me);
      const other = (iAmRequester ? f.recipient : f.requester).toCard();
      if (f.status === "accepted") friends.push(other);
      else if (iAmRequester) outgoing.push({ id: String(f._id), user: other });
      else incoming.push({ id: String(f._id), user: other });
    }
    friends.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ friends, incoming, outgoing });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/friends/requests  { username }
router.post("/requests", async (req, res) => {
  try {
    const { username } = req.body || {};
    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ message: "Enter a username" });
    }
    const target = await User.findOne({ username: username.trim().toLowerCase().replace(/^@/, "") });
    if (!target) return res.status(404).json({ message: "No one has that username. Check the spelling." });
    if (String(target._id) === String(req.userId)) {
      return res.status(400).json({ message: "That's you! Try a friend's username." });
    }

    const pairKey = Friendship.pairKeyFor(req.userId, target._id);
    const existing = await Friendship.findOne({ pairKey });

    if (existing) {
      if (existing.status === "accepted") return res.status(409).json({ message: "You're already friends" });
      if (String(existing.requester) === String(req.userId)) {
        return res.status(409).json({ message: "Request already sent" });
      }
      // They already sent YOU a request: sending one back means yes
      existing.status = "accepted";
      await existing.save();
      notifyUsers(req, [req.userId, target._id], "friends_changed");
      return res.json({ status: "accepted", user: target.toCard() });
    }

    await Friendship.create({ requester: req.userId, recipient: target._id, pairKey });
    notifyUsers(req, [req.userId, target._id], "friends_changed");
    res.status(201).json({ status: "pending", user: target.toCard() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Request already exists" });
    fail(res, err);
  }
});

// Loads a request by id, rejecting bad ids and requests that don't involve you
async function loadRequest(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid request id" });
    return null;
  }
  const f = await Friendship.findById(id);
  const involved = f && [String(f.requester), String(f.recipient)].includes(String(req.userId));
  if (!f || !involved || f.status !== "pending") {
    res.status(404).json({ message: "Request not found" });
    return null;
  }
  return f;
}

// POST /api/friends/requests/:id/accept   (only the person who received it)
router.post("/requests/:id/accept", async (req, res) => {
  try {
    const f = await loadRequest(req, res);
    if (!f) return;
    if (String(f.recipient) !== String(req.userId)) {
      return res.status(403).json({ message: "Only the person invited can accept" });
    }
    f.status = "accepted";
    await f.save();
    notifyUsers(req, [f.requester, f.recipient], "friends_changed");
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// DELETE /api/friends/requests/:id   decline (recipient) or cancel (requester)
router.delete("/requests/:id", async (req, res) => {
  try {
    const f = await loadRequest(req, res);
    if (!f) return;
    await f.deleteOne();
    notifyUsers(req, [f.requester, f.recipient], "friends_changed");
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// DELETE /api/friends/:userId   remove a friend (your DM history is kept)
router.delete("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: "Invalid user id" });
    const f = await Friendship.findOneAndDelete({
      pairKey: Friendship.pairKeyFor(req.userId, userId),
      status: "accepted",
    });
    if (!f) return res.status(404).json({ message: "You're not friends" });
    notifyUsers(req, [req.userId, userId], "friends_changed");
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
