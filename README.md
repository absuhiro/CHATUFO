# CampusChat

A real-time chat app for one campus or club. Users sign up, join rooms, and talk live. Think of a small WhatsApp or Discord.

> **Status:** Planning. Features are decided, no code written yet.

---

## Tech Stack

| Layer      | Choice                              |
| ---------- | ----------------------------------- |
| Frontend   | React (Vite)                        |
| Backend    | Node.js + Express                   |
| Realtime   | Socket.io                           |
| Database   | MongoDB (Mongoose)                  |
| Auth       | JWT + bcrypt                        |
| Avatars    | Image upload (Multer) or URL, decided in Phase 5 |

---

## Features

### MVP (must have)

**1. Authentication**
- Sign up with name, email, password
- Log in and log out
- Passwords hashed with bcrypt
- JWT used for both REST routes and the socket handshake

**2. Rooms**
- Create a room (name, optional description)
- Browse the list of rooms
- Join and leave a room
- Public rooms only in the MVP

**3. Live messaging**
- Send a message to a room, everyone in the room sees it instantly
- No page refresh needed
- Each message shows sender name, avatar, and time

**4. Message history**
- Every message is saved in MongoDB
- When a user opens a room, the last 50 messages load
- Older messages load on scroll up (pagination)

**5. Online users**
- Live list of users currently online in a room
- Updates when someone connects or disconnects

**6. Typing indicator**
- Shows "Riya is typing..." when someone types
- Disappears after a short pause

**7. Basic profile**
- Display name and avatar
- Edit your own profile

### Later (nice to have, not in MVP)
- Private rooms with invite codes
- Direct messages (1-to-1)
- Unread message counts
- Edit and delete your own messages
- Image and file sharing
- Message reactions
- Search within a room
- Read receipts
- Dark mode

### Out of scope
- Voice and video calls
- End-to-end encryption
- Mobile apps
- Push notifications

---

## Data Models

**User**
```
_id, name, email, passwordHash, avatarUrl, createdAt
```

**Room**
```
_id, name, description, createdBy (User), members [User], createdAt
```

**Message**
```
_id, room (Room), sender (User), text, createdAt
```
Index on `{ room: 1, createdAt: -1 }` so history queries stay fast.

Online status is **not** stored in MongoDB. It lives in server memory and is rebuilt from socket connections.

---

## REST API (planned)

| Method | Route                     | Purpose                          |
| ------ | ------------------------- | -------------------------------- |
| POST   | `/api/auth/signup`        | Create account                   |
| POST   | `/api/auth/login`         | Log in, returns JWT              |
| GET    | `/api/users/me`           | Get current user                 |
| PUT    | `/api/users/me`           | Update name and avatar           |
| GET    | `/api/rooms`              | List rooms                       |
| POST   | `/api/rooms`              | Create a room                    |
| POST   | `/api/rooms/:id/join`     | Join a room                      |
| POST   | `/api/rooms/:id/leave`    | Leave a room                     |
| GET    | `/api/rooms/:id/messages` | Paginated message history        |

---

## Socket.io Events (planned)

**Client → Server**

| Event          | Payload              | Meaning                      |
| -------------- | -------------------- | ---------------------------- |
| `room:join`    | `{ roomId }`         | Enter a room's live channel  |
| `room:leave`   | `{ roomId }`         | Leave it                     |
| `message:send` | `{ roomId, text }`   | Send a message               |
| `typing:start` | `{ roomId }`         | User started typing          |
| `typing:stop`  | `{ roomId }`         | User stopped typing          |

**Server → Client**

| Event            | Payload                    | Meaning                          |
| ---------------- | -------------------------- | -------------------------------- |
| `message:new`    | `{ message }`              | New message in the room          |
| `presence:list`  | `{ roomId, users }`        | Current online users in the room |
| `presence:update`| `{ userId, status }`       | Someone came online or went offline |
| `typing:update`  | `{ roomId, users }`        | Who is typing right now          |

The server saves a message to MongoDB first, then broadcasts it. This keeps history and live view consistent.

---

## Folder Structure (planned)

```
campuschat/
├── client/                 # React app
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── context/        # Auth + Socket providers
│       ├── hooks/
│       └── api/
├── server/                 # Node app
│   ├── src/
│   │   ├── config/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/     # JWT auth for REST and sockets
│   │   ├── sockets/
│   │   └── index.js
│   └── .env
└── README.md
```

---

## Build Roadmap

We build in small phases. Each phase ends with something that works.

| Phase | Goal                                                          |
| ----- | ------------------------------------------------------------- |
| 0     | Decide features, write README (this file)                     |
| 1     | Project setup: Express server, MongoDB connection, React app  |
| 2     | Auth: signup, login, JWT, protected routes                    |
| 3     | Rooms: create, list, join, leave                              |
| 4     | Socket.io: live messaging + saving messages                   |
| 5     | Message history, pagination, profile and avatar               |
| 6     | Online users list and typing indicator                        |
| 7     | Polish: error handling, loading states, basic styling         |
| 8     | Deploy (Render/Railway for server, Vercel/Netlify for client, MongoDB Atlas) |

---

## Open Questions

- Avatar: file upload or just a URL / generated initials? (Decide in Phase 5)
- Should anyone be able to create rooms, or only admins?
- Should room members be required to join before reading messages? (Default: yes)

---

## Getting Started

Setup instructions will be added in Phase 1.

## License

MIT