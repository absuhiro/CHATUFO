const mongoose = require("mongoose");

// Two kinds of room:
//   "group"  an invite-only room with a name (members invite their friends)
//   "dm"     a private chat between exactly two friends
const roomSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["group", "dm"], default: "group" },
    name: { type: String, trim: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 200, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // DMs only: "smallerId:biggerId" so the same two people always get the same DM
    dmKey: { type: String, unique: true, sparse: true },
    // Updated on every message, used to sort DMs and rooms by recent activity
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

roomSchema.index({ members: 1, type: 1 });

roomSchema.methods.isMember = function (userId) {
  return this.members.some((m) => String(m._id || m) === String(userId));
};

roomSchema.methods.toPublic = function () {
  return {
    id: String(this._id),
    type: this.type,
    name: this.name,
    description: this.description,
    createdBy: String(this.createdBy),
    memberCount: this.members.length,
    lastMessageAt: this.lastMessageAt,
    createdAt: this.createdAt,
  };
};

roomSchema.statics.dmKeyFor = (a, b) => [String(a), String(b)].sort().join(":");

module.exports = mongoose.model("Room", roomSchema);
