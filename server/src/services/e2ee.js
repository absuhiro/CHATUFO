// The server can't read encrypted data, but it can still check it LOOKS right:
// valid base64 and a sensible size. This stops junk or oversized uploads.

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isB64(value, min, max) {
  return typeof value === "string" && value.length >= min && value.length <= max && B64_RE.test(value);
}

// Sizes measured from the client's crypto (see client/src/crypto/e2ee.js)
const LIMITS = {
  authHash: [44, 44], // 32 bytes
  kdfSalt: [24, 24], // 16 bytes
  iv: [16, 16], // 12 bytes
  publicKey: [300, 1000], // RSA-2048 public key, ~392
  signingPublicKey: [100, 200], // P-256 public key, ~124
  backupData: [500, 10000], // locked private keys, ~2.5k
  lockedKey: [300, 800], // one member's locked message key, ~344
  signature: [80, 120], // P-256 signature, ~88
  ciphertext: [20, 12000], // up to 2000 characters of text
};

const check = (name, value) => isB64(value, ...LIMITS[name]);

function isSealedBackup(v) {
  return !!v && typeof v === "object" && check("iv", v.iv) && check("backupData", v.data);
}

// Everything a client sends when it creates (or upgrades) an encrypted account
function validAccountKeys(body) {
  return (
    check("authHash", body.authHash) &&
    check("kdfSalt", body.kdfSalt) &&
    check("publicKey", body.publicKey) &&
    check("signingPublicKey", body.signingPublicKey) &&
    isSealedBackup(body.encryptedPrivateKeys)
  );
}

module.exports = { isB64, check, isSealedBackup, validAccountKeys };
