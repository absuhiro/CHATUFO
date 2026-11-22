const mongoose = require("mongoose");

// type "text"   a normal message from a user
// type "system" a notice saved in the history, like "Alien joined the room"
const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    type: { type: String, enum: ["text", "system"], default: "text" },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.type !== "system";
      },
    },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// Makes "latest messages in this room" fast. Sorted by _id because ids grow over
// time and, unlike timestamps, two messages never share one.
messageSchema.index({ room: 1, _id: -1 });

// Shape sent to clients. Expects sender to be populated, or pass the sender in.
messageSchema.methods.toPublic = function (sender) {
  const base = {
    id: String(this._id),
    roomId: String(this.room),
    type: this.type || "text",
    text: this.text,
    createdAt: this.createdAt,
  };
  if (base.type === "system") return base;

  // If the sender's account was deleted, populate gives null
  const s = sender || this.sender || { id: null, name: "Deleted user", avatarUrl: "" };
  const id = s._id || s.id;
  return {
    ...base,
    sender: { id: id ? String(id) : null, name: s.name, username: s.username, avatarUrl: s.avatarUrl },
  };
};

module.exports = mongoose.model("Message", messageSchema);
