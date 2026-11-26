const mongoose = require("mongoose");

// 3 to 20 characters: lowercase letters, numbers, dots and underscores (like Discord)
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    // How friends find you. "sparse" lets old accounts exist without one until the startup migration fills it in.
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, match: USERNAME_RE },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // bcrypt of the "login secret" (authVersion 2) or of the plain password (old accounts, authVersion 1)
    passwordHash: { type: String, required: true },

    // ----- End-to-end encryption -----
    // 1 = old account from before encryption (upgraded on next login), 2 = encrypted account
    authVersion: { type: Number, default: 1 },
    // Random salt the browser uses to turn your password into your two secrets
    kdfSalt: { type: String },
    // Public keys: anyone can have these. Used to lock messages FOR you and check YOUR signatures.
    publicKey: { type: String },
    signingPublicKey: { type: String },
    // Your private keys, locked in your browser with a secret only your password can make.
    // The server stores it but can't open it.
    encryptedPrivateKeys: {
      type: { iv: String, data: String },
      select: false,
    },
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
    publicKey: this.publicKey || null,
    signingPublicKey: this.signingPublicKey || null,
  };
};

// Public keys for encryption (null for old accounts that haven't upgraded yet)
userSchema.methods.toKeys = function () {
  return {
    id: String(this._id),
    publicKey: this.publicKey || null,
    signingPublicKey: this.signingPublicKey || null,
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
