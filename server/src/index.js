require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const initSocket = require("./socket");
const path = require("path");

if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
  console.error("Missing JWT_SECRET or MONGO_URI. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = initSocket(server); // Socket.io shares the same server and port as Express
app.set("io", io); // lets REST routes emit socket events later

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

// Test page for trying chat before the React app exists: http://localhost:5000/test.html
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (req, res) => res.json({ ok: true, app: "UFOCHAT" }));
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// Catch-all error handler so a crash in a route returns JSON instead of an HTML page
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => console.log(`UFOCHAT server running on http://localhost:${PORT}`));
});
