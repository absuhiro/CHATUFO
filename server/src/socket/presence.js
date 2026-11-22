// Keeps track of who is online right now. Lives in server memory (not MongoDB),
// because "online" only means "has an open connection to this server".
//
// One user can have several connections (two tabs, phone + laptop), so we store
// a Set of socket ids per user. The user is online while that Set is not empty.
//
//   onlineUsers: Map {
//     "userId1" => { user: { id, name, avatarUrl }, sockets: Set { "sockA", "sockB" } },
//     "userId2" => { user: {...}, sockets: Set { "sockC" } },
//   }
const onlineUsers = new Map();

// Returns true if this is the user's FIRST connection (they just came online)
function addConnection(user, socketId) {
  let entry = onlineUsers.get(user.id);
  if (!entry) {
    entry = {
      user: { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl },
      sockets: new Set(),
    };
    onlineUsers.set(user.id, entry);
  }
  entry.sockets.add(socketId);
  return entry.sockets.size === 1;
}

// Returns true if that was the user's LAST connection (they just went offline)
function removeConnection(userId, socketId) {
  const entry = onlineUsers.get(userId);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
}

// List of online users, sorted by name
function getOnlineUsers() {
  return [...onlineUsers.values()]
    .map((e) => e.user)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Someone changed their name or photo: update the online list copy (Step 8)
function updateUser(card) {
  const entry = onlineUsers.get(card.id);
  if (entry) entry.user = { id: card.id, name: card.name, username: card.username, avatarUrl: card.avatarUrl };
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

module.exports = { addConnection, removeConnection, getOnlineUsers, isOnline, updateUser };
