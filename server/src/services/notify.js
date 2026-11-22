// Every connected socket also joins a personal room called "user:<id>" (see socket/index.js).
// That lets REST routes reach a specific person on all their tabs and devices.
//
// Events are small "something changed, refetch" signals:
//   friends_changed   friend list or requests changed
//   invites_changed   room invites changed
//   rooms_changed     your rooms or DMs changed
function notifyUsers(req, userIds, event, data = {}) {
  const io = req.app.get("io");
  if (!io) return;
  const targets = [...new Set(userIds.map((id) => `user:${id}`))];
  if (targets.length) io.to(targets).emit(event, data);
}

module.exports = { notifyUsers };
