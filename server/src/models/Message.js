const mongoose = require("mongoose");

// type "encrypted"  a user's message. The server only has scrambled data:
//                   ciphertext + iv, one locked key per member, and the sender's signature.
// type "system"     a notice saved in the history, like "Alien joined the room" (plain text, written by the server)
// type "text"       old unencrypted messages (deleted at startup, kept here only so old data loads)
const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    type: { type: String, enum: ["encrypted", "system", "text"], default: "encrypted" },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.type !== "system";
      },
    },
    // System notices only
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: function () {
        return this.type !== "encrypted";
      },
    },
    // Encrypted messages only
    ciphertext: { type: String },
    iv: { type: String },
    signature: { type: String },
    keys: { type: Map, of: String }, // userId -> that member's locked copy of the message key
  },
  { timestamps: true }
);

// Makes "latest messages in this room" fast. Sorted by _id because ids grow over
// time and, unlike timestamps, two messages never share one.
messageSchema.index({ room: 1, _id: -1 });

/**
 * Shape sent to clients. Expects sender to be populated, or pass the sender in.
 * forUserId: only include THAT member's locked key (smaller history downloads).
 * Without it (live broadcast to the whole room) every member's locked key is included.
 */
messageSchema.methods.toPublic = function (sender, forUserId) {
  const base = {
    id: String(this._id),
    roomId: String(this.room),
    type: this.type || "text",
    createdAt: this.createdAt,
  };
  if (base.type === "system") return { ...base, text: this.text };

  // If the sender's account was deleted, populate gives null
  const s = sender || this.sender || { id: null, name: "Deleted user", avatarUrl: "" };
  const id = s._id || s.id;
  const out = {
    ...base,
    sender: { id: id ? String(id) : null, name: s.name, username: s.username, avatarUrl: s.avatarUrl },
  };
  if (base.type !== "encrypted") return { ...out, text: this.text };

  let keys = {};
  if (this.keys) {
    if (forUserId) {
      const mine = this.keys.get(String(forUserId));
      if (mine) keys[String(forUserId)] = mine;
    } else {
      keys = Object.fromEntries(this.keys);
    }
  }
  return { ...out, ciphertext: this.ciphertext, iv: this.iv, signature: this.signature, keys };
};

module.exports = mongoose.model("Message", messageSchema);
