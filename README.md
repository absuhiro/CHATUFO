# 🛸 UFOCHAT

A real-time chat app for one campus or club. Think of a small WhatsApp or Discord: sign up, join rooms and talk live, with messages reaching everyone instantly and no refreshing.

**Stack:** React · Node.js (Express) · Socket.io · MongoDB

> 🚧 **Work in progress:** the backend is mostly complete (5 of 8 steps). The React frontend is coming next. Until then, a built-in test page lets you try the chat in your browser.

---

## ✨ Features

| Feature | Status |
|---|---|
| Signup and login (bcrypt passwords + JWT) | ✅ Done |
| Create, list, join and leave rooms | ✅ Done |
| Live messaging over WebSockets | ✅ Done |
| Message history (last 50 on join, "load older" paging) | ✅ Done |
| Online users list (handles multiple tabs per user) | ✅ Done |
| Typing indicator | 🔜 Next |
| React frontend | 🔜 Planned |
| Profile with name and avatar | 🔜 Planned |

## ⚙️ How it works

UFOCHAT uses two channels between the browser and the server:

- **REST (Express)** for one-off actions: signing up, logging in, creating and joining rooms, loading older messages.
- **WebSockets (Socket.io)** for anything live. The connection stays open, so the server can push new messages, online status and join/leave notices the moment they happen.

When a user sends a message:

```
browser ──send_message──▶ server ──checks login + membership──▶ saves to MongoDB
                                                                    │
every browser in the room ◀──────────────new_message────────────────┘
```

Both channels use the same JWT. REST sends it in the `Authorization` header, and the socket sends it once when connecting, so every message is tied to a verified user.

## 🚀 Getting started

### Requirements

- Node.js 18 or newer
- MongoDB, either installed locally or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/ufochat.git
cd ufochat/server
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Then open `.env` and fill it in:

| Variable | What it is |
|---|---|
| `PORT` | Server port (default `5000`) |
| `MONGO_URI` | MongoDB connection string. The default works for a local MongoDB. For Atlas, paste your Atlas string. |
| `JWT_SECRET` | Long random string used to sign login tokens. **Change this.** |
| `CLIENT_URL` | Where the React app will run (default `http://localhost:5173`) |

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start MongoDB (local install only)

On macOS with Homebrew:

```bash
brew services start mongodb-community
```

### 4. Run the server

```bash
npm run dev
```

You should see:

```
MongoDB connected
UFOCHAT server running on http://localhost:5000
```

## 🧪 Try it in the browser

Until the React app is ready, use the test page:

1. Create two users:
   ```bash
   curl -X POST http://localhost:5000/api/auth/signup -H "Content-Type: application/json" -d '{"name":"Abhyudaya","email":"abhi@test.com","password":"secret123"}'
   curl -X POST http://localhost:5000/api/auth/signup -H "Content-Type: application/json" -d '{"name":"Alien","email":"alien@test.com","password":"secret123"}'
   ```
2. Open **http://localhost:5000/test.html** and log in as the first user.
3. Open a **second tab** at the same address and log in as the second user. Each tab keeps its own login.
4. Create or pick the same room in both tabs and chat. Messages appear instantly in both.

Things to check:

- **History:** refresh and reopen the room. Old messages are still there.
- **Load older:** a room with more than 50 messages shows a "Load older messages" button. To fill a test room quickly, open the browser console while the room is open and run:
  ```js
  for (let i = 1; i <= 60; i++) socket.emit("send_message", { roomId: currentRoom.id, text: "Test " + i }, () => {});
  ```
- **Online list:** the right panel updates as tabs open and close. Closing one of two tabs for the same user keeps them online.

## 📡 REST API

All routes except signup, login and health need the header `Authorization: Bearer <token>`.

| Method | Route | Body / Query | Description |
|---|---|---|---|
| GET | `/api/health` | | Server status |
| POST | `/api/auth/signup` | `{ name, email, password }` | Create an account, returns `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` | Log in, returns `{ token, user }` |
| GET | `/api/auth/me` | | The logged in user |
| GET | `/api/rooms` | | All rooms, newest first, with `memberCount` and `isMember` |
| POST | `/api/rooms` | `{ name, description? }` | Create a room (creator joins automatically) |
| GET | `/api/rooms/:id` | | One room with its members and their online status |
| GET | `/api/rooms/:id/messages` | `?before=<messageId>&limit=50` | Message history, oldest first, plus `hasMore` (members only) |
| POST | `/api/rooms/:id/join` | | Become a member |
| POST | `/api/rooms/:id/leave` | | Stop being a member |

Errors come back as `{ "message": "..." }` with a matching status code (`400`, `401`, `403`, `404`, `409`, `500`).

<details>
<summary>Testing the API with curl</summary>

```bash
# Log in and save the token in one go
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"abhi@test.com","password":"secret123"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

# Create a room
curl -X POST http://localhost:5000/api/rooms -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"General","description":"Talk about anything"}'

# List rooms
curl http://localhost:5000/api/rooms -H "Authorization: Bearer $TOKEN"
```

Postman or Thunder Client (VS Code) work too.
</details>

## 🔌 Socket events

Connect with the JWT:

```js
const socket = io("http://localhost:5000", { auth: { token } });
```

| Direction | Event | Data |
|---|---|---|
| client → server | `join_room` | `{ roomId }`, reply includes `messages` (last 50) and `hasMore` |
| client → server | `leave_room` | `{ roomId }` |
| client → server | `send_message` | `{ roomId, text }` (max 2000 characters) |
| client → server | `get_online_users` | reply: `{ ok, users }` |
| server → client | `new_message` | `{ id, roomId, text, createdAt, sender: { id, name, avatarUrl } }` |
| server → client | `user_joined` / `user_left` | `{ roomId, user }` |
| server → client | `online_users` | `[{ id, name, avatarUrl }]`, sent right after connecting |
| server → client | `user_online` | `{ id, name, avatarUrl }` |
| server → client | `user_offline` | `{ id }` |

Client events accept a callback that receives `{ ok: true, ... }` or `{ ok: false, error }`. A user must join a room through REST (membership) before joining it on the socket (listening).

## 📁 Project structure

```
ufochat/
├── README.md
└── server/
    ├── .env.example            # template for your .env
    ├── package.json
    ├── public/
    │   └── test.html           # browser test page (until React is ready)
    └── src/
        ├── index.js            # Express app + HTTP server + Socket.io
        ├── config/db.js        # MongoDB connection
        ├── middleware/auth.js  # JWT checks for REST routes
        ├── models/
        │   ├── User.js
        │   ├── Room.js
        │   └── Message.js
        ├── routes/
        │   ├── auth.js         # signup, login, me
        │   └── rooms.js        # rooms + message history
        ├── services/
        │   └── messages.js     # paged message history
        └── socket/
            ├── index.js        # socket setup, login check, connect/disconnect
            ├── chatHandlers.js # join_room, leave_room, send_message
            └── presence.js     # who is online (in memory)
```

## 🔒 Security notes

- Passwords are hashed with bcrypt and never sent to the client.
- Socket connections are rejected without a valid JWT, so senders can't be faked.
- Room names, messages and inputs are validated, and only plain strings reach MongoDB queries.
- Only room members can read history or send messages in a room.
- The test page shows messages as plain text, so HTML or scripts in a message are never run.
- `.env` is in `.gitignore`. Never commit your real secrets.

## 🗺️ Roadmap

- [x] **Step 1:** Server setup, signup and login
- [x] **Step 2:** Rooms
- [x] **Step 3:** Live messaging with Socket.io
- [x] **Step 4:** Message history
- [x] **Step 5:** Online users list
- [ ] **Step 6:** Typing indicator
- [ ] **Step 7:** React frontend (login, room sidebar, chat window, online panel)
- [ ] **Step 8:** Profile with name and avatar, final polish
