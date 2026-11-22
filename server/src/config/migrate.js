const User = require("../models/User");
const Room = require("../models/Room");

// Runs once at startup. Upgrades data created by earlier steps so old accounts keep working.
async function migrate() {
  // 1. Rooms from before DMs existed have no "type": they're group rooms
  await Room.updateMany({ type: { $exists: false } }, { $set: { type: "group" } });

  // 2. Make the database indexes match the models. This removes the old
  //    "room names must be unique" index (rooms are private now, so names can repeat).
  await Room.syncIndexes();

  // 3. Accounts from before usernames existed get one based on their email (abhi@test.com -> abhi)
  const users = await User.find({ $or: [{ username: { $exists: false } }, { username: null }] });
  for (const user of users) {
    let base = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 16);
    if (base.length < 3) base = (base + "user").slice(0, 16);
    let candidate = base;
    let n = 1;
    while (await User.exists({ username: candidate })) candidate = `${base}${n++}`;
    user.username = candidate;
    await user.save();
    console.log(`Gave ${user.email} the username @${candidate}`);
  }
}

module.exports = migrate;
