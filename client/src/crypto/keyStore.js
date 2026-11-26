// Keeps your unlocked private keys in THIS browser (IndexedDB), so you stay able to
// read messages after a page refresh without typing your password again.
// The keys are stored as non-extractable CryptoKeys: usable here, but they can't be exported.
// Logging out deletes them.

const DB_NAME = "ufochat-keys";
const STORE = "keys";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req && req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

export const saveKeys = (userId, keys) => run("readwrite", (s) => s.put(keys, userId));
export const loadKeys = (userId) => run("readonly", (s) => s.get(userId)).catch(() => null);
export const clearKeys = () => run("readwrite", (s) => s.clear()).catch(() => {});
