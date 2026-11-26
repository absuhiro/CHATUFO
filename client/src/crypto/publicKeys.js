import { api } from "../utils/api";
import { importPublicKeys, securityCode } from "./e2ee";

// A cache of other people's public keys, so each one is fetched and imported once.
//   userId -> Promise<{ publicKey, signingPublicKey, encryptKey, verifyKey, code } | null>
// null = that user hasn't set up encryption yet (an old account that hasn't logged in since).
const cache = new Map();

async function build(raw) {
  if (!raw || !raw.publicKey || !raw.signingPublicKey) return null;
  const imported = await importPublicKeys(raw);
  return { ...raw, ...imported, code: await securityCode(raw) };
}

// Members from GET /rooms/:id already include public keys: add them without another request.
// If someone's key changed, the newest one replaces the cached one.
export function rememberKeys(list) {
  for (const m of list) {
    if (!m.publicKey) continue;
    const existing = cache.get(m.id);
    if (existing && existing.publicKey === m.publicKey && existing.signingPublicKey === m.signingPublicKey) continue;
    const p = build(m);
    p.publicKey = m.publicKey;
    p.signingPublicKey = m.signingPublicKey;
    cache.set(m.id, p);
  }
}

// Returns a Map userId -> keys (or null), fetching any we don't have in one request
export async function getPublicKeys(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !cache.has(id));
  if (missing.length) {
    const request = api("/users/public-keys", { method: "POST", body: { ids: missing } }).then((r) => r.keys);
    for (const id of missing) {
      cache.set(
        id,
        request.then((keys) => build(keys[id])).catch(() => {
          cache.delete(id); // try again next time
          return null;
        })
      );
    }
  }
  const out = new Map();
  for (const id of ids) if (id) out.set(id, await cache.get(id));
  return out;
}

export function clearPublicKeyCache() {
  cache.clear();
}
