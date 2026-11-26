# 🛸 UFOCHAT

A real-time chat app for a campus or club, with a clean, minimal design. Add friends by username, DM them, and create private rooms that only invited friends can join. Messages, typing and online status all update live, and **every message is end-to-end encrypted**: the server only ever stores scrambled data.

**Stack:** React · Node.js (Express) · Socket.io · MongoDB

---

## ✨ Features

| Feature | Status |
|---|---|
| **End-to-end encryption** for DMs and rooms (Web Crypto, no extra packages) | ✅ |
| Security codes + key-change warnings, signed messages | ✅ |
| Signup and login (email or username, JWT); the password never leaves the browser | ✅ |
| Friends: add by username, accept/decline, remove | ✅ |
| Direct messages between friends | ✅ |
| Private rooms: invite-only, members invite their friends | ✅ |
| Live messaging over WebSockets | ✅ |
| Message history with "load older" | ✅ |
| "Joined" / "left" notices saved in the history | ✅ |
| Online status, typing indicator, unread dots | ✅ |
| Bento-grid dashboard: Recent Chats, Online Friends, Groups, Pending Requests, Profile | ✅ |
| Dedicated full-screen chat view; Chats and Friends pages with search + filters | ✅ |
| Message previews and unread counts (previews decrypted in your browser) | ✅ |
| Phone layout with a bottom tab bar | ✅ |
| Profiles: photo upload, display name, username, About me | ✅ |
| Change password | ✅ |
| Name and photo changes show up live for everyone | ✅ |
| Clickable links, unread count in the tab title | ✅ |

## ⚙️ How it works

UFOCHAT uses two channels between the browser and the server:

- **REST (Express)** for actions: signing up, friend requests, creating rooms, invites, loading older messages.
- **WebSockets (Socket.io)** for anything live. The connection stays open, so the server can push messages, typing and online status the moment they happen.

Every socket also joins a **personal channel** (`user:<id>`). When something changes for you, like a friend request, an invite or a new DM, the server sends a small signal there and the app refetches. That's how the badges and unread counts update without refreshing.

**Opening a room is not joining it.** Joining happens once, when you accept an invite, and that's when "X joined the room" is saved. Switching rooms or closing the tab only stops listening, so nobody sees a fake "left" notice.

## 🔒 End-to-end encryption

Messages are encrypted in the sender's browser and decrypted only in the recipients' browsers, using the browser's built-in **Web Crypto API**. The server and database only see scrambled data. The code is in [`client/src/crypto/e2ee.js`](client/src/crypto/e2ee.js).

**Keys.** At signup, your browser makes two key pairs:
- **RSA-OAEP 2048:** others lock message keys with your public key, and only your private key unlocks them.
- **ECDSA P-256:** you sign every message, so others can check it really came from you.

Public keys are stored on the server. Private keys are stored there only inside a **backup locked with your password**.

**Your password becomes two secrets.** PBKDF2-SHA256 (600,000 rounds, random salt) turns it into 512 bits, split in half:
- a **key secret** that unlocks your key backup. It never leaves the browser.
- a **login secret** that is sent to log in, and stored as a bcrypt hash.

The server can't get from the login secret to the key secret, so it can't open your backup.

**Sending a message:**
1. A fresh random **AES-256-GCM** key encrypts the text. The room and sender ids are bound in as authenticated data, so a message can't be moved to another room or credited to someone else.
2. That key is locked once for **every member** (including you) with their RSA public key. The server checks that every member with encryption got a copy.
3. The result is **signed** with your ECDSA key.

**Reading a message.** Your browser unlocks your copy of the key, decrypts the text and checks the signature. If something's wrong, the app shows it:
- **🔒 Sent before you joined:** new members don't get keys for older messages.
- **⚠ Couldn't be decrypted:** the data was damaged or tampered with.
- **⚠ Couldn't verify who sent this:** the signature doesn't match the sender's key.

**Security codes.** Each person has a 30-digit code made from their public keys (like Signal's safety numbers). It's shown in **Settings → Encryption** and on their profile card in a DM. If both of you see the same code, nobody swapped the keys. The app also remembers each person's code the first time it sees it, and warns you if it ever changes.

**On this browser,** unlocked keys are kept in IndexedDB as *non-extractable* keys, so you stay unlocked after a refresh, and logging out deletes them. A new browser or incognito window just asks for your password, which unlocks the backup.

**What it doesn't hide:** who's in which room or DM, when messages are sent, room names and descriptions, and profiles (names, photos, About me). Like most messengers, it protects message *content*.

**Other limits, to be honest about them:**
- **Forget your password and your messages are gone.** There's no reset, because nobody else can unlock your keys.
- **Trust on first use:** the first time you talk to someone, you trust the key the server gives you. Compare security codes to be sure.
- **Old accounts:** an account made before encryption sends its plain password one last time on its next login, to upgrade itself. After that, it only uses the login secret.
- **The app code comes from the server.** As with any web app, a malicious server could send altered code. Native apps and browser extensions avoid this, but a website can't.
- **Message size:** each message carries one locked key (~350 bytes) per member, so this suits clubs and classes rather than rooms with thousands of people.

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

> **Upgrading from an earlier version?** On startup the server upgrades old data automatically: accounts without a username get one from their email (abhi@test.com becomes `@abhi`), the old "room names must be unique" index is removed, and **old unencrypted messages are deleted**. Old accounts switch to encryption on their next login.

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
2. **Add a friend:** the **Pending Requests** card on the dashboard → **Add a friend** (or the Friends page → add-friend button). The other window's dashboard shows the request with green ✓ / red ✕ buttons.
3. **DM:** click your friend → chat. Messages, typing and the unread dot all work live.
4. **Create a room:** the **+** on the **Groups** card (or **New message** → Create a room). Then the invite button in the chat header.
5. **Accept the invite** on the other window's dashboard (Pending Requests). Both windows see "→ Alien joined the room".
6. **Leave** from the ⋯ menu in the room's header. The others see "← Alien left the room". Switching rooms or closing the tab shows nothing.
7. **Encryption:** ⚙ → Encryption shows your security code. Open your DM in the other window, and the profile card shows the same code. Open MongoDB (e.g. Compass) and look at the `messages` collection: only scrambled `ciphertext`, no text.
8. **Profile:** click ⚙ next to your name. Upload a photo, change your name or add an About me. The other window updates instantly: friend list, members panel and even old messages.
9. On the **Chats** page, use the filter button next to the search to show only DMs, rooms or unread chats.
10. Make the window narrow to see the phone layout: the cards stack, and the rail becomes a bottom tab bar.

## 📡 REST API

All routes except signup, login and health need `Authorization: Bearer <token>`.

**Auth**

| Method | Route | Body | |
|---|---|---|---|
| POST | `/api/auth/prelogin` | `{ login }` | `{ version, kdfSalt }` (unknown accounts get a consistent fake salt) |
| POST | `/api/auth/signup` | `{ name, username, email, authHash, kdfSalt, publicKey, signingPublicKey, encryptedPrivateKeys }` | Returns `{ token, user }` |
| POST | `/api/auth/login` | `{ login, authHash }` | Returns `{ token, user, encryptedPrivateKeys }`. Old accounts: `{ login, password }` → `needsKeySetup` |
| POST | `/api/auth/setup-keys` | `{ password, authHash, kdfSalt, publicKey, signingPublicKey, encryptedPrivateKeys }` | One-time upgrade of an old account |
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
| GET | `/api/users/me/keys` | | Your salt + locked key backup |
| PATCH | `/api/users/me/password` | `{ currentAuthHash, newAuthHash, newKdfSalt, encryptedPrivateKeys }` | Change password (same keys, re-locked) |
| POST | `/api/users/public-keys` | `{ ids: [...] }` | Public keys for up to 200 users |
| GET | `/api/users/:id/avatar` | | The image itself (public, so `<img>` tags can load it) |

**Conversations**

| Method | Route | |
|---|---|---|
| GET | `/api/conversations` | Your rooms and DMs, newest first, each with its last message (still encrypted, for you) and `unreadCount` |

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
| client → server | `send_message` | `{ roomId, ciphertext, iv, signature, keys: { userId: lockedKey } }`. Plain text is refused. If members changed, the reply has `code: "members_changed"` and the app retries. |
| client → server | `typing_start` / `typing_stop` | `{ roomId }` |
| client → server | `get_online_users` | reply: `{ ok, users }` |
| server → client | `new_message` | `{ id, roomId, type: "encrypted", ciphertext, iv, signature, keys, sender, createdAt }` or `{ type: "system", text }` |
| server → client | `typing` | `{ roomId, user, isTyping }` |
| server → client | `online_users` / `user_online` / `user_offline` | presence |
| server → client | `room_updated` | `{ roomId }`: members changed |
| server → client | `user_updated` | `{ id, name, username, avatarUrl, bio }`: someone edited their profile |
| server → client (personal) | `friends_changed` / `invites_changed` / `rooms_changed` | refetch signals |
| server → client (personal) | `room_activity` | `{ roomId, type, senderId }`: refresh the chat list |
| client → server | `mark_read` | `{ roomId }`: you've seen the new messages in the open chat |
| server → client (personal) | `conversation_read` | `{ roomId }`: clear that chat's unread count (all your tabs) |

## 📁 Project structure

```
ufochat/
├── client/                       # React app (Vite)
│   ├── vite.config.js            # dev server + proxy to the API
│   └── src/
│       ├── main.jsx              # entry: router + providers
│       ├── App.jsx               # routes and login guards
│       ├── index.css             # all styles
│       ├── crypto/
│       │   ├── e2ee.js           # all the encryption (Web Crypto)
│       │   ├── keyStore.js       # unlocked keys in IndexedDB
│       │   ├── publicKeys.js     # cache of other people's public keys
│       │   └── trust.js          # remembers security codes, spots changes
│       ├── utils/
│       │   ├── api.js            # fetch helper with the token
│       │   ├── image.js          # crops + shrinks photos before upload
│       │   └── linkify.jsx       # clickable links in messages
│       ├── context/
│       │   ├── AuthContext.jsx   # logged in user, login/signup/logout
│       │   ├── SocketContext.jsx # shared socket + online users
│       │   └── DataContext.jsx   # friends, invites, conversations (previews + unread)
│       ├── hooks/
│       │   ├── useRoomChat.js    # history, live messages, typing for one chat
│       │   └── useOnlineIds.js
│       ├── layout/AppLayout.jsx  # [rail | page] frame
│       ├── pages/
│       │   ├── Login.jsx, Signup.jsx
│       │   ├── Dashboard.jsx     # bento grid home screen
│       │   ├── ChatsPage.jsx     # every conversation, search + filter
│       │   ├── FriendsPage.jsx   # friends, requests, invites
│       │   └── ChatPage.jsx      # full chat view (room or DM) with a pop-out info panel
│       └── components/
│           ├── NavRail.jsx       # Dashboard, Chats, Friends, Settings, you
│           ├── ChatList.jsx      # search + filter + every conversation
│           ├── FriendsPanel.jsx  # search + Online/All/Pending chips
│           ├── NewChatModal.jsx, AddFriendModal.jsx
│           ├── Icon.jsx          # line icons
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
        ├── routes/               # auth, users, friends, conversations, dms, rooms, invites
        ├── services/
        │   ├── conversations.js  # chat list + unread counts + read tracking
        │   ├── e2ee.js           # checks encrypted data looks right (format + size)
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

- Messages are end-to-end encrypted (see above). Passwords never leave the browser; the server stores a bcrypt hash of the login secret. Emails are never shown to other users.
- Socket connections need a valid JWT, so senders can't be faked.
- Rooms are private: non-members can't see them, read their history or send messages, and get a 404 as if the room doesn't exist.
- You can only DM and invite people who are your friends.
- Inputs are validated, and only plain strings reach MongoDB queries.
- Messages are shown as plain text (React escapes them), so HTML or scripts in a message never run. Only `http`/`https` links become clickable.
- Avatars must be real photos (JPG, PNG, WEBP, GIF). SVG is rejected because it can contain scripts, and images are served with `nosniff`.
- Changing your password needs your current password, and re-locks the same keys so old messages stay readable.
- `.env` is in `.gitignore`. Never commit your real secrets.

## 🗺️ Roadmap

- [x] Server setup, signup and login
- [x] Rooms
- [x] Live messaging with Socket.io
- [x] Message history
- [x] Online users
- [x] Typing indicator
- [x] React frontend
- [x] Friends, DMs, invite-only rooms
- [x] Bento-grid dashboard redesign
- [x] Profiles with photo upload, final polish
- [x] End-to-end encryption

### Ideas for later
- Deploy online (e.g. Render for the server, Vercel for the client, MongoDB Atlas)
- Image and file sharing in messages (encrypted the same way)
- Message editing, deleting and reactions
- Room admin tools (rename, remove members)
- Browser notifications for new DMs
