// UFOCHAT end-to-end encryption, built on the browser's own Web Crypto API.
// No extra packages. The same code also runs in Node 18+ (used for testing).
//
// THE IDEA
//   Every user has two key pairs, made in their browser at signup:
//     - an RSA-OAEP pair: others lock message keys with the PUBLIC half, only you unlock with the PRIVATE half
//     - an ECDSA pair: you SIGN your messages, others VERIFY they really came from you
//   Public halves go to the server so others can find them. Private halves never leave your
//   browser unlocked: they're stored on the server only inside a "key backup" locked with your password.
//
// YOUR PASSWORD BECOMES TWO SECRETS (PBKDF2, 512 bits split in half)
//   - wrapKey:  locks/unlocks your key backup. Never sent anywhere.
//   - authHash: what you log in with. The server only ever sees this.
//   Knowing authHash doesn't reveal wrapKey, so the server can't unlock your backup.
//
// SENDING A MESSAGE
//   1. Make a fresh random AES-256-GCM key, encrypt the text with it.
//   2. Lock that AES key once for every member (with their RSA public key), including yourself.
//   3. Sign the result with your ECDSA private key.
//   The server stores and forwards only scrambled data.

const subtle = globalThis.crypto.subtle;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const KDF_ITERATIONS = 600000; // slows down password guessing (OWASP recommendation for PBKDF2-SHA256)

const RSA = { name: "RSA-OAEP", hash: "SHA-256" };
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };

// ---------- base64 helpers ----------

export function toB64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function randomB64(byteLength) {
  return toB64(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)));
}

// ---------- password -> two secrets ----------

export async function deriveFromPassword(password, kdfSaltB64, iterations = KDF_ITERATIONS) {
  const base = await subtle.importKey("raw", textEncoder.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = new Uint8Array(
    await subtle.deriveBits({ name: "PBKDF2", salt: fromB64(kdfSaltB64), iterations, hash: "SHA-256" }, base, 512)
  );
  const wrapKey = await subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const authHash = toB64(bits.slice(32));
  return { wrapKey, authHash };
}

// ---------- key backup (private keys locked with wrapKey) ----------

export async function sealBundle(bundleBytes, wrapKey) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, bundleBytes);
  return { iv: toB64(iv), data: toB64(data) };
}

// Throws if the password (wrapKey) is wrong, because AES-GCM detects tampering and wrong keys
export async function openBundle(sealed, wrapKey) {
  const bytes = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv) }, wrapKey, fromB64(sealed.data));
  return new Uint8Array(bytes);
}

// Turns the unlocked backup into usable keys. extractable = false: the keys can be USED
// but never exported again, so even malicious code on the page can't copy them out.
export async function importPrivateKeys(bundleBytes) {
  const bundle = JSON.parse(textDecoder.decode(bundleBytes));
  const decryptKey = await subtle.importKey("pkcs8", fromB64(bundle.decrypt), RSA, false, ["decrypt"]);
  const signKey = await subtle.importKey("pkcs8", fromB64(bundle.sign), ECDSA, false, ["sign"]);
  return { decryptKey, signKey };
}

// ---------- new account ----------

/**
 * Everything a new account (or an old account being upgraded) needs.
 *   server:      what gets sent to the server (no secrets in it)
 *   privateKeys: the usable keys to keep in this browser
 */
export async function createAccountKeys(password, iterations = KDF_ITERATIONS) {
  const kdfSalt = randomB64(16);
  const { wrapKey, authHash } = await deriveFromPassword(password, kdfSalt, iterations);

  const encPair = await subtle.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, [
    "encrypt",
    "decrypt",
  ]);
  const signPair = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);

  const publicKey = toB64(await subtle.exportKey("spki", encPair.publicKey));
  const signingPublicKey = toB64(await subtle.exportKey("spki", signPair.publicKey));
  const bundleBytes = textEncoder.encode(
    JSON.stringify({
      v: 1,
      decrypt: toB64(await subtle.exportKey("pkcs8", encPair.privateKey)),
      sign: toB64(await subtle.exportKey("pkcs8", signPair.privateKey)),
    })
  );
  const encryptedPrivateKeys = await sealBundle(bundleBytes, wrapKey);

  return {
    server: { kdfSalt, authHash, publicKey, signingPublicKey, encryptedPrivateKeys },
    privateKeys: await importPrivateKeys(bundleBytes),
  };
}

// ---------- other people's public keys ----------

export async function importPublicKeys({ publicKey, signingPublicKey }) {
  const encryptKey = await subtle.importKey("spki", fromB64(publicKey), RSA, false, ["encrypt"]);
  const verifyKey = await subtle.importKey("spki", fromB64(signingPublicKey), ECDSA, false, ["verify"]);
  return { encryptKey, verifyKey };
}

/**
 * Security code: a short number made from someone's public keys (like Signal's safety numbers).
 * If two friends see the same code for the same person on their screens, nobody swapped the keys.
 */
export async function securityCode({ publicKey, signingPublicKey }) {
  const joined = new Uint8Array([...fromB64(publicKey), ...fromB64(signingPublicKey)]);
  const hash = new Uint8Array(await subtle.digest("SHA-256", joined));
  const groups = [];
  for (let i = 0; i < 6; i++) {
    const chunk = hash.slice(i * 5, i * 5 + 5).reduce((n, b) => n * 256 + b, 0);
    groups.push(String(chunk % 100000).padStart(5, "0"));
  }
  return groups.join(" ");
}

// ---------- messages ----------

// What the signature covers. Binding the room and sender means a message can't be
// moved to another room or passed off as someone else's.
function signedPayload({ roomId, senderId, iv, ciphertext }) {
  return textEncoder.encode(`ufochat-v1|${roomId}|${senderId}|${iv}|${ciphertext}`);
}

/**
 * recipients: [{ id, encryptKey }] every member who should be able to read it (include yourself)
 * Returns { ciphertext, iv, keys: { userId: lockedKey }, signature } (all base64)
 */
export async function encryptMessage({ text, roomId, senderId, recipients, signKey }) {
  const messageKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawKey = await subtle.exportKey("raw", messageKey);
  const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes, additionalData: textEncoder.encode(`${roomId}|${senderId}`) },
    messageKey,
    textEncoder.encode(text)
  );

  const keys = {};
  for (const r of recipients) {
    keys[r.id] = toB64(await subtle.encrypt({ name: "RSA-OAEP" }, r.encryptKey, rawKey));
  }

  const iv = toB64(ivBytes);
  const ciphertext = toB64(encrypted);
  const signature = toB64(await subtle.sign(SIGN, signKey, signedPayload({ roomId, senderId, iv, ciphertext })));
  return { ciphertext, iv, keys, signature };
}

/**
 * msg: an encrypted message from the server ({ roomId, sender: { id }, iv, ciphertext, signature, keys })
 * Returns { status, text?, verified? }
 *   status "ok"      decrypted; verified = true/false (signature check), or null if the sender's key is unknown
 *   status "no-key"  no locked key for you (sent before you joined / before you set up encryption)
 *   status "failed"  data was damaged or tampered with
 */
export async function decryptMessage({ msg, myId, decryptKey, verifyKey }) {
  const lockedKey = msg.keys && msg.keys[myId];
  if (!lockedKey) return { status: "no-key" };

  const senderId = msg.sender && msg.sender.id;
  let verified = null;
  if (verifyKey) {
    try {
      verified = await subtle.verify(
        SIGN,
        verifyKey,
        fromB64(msg.signature || ""),
        signedPayload({ roomId: msg.roomId, senderId, iv: msg.iv, ciphertext: msg.ciphertext })
      );
    } catch {
      verified = false;
    }
  }

  try {
    const rawKey = await subtle.decrypt({ name: "RSA-OAEP" }, decryptKey, fromB64(lockedKey));
    const messageKey = await subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const plain = await subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(msg.iv), additionalData: textEncoder.encode(`${msg.roomId}|${senderId}`) },
      messageKey,
      fromB64(msg.ciphertext)
    );
    return { status: "ok", text: textDecoder.decode(plain), verified };
  } catch {
    return { status: "failed" };
  }
}
