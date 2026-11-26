require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const friendRoutes = require("./routes/friends");
const dmRoutes = require("./routes/dms");
const inviteRoutes = require("./routes/invites");
const userRoutes = require("./routes/users");
const conversationRoutes = require("./routes/conversations");
const migrate = require("./config/migrate");
const initSocket = require("./socket");

if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
  console.error("Missing JWT_SECRET or MONGO_URI. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = initSocket(server); // Socket.io shares the same server and port as Express
app.set("io", io); // lets REST routes emit socket events later

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
// 1 MB is plenty for chat, and leaves room for avatar uploads (~30 KB after the app shrinks them)
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, app: "UFOCHAT" }));
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/dms", dmRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);

// Catch-all error handler so a crash in a route returns JSON instead of an HTML page
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ message: "That upload is too big" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON" });
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(migrate) // upgrade data from earlier steps before accepting requests
  .then(() => {
    server.listen(PORT, () => console.log(`UFOCHAT server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
