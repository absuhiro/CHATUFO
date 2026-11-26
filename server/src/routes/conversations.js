const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { listConversations } = require("../services/conversations");

const router = express.Router();
router.use(requireAuth);

// GET /api/conversations   your rooms and DMs for the chat list (see services/conversations.js)
router.get("/", async (req, res) => {
  try {
    res.json({ conversations: await listConversations(req.userId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
