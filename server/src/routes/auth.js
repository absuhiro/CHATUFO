const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { requireAuth, signToken } = require("../middleware/auth");
const { validAccountKeys } = require("../services/e2ee");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isStr = (v) => typeof v === "string";
const fail = (res, err) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
};

// Finds a user by email (contains @) or username
function findByLogin(login) {
  const clean = login.trim().toLowerCase();
  return User.findOne(clean.includes("@") ? { email: clean } : { username: clean });
}

// HOW LOGGING IN WORKS NOW (end-to-end encryption)
// Your password never leaves your browser. The browser turns it into two secrets:
//   - a "login secret" (authHash) that is sent here and checked with bcrypt
//   - a "key secret" that unlocks your private keys, and is never sent anywhere
// To do that, the browser first needs your account's salt: that's /prelogin.

// POST /api/auth/prelogin  { login }  ->  { version, kdfSalt }
router.post("/prelogin", async (req, res) => {
  try {
    const { login } = req.body || {};
    if (!isStr(login) || !login.trim()) return res.status(400).json({ message: "Enter your email or username" });

    const user = await findByLogin(login);
    if (user && user.authVersion === 1) return res.json({ version: 1 }); // old account: upgraded after this login
    if (user) return res.json({ version: 2, kdfSalt: user.kdfSalt });

    // Unknown account: answer with a made-up but consistent salt, so nobody can
    // use this route to find out which emails/usernames exist.
    const fake = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(login.trim().toLowerCase())
      .digest()
      .subarray(0, 16)
      .toString("base64");
    res.json({ version: 2, kdfSalt: fake });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/auth/signup
// { name, username, email, authHash, kdfSalt, publicKey, signingPublicKey, encryptedPrivateKeys }
// (the browser checks the password length, because the server never sees the password)
router.post("/signup", async (req, res) => {
  try {
    const body = req.body || {};
    const { name, username, email } = body;
    if (!isStr(name) || !isStr(username) || !isStr(email) || !name.trim() || !username.trim() || !email.trim()) {
      return res.status(400).json({ message: "Name, username, email and password are required" });
    }
    if (name.trim().length < 2 || name.trim().length > 50) {
      return res.status(400).json({ message: "Display name must be 2 to 50 characters" });
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!User.USERNAME_RE.test(cleanUsername)) {
      return res.status(400).json({
        message: "Username must be 3 to 20 characters: letters, numbers, dots or underscores",
      });
    }
    if (!EMAIL_RE.test(email.trim())) return res.status(400).json({ message: "Please enter a valid email" });
    if (!validAccountKeys(body)) {
      return res.status(400).json({ message: "Encryption keys are missing or invalid. Please refresh and try again." });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) return res.status(409).json({ message: "Email already registered" });
    if (await User.exists({ username: cleanUsername })) {
      return res.status(409).json({ message: "That username is taken" });
    }

    const user = await User.create({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(body.authHash, 10),
      authVersion: 2,
      kdfSalt: body.kdfSalt,
      publicKey: body.publicKey,
      signingPublicKey: body.signingPublicKey,
      encryptedPrivateKeys: body.encryptedPrivateKeys,
    });

    res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
  } catch (err) {
    // Two people signing up with the same email/username at the same moment
    if (err.code === 11000) return res.status(409).json({ message: "Email or username already taken" });
    fail(res, err);
  }
});

// POST /api/auth/login
//   encrypted accounts: { login, authHash }  -> { token, user, encryptedPrivateKeys }
//   old accounts:       { login, password }  -> { token, user, needsKeySetup: true }
router.post("/login", async (req, res) => {
  try {
    const { login, authHash, password } = req.body || {};
    if (!isStr(login) || !login.trim() || !(isStr(authHash) || isStr(password))) {
      return res.status(400).json({ message: "Email or username and password are required" });
    }

    const user = await findByLogin(login).select("+encryptedPrivateKeys");
    const secret = user && user.authVersion === 2 ? authHash : password;
    // Same message for every failure so nobody can tell which accounts exist
    if (!user || !isStr(secret) || !(await bcrypt.compare(secret, user.passwordHash))) {
      return res.status(401).json({ message: "Wrong login or password" });
    }

    const token = signToken(user._id);
    if (user.authVersion === 1) return res.json({ token, user: user.toPublic(), needsKeySetup: true });
    res.json({ token, user: user.toPublic(), encryptedPrivateKeys: user.encryptedPrivateKeys });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/auth/setup-keys   (old accounts, right after logging in)
// { password, authHash, kdfSalt, publicKey, signingPublicKey, encryptedPrivateKeys }
// Switches the account to encryption. The plain password is checked one last time,
// then only the login secret is stored from now on.
router.post("/setup-keys", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.authVersion === 2) return res.status(409).json({ message: "Encryption is already set up" });
    if (!isStr(body.password) || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return res.status(401).json({ message: "Wrong password" });
    }
    if (!validAccountKeys(body)) return res.status(400).json({ message: "Encryption keys are missing or invalid" });

    user.passwordHash = await bcrypt.hash(body.authHash, 10);
    user.authVersion = 2;
    user.kdfSalt = body.kdfSalt;
    user.publicKey = body.publicKey;
    user.signingPublicKey = body.signingPublicKey;
    user.encryptedPrivateKeys = body.encryptedPrivateKeys;
    await user.save();
    res.json({ user: user.toPublic() });
  } catch (err) {
    fail(res, err);
  }
});

// GET /api/auth/me  (protected) returns the logged in user
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: user.toPublic(), needsKeySetup: user.authVersion === 1 });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
