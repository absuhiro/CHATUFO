const mongoose = require("mongoose");

// 3 to 20 characters: lowercase letters, numbers, dots and underscores (like Discord)
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    // How friends find you. "sparse" lets old accounts exist without one until the startup migration fills it in.
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, match: USERNAME_RE },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Where the browser loads the avatar from, e.g. "/api/users/<id>/avatar?v=1700000000000".
    // The "?v=" part changes on every upload so browsers don't show an old cached photo.
    avatarUrl: { type: String, default: "" },
    // The image itself. select: false = never loaded unless asked for, so normal
    // user lookups (messages, friend lists) stay small and fast.
    avatar: {
      type: { data: Buffer, contentType: String },
      select: false,
    },
    bio: { type: String, trim: true, maxlength: 190, default: "" },
  },
  { timestamps: true }
);

// Never send the password hash to the client
userSchema.methods.toPublic = function () {
  return {
    id: String(this._id),
    name: this.name,
    username: this.username,
    email: this.email,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
  };
};

// What OTHER people see about you (no email)
userSchema.methods.toCard = function () {
  return {
    id: String(this._id),
    name: this.name,
    username: this.username,
    avatarUrl: this.avatarUrl,
    bio: this.bio || "",
  };
};

userSchema.statics.USERNAME_RE = USERNAME_RE;

module.exports = mongoose.model("User", userSchema);
