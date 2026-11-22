const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const presence = require("../socket/presence");

const router = express.Router();

const isStr = (v) => typeof v === "string";
const fail = (res, err) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
};

// Only real photo formats. SVG is NOT allowed: it can contain scripts.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_AVATAR_BYTES = 512 * 1024; // 512 KB after decoding (the app sends ~30 KB)

/**
 * After a profile change, tell everyone and fix up live data:
 *  - the user's open sockets (so new messages and typing use the new name/photo)
 *  - the online list
 *  - every connected client gets "user_updated" so names and avatars refresh on screen
 */
async function broadcastProfile(req, user) {
  const io = req.app.get("io");
  const card = user.toCard();
  presence.updateUser(card);
  if (!io) return;
  const sockets = await io.in(`user:${card.id}`).fetchSockets();
  for (const s of sockets) s.data.user = card;
  io.emit("user_updated", card);
}

// ---------- Public: avatar images ----------

// GET /api/users/:id/avatar   the image itself (no login needed, so <img> tags can load it)
router.get("/:id/avatar", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const user = await User.findById(req.params.id).select("+avatar");
    if (!user || !user.avatar || !user.avatar.data) return res.status(404).end();
    res.set({
      "Content-Type": user.avatar.contentType,
      // Safe to cache for a long time: a new upload gets a new "?v=" URL
      "Cache-Control": "public, max-age=31536000, immutable",
      // Stop browsers guessing the file type
      "X-Content-Type-Options": "nosniff",
    });
    res.send(user.avatar.data);
  } catch (err) {
    fail(res, err);
  }
});

// ---------- Everything below needs a login ----------
router.use(requireAuth);

// PATCH /api/users/me   { name?, username?, bio? }
router.patch("/me", async (req, res) => {
  try {
    const { name, username, bio } = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name !== undefined) {
      if (!isStr(name) || name.trim().length < 2 || name.trim().length > 50) {
        return res.status(400).json({ message: "Display name must be 2 to 50 characters" });
      }
      user.name = name.trim();
    }

    if (username !== undefined) {
      const clean = isStr(username) ? username.trim().toLowerCase() : "";
      if (!User.USERNAME_RE.test(clean)) {
        return res.status(400).json({
          message: "Username must be 3 to 20 characters: letters, numbers, dots or underscores",
        });
      }
      if (clean !== user.username && (await User.exists({ username: clean }))) {
        return res.status(409).json({ message: "That username is taken" });
      }
      user.username = clean;
    }

    if (bio !== undefined) {
      if (!isStr(bio) || bio.length > 190) {
        return res.status(400).json({ message: "About me must be under 190 characters" });
      }
      user.bio = bio.trim();
    }

    await user.save();
    await broadcastProfile(req, user);
    res.json({ user: user.toPublic() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "That username is taken" });
    fail(res, err);
  }
});

// PUT /api/users/me/avatar   { image: "data:image/jpeg;base64,...." }
// The app crops and shrinks the photo in the browser first, then sends it as text.
router.put("/me/avatar", async (req, res) => {
  try {
    const { image } = req.body || {};
    const match = isStr(image) && image.match(/^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ message: "Send the image as a data URL" });

    const [, contentType, base64] = match;
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ message: "Use a JPG, PNG, WEBP or GIF image" });
    }
    const data = Buffer.from(base64, "base64");
    if (data.length > MAX_AVATAR_BYTES) return res.status(413).json({ message: "That image is too big" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.avatar = { data, contentType };
    user.avatarUrl = `/api/users/${user._id}/avatar?v=${Date.now()}`;
    await user.save();

    await broadcastProfile(req, user);
    res.json({ user: user.toPublic() });
  } catch (err) {
    fail(res, err);
  }
});

// DELETE /api/users/me/avatar   back to initials
router.delete("/me/avatar", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.avatar = undefined;
    user.avatarUrl = "";
    await user.save();
    await broadcastProfile(req, user);
    res.json({ user: user.toPublic() });
  } catch (err) {
    fail(res, err);
  }
});

// PATCH /api/users/me/password   { currentPassword, newPassword }
router.patch("/me/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!isStr(currentPassword) || !isStr(newPassword)) {
      return res.status(400).json({ message: "Enter your current and new password" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    const user = await User.findById(req.userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: "Current password is wrong" });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
