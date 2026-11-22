# 🛸 UFOCHAT

A real-time chat app for a campus or club, inspired by Discord. Add friends by username, DM them, and create private rooms that only invited friends can join. Messages, typing and online status all update live.

**Stack:** React · Node.js (Express) · Socket.io · MongoDB

---

## ✨ Features

| Feature | Status |
|---|---|
| Signup and login (email or username, bcrypt + JWT) | ✅ |
| Friends: add by username, accept/decline, remove | ✅ |
| Direct messages between friends | ✅ |
| Private rooms: invite-only, members invite their friends | ✅ |
| Live messaging over WebSockets | ✅ |
| Message history with "load older" | ✅ |
| "Joined" / "left" notices saved in the history | ✅ |
| Online status, typing indicator, unread dots | ✅ |
| Discord-style UI that works on phones | ✅ |
| Profiles: photo upload, display name, username, About me | ✅ |
| Change password | ✅ |
| Name and photo changes show up live for everyone | ✅ |
| Clickable links, unread count in the tab title | ✅ |

## ⚙️ How it works

UFOCHAT uses two channels between the browser and the server:

- **REST (Express)** for actions: signing up, friend requests, creating rooms, invites, loading older messages.
- **WebSockets (Socket.io)** for anything live. The connection stays open, so the server can push messages, typing and online status the moment they happen.

Every socket also joins a **personal channel** (`user:<id>`). When something changes for you, like a friend request, an invite or a new DM, the server sends a small signal there and the app refetches. That's how the Pending badge and unread dots update without refreshing.

**Opening a room is not joining it.** Joining happens once, when you accept an invite, and that's when "X joined the room" is saved. Switching rooms or closing the tab only stops listening, so nobody sees a fake "left" notice.

## 🚀 Getting started

### Requirements

- Node.js 18 or newer
- MongoDB, either installed locally or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### 1. Server

```bash
git clone https://github.com/YOUR_USERNAME/ufochat.git
cd ufochat/server
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
|---|---|
| `PORT` | Server port (default `5000`) |
| `MONGO_URI` | MongoDB connection string. The default works for a local MongoDB. For Atlas, paste your Atlas string. |
| `JWT_SECRET` | Long random string used to sign login tokens. **Change this.** |
| `CLIENT_URL` | Where the React app runs (default `http://localhost:5173`) |

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start MongoDB if it's local (macOS with Homebrew: `brew services start mongodb-community`), then:

```bash
npm run dev
```

You should see `MongoDB connected` and `UFOCHAT server running on http://localhost:5000`.

> **Upgrading from an earlier version?** On startup the server upgrades old data automatically: accounts without a username get one from their email (abhi@test.com becomes `@abhi`), and the old "room names must be unique" index is removed.

### 2. React app (second terminal)

```bash
cd ufochat/client
npm install
npm run dev
```

Open **http://localhost:5173**. Vite forwards `/api` and `/socket.io` to the server on port 5000, so keep both terminals running.

## 🧪 Try it

You need two people. Normal tabs share one login, so open the second account in a **private / incognito window** or another browser.

1. **Sign up** in both windows with different usernames.
2. **Add a friend:** Friends → Add Friend → type the other username. The other window shows a red badge on 🛸. Accept it in Pending.
3. **DM:** click your friend → chat. Messages, typing and the unread dot all work live.
4. **Create a room:** the green **+** in the left rail. Then **Invite friends** → Invite.
5. **Accept the invite** in the other window (Friends → Pending). Both windows see "→ Alien joined the room".
6. **Leave** from the room sidebar. The others see "← Alien left the room". Switching rooms or closing the tab shows nothing.
7. **Profile:** click ⚙ next to your name. Upload a photo, change your name or add an About me. The other window updates instantly: friend list, members panel and even old messages.
8. Make the window narrow to see the phone layout (☰ menu).

## 📡 REST API

All routes except signup, login and health need `Authorization: Bearer <token>`.

**Auth**

| Method | Route | Body | |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ name, username, email, password }` | Returns `{ token, user }` |
| POST | `/api/auth/login` | `{ login, password }` | `login` is an email or a username |
| GET | `/api/auth/me` | | The logged in user |

**Friends**

| Method | Route | Body | |
|---|---|---|---|
| GET | `/api/friends` | | `{ friends, incoming, outgoing }` |
| POST | `/api/friends/requests` | `{ username }` | Send a request (auto-accepts if they already asked you) |
| POST | `/api/friends/requests/:id/accept` | | Accept a request sent to you |
| DELETE | `/api/friends/requests/:id` | | Decline, or cancel one you sent |
| DELETE | `/api/friends/:userId` | | Remove a friend (DMs are kept) |

**Users / profile**

| Method | Route | Body | |
|---|---|---|---|
| PATCH | `/api/users/me` | `{ name?, username?, bio? }` | Update your profile |
| PUT | `/api/users/me/avatar` | `{ image: "data:image/jpeg;base64,..." }` | Upload a photo (JPG, PNG, WEBP or GIF, max 512 KB) |
| DELETE | `/api/users/me/avatar` | | Back to initials |
| PATCH | `/api/users/me/password` | `{ currentPassword, newPassword }` | Change password |
| GET | `/api/users/:id/avatar` | | The image itself (public, so `<img>` tags can load it) |

**DMs**

| Method | Route | Body | |
|---|---|---|---|
| GET | `/api/dms` | | Your DMs, most recent first |
| POST | `/api/dms` | `{ userId }` | Open or create a DM with a friend |

**Rooms** (members only; non-members get 404)

| Method | Route | Body | |
|---|---|---|---|
| GET | `/api/rooms` | | Rooms you're in |
| POST | `/api/rooms` | `{ name, description? }` | Create a room |
| GET | `/api/rooms/:id` | | Room or DM with members and online status |
| GET | `/api/rooms/:id/messages` | `?before=<messageId>&limit=50` | History, oldest first, plus `hasMore` |
| POST | `/api/rooms/:id/leave` | | Leave (posts "left the room"; the last one out deletes the room) |
| GET | `/api/rooms/:id/invites` | | Ids of people with a pending invite |
| POST | `/api/rooms/:id/invites` | `{ userId }` | Invite a friend |

**Invites**

| Method | Route | |
|---|---|---|
| GET | `/api/invites` | Room invites waiting for you |
| POST | `/api/invites/:id/accept` | Join the room (posts "joined the room") |
| POST | `/api/invites/:id/decline` | Decline |

Errors come back as `{ "message": "..." }` with a matching status code.

## 🔌 Socket events

Connect with `io(URL, { auth: { token } })`.

| Direction | Event | Data |
|---|---|---|
| client → server | `join_room` | `{ roomId }`, reply has `messages` (last 50) and `hasMore`. Starts listening only. |
| client → server | `leave_room` | `{ roomId }`. Stops listening only. |
| client → server | `send_message` | `{ roomId, text }` (max 2000 characters) |
| client → server | `typing_start` / `typing_stop` | `{ roomId }` |
| client → server | `get_online_users` | reply: `{ ok, users }` |
| server → client | `new_message` | `{ id, roomId, type: "text" \| "system", text, createdAt, sender? }` |
| server → client | `typing` | `{ roomId, user, isTyping }` |
| server → client | `online_users` / `user_online` / `user_offline` | presence |
| server → client | `room_updated` | `{ roomId }`: members changed |
| server → client | `user_updated` | `{ id, name, username, avatarUrl, bio }`: someone edited their profile |
| server → client (personal) | `friends_changed` / `invites_changed` / `rooms_changed` | refetch signals |
| server → client (personal) | `room_activity` | `{ roomId, type, senderId }`: for unread dots |

## 📁 Project structure

```
ufochat/
├── client/                       # React app (Vite)
│   ├── vite.config.js            # dev server + proxy to the API
│   └── src/
│       ├── main.jsx              # entry: router + providers
│       ├── App.jsx               # routes and login guards
│       ├── index.css             # all styles
│       ├── utils/
│       │   ├── api.js            # fetch helper with the token
│       │   ├── image.js          # crops + shrinks photos before upload
│       │   └── linkify.jsx       # clickable links in messages
│       ├── context/
│       │   ├── AuthContext.jsx   # logged in user, login/signup/logout
│       │   ├── SocketContext.jsx # shared socket + online users
│       │   └── DataContext.jsx   # friends, invites, rooms, DMs, unread
│       ├── hooks/
│       │   ├── useRoomChat.js    # history, live messages, typing for one chat
│       │   └── useOnlineIds.js
│       ├── layout/AppLayout.jsx  # [rail | sidebar | page] frame
│       ├── pages/
│       │   ├── Login.jsx, Signup.jsx
│       │   ├── FriendsPage.jsx   # Home: Online / All / Pending / Add Friend
│       │   └── ChatPage.jsx      # a room or a DM
│       └── components/
│           ├── ServerRail.jsx    # Home + room icons + create
│           ├── HomeSidebar.jsx   # Friends link + DM list
│           ├── RoomSidebar.jsx   # room info, invite, leave
│           ├── UserBar.jsx
│           ├── MessageList.jsx, MessageInput.jsx, TypingIndicator.jsx
│           ├── Modal.jsx, CreateRoomModal.jsx, InviteModal.jsx
│           ├── SettingsModal.jsx # profile, photo, password
│           └── Avatar.jsx
└── server/
    ├── .env.example
    └── src/
        ├── index.js              # Express + Socket.io + startup
        ├── config/
        │   ├── db.js             # MongoDB connection
        │   └── migrate.js        # upgrades old data on startup
        ├── middleware/auth.js    # JWT checks
        ├── models/               # User, Friendship, Room, RoomInvite, Message
        ├── routes/               # auth, users, friends, dms, rooms, invites
        ├── services/
        │   ├── messages.js       # history + saved system notices
        │   ├── friends.js        # friendship checks
        │   └── notify.js         # signals to a user's personal channel
        └── socket/
            ├── index.js          # socket login check, personal channel, presence
            ├── chatHandlers.js   # join_room, leave_room, send_message
            ├── typingHandlers.js
            └── presence.js       # who is online (in memory)
```

## 🔒 Security notes

- Passwords are hashed with bcrypt and never sent to the client. Emails are never shown to other users.
- Socket connections need a valid JWT, so senders can't be faked.
- Rooms are private: non-members can't see them, read their history or send messages, and get a 404 as if the room doesn't exist.
- You can only DM and invite people who are your friends.
- Inputs are validated, and only plain strings reach MongoDB queries.
- Messages are shown as plain text (React escapes them), so HTML or scripts in a message never run. Only `http`/`https` links become clickable.
- Avatars must be real photos (JPG, PNG, WEBP, GIF). SVG is rejected because it can contain scripts, and images are served with `nosniff`.
- Changing your password needs your current password.
- `.env` is in `.gitignore`. Never commit your real secrets.

## 🗺️ Roadmap

- [x] Server setup, signup and login
- [x] Rooms
- [x] Live messaging with Socket.io
- [x] Message history
- [x] Online users
- [x] Typing indicator
- [x] React frontend
- [x] Discord-style redesign: friends, DMs, invite-only rooms
- [x] Profiles with photo upload, final polish

### Ideas for later
- Deploy online (e.g. Render for the server, Vercel for the client, MongoDB Atlas)
- Image and file sharing in messages
- Message editing, deleting and reactions
- Room admin tools (rename, remove members)
- Browser notifications for new DMs
