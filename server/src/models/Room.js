const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    // Lowercase copy of the name so "General" and "general" count as the same room
    nameLower: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: 200, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// Shape sent to the client. Pass the logged in user's id to get an "isMember" flag.
roomSchema.methods.toPublic = function (userId) {
  return {
    id: this._id,
    name: this.name,
    description: this.description,
    createdBy: this.createdBy,
    memberCount: this.members.length,
    isMember: userId ? this.members.some((m) => String(m._id || m) === String(userId)) : undefined,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Room", roomSchema);
