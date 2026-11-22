const mongoose = require("mongoose");

// A room member ("from") invites a friend ("to"). It stays here until accepted or declined.
const roomInviteSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Only one open invite per person per room
roomInviteSchema.index({ room: 1, to: 1 }, { unique: true });
roomInviteSchema.index({ to: 1 });

module.exports = mongoose.model("RoomInvite", roomInviteSchema);
