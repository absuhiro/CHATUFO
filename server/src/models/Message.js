const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// Makes "latest messages in this room" fast. History is sorted by _id because
// MongoDB ids grow over time and, unlike timestamps, two messages never share one.
messageSchema.index({ room: 1, _id: -1 });

// Shape sent to clients. Expects sender to be populated, or pass the sender in.
messageSchema.methods.toPublic = function (sender) {
  // If the sender's account was deleted, populate gives null
  const s = sender || this.sender || { id: null, name: "Deleted user", avatarUrl: "" };
  return {
    id: String(this._id),
    roomId: String(this.room),
    text: this.text,
    createdAt: this.createdAt,
    sender: { id: s._id || s.id ? String(s._id || s.id) : null, name: s.name, avatarUrl: s.avatarUrl },
  };
};

module.exports = mongoose.model("Message", messageSchema);
