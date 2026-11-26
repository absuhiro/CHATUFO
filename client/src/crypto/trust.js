// "Trust on first use", like Signal and WhatsApp.
// The first time you see someone's security code, it's remembered in this browser.
// If it's ever different later, their keys changed. In UFOCHAT keys never change on their
// own, so that's a warning sign (or a server swapping keys) and the app shows a warning.

const storageKey = (myId) => `ufochat_trusted_codes_${myId}`;

function read(myId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(myId)) || "{}");
  } catch {
    return {};
  }
}

function write(myId, data) {
  try {
    localStorage.setItem(storageKey(myId), JSON.stringify(data));
  } catch {
    // storage full or blocked: warnings just won't persist
  }
}

// Returns the ids whose code changed since we first saw them. New people are remembered silently.
export function checkCodes(myId, people) {
  const seen = read(myId);
  const changed = [];
  let dirty = false;
  for (const p of people) {
    if (!p.code || p.id === myId) continue;
    if (!seen[p.id]) {
      seen[p.id] = p.code;
      dirty = true;
    } else if (seen[p.id] !== p.code) {
      changed.push(p.id);
    }
  }
  if (dirty) write(myId, seen);
  return changed;
}

// "I've checked it": accept the new codes
export function acceptCodes(myId, people) {
  const seen = read(myId);
  for (const p of people) if (p.code) seen[p.id] = p.code;
  write(myId, seen);
}
