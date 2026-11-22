const mongoose = require("mongoose");

// One document per pair of people.
//   status "pending"  requester sent a request, recipient hasn't answered
//   status "accepted" they're friends
// Declining or removing a friend deletes the document.
const friendshipSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // "smallerId:biggerId", unique, so two people can never have two friendship records
    pairKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending" },
  },
  { timestamps: true }
);

friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

friendshipSchema.statics.pairKeyFor = (a, b) => [String(a), String(b)].sort().join(":");

module.exports = mongoose.model("Friendship", friendshipSchema);
