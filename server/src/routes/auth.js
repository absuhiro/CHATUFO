const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { requireAuth, signToken } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isStr = (v) => typeof v === "string";

// POST /api/auth/signup  { name, username, email, password }
router.post("/signup", async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};
    // Only accept plain strings (blocks objects like { "$ne": null } from reaching MongoDB)
    if (
      !isStr(name) || !isStr(username) || !isStr(email) || !isStr(password) ||
      !name.trim() || !username.trim() || !email.trim() || !password
    ) {
      return res.status(400).json({ message: "Name, username, email and password are required" });
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!User.USERNAME_RE.test(cleanUsername)) {
      return res.status(400).json({
        message: "Username must be 3 to 20 characters: letters, numbers, dots or underscores",
      });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ message: "Please enter a valid email" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) {
      return res.status(409).json({ message: "Email already registered" });
    }
    if (await User.exists({ username: cleanUsername })) {
      return res.status(409).json({ message: "That username is taken" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), username: cleanUsername, email: cleanEmail, passwordHash });

    res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
  } catch (err) {
    // Two people signing up with the same email/username at the same moment
    if (err.code === 11000) return res.status(409).json({ message: "Email or username already taken" });
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/login  { login, password }   "login" can be an email or a username
// (the old { email, password } still works)
router.post("/login", async (req, res) => {
  try {
    const body = req.body || {};
    const login = isStr(body.login) ? body.login : body.email;
    const { password } = body;
    if (!isStr(login) || !isStr(password) || !login.trim() || !password) {
      return res.status(400).json({ message: "Email or username and password are required" });
    }

    const clean = login.trim().toLowerCase();
    const user = await User.findOne(clean.includes("@") ? { email: clean } : { username: clean });
    // Same message for both cases so attackers can't tell which accounts exist
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Wrong login or password" });
    }

    res.json({ token: signToken(user._id), user: user.toPublic() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/me  (protected) returns the logged in user
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: user.toPublic() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
