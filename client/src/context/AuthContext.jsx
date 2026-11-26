import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "../utils/api";
import {
  createAccountKeys,
  deriveFromPassword,
  importPrivateKeys,
  openBundle,
  randomB64,
  sealBundle,
} from "../crypto/e2ee";
import { clearKeys, loadKeys, saveKeys } from "../crypto/keyStore";
import { clearPublicKeyCache } from "../crypto/publicKeys";

// Holds who is logged in, their unlocked private keys, and the auth actions.
// Any component can read it with useAuth().
//
// End-to-end encryption: your password never leaves this browser. It's turned into
//   - a login secret (sent to the server)
//   - a key secret (unlocks your private keys, never sent)
// See src/crypto/e2ee.js.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState(null);
  const [keys, setKeys] = useState(null); // { decryptKey, signKey }
  const [notice, setNotice] = useState(""); // shown on the login page, e.g. "log in again"
  // If a token was saved from last time, we must check it before showing anything
  const [checking, setChecking] = useState(() => !!tokenStore.get());

  const logout = useCallback((message = "") => {
    tokenStore.clear();
    clearKeys();
    clearPublicKeyCache();
    setToken(null);
    setUser(null);
    setKeys(null);
    setNotice(typeof message === "string" ? message : "");
  }, []);

  // On page load: turn a saved token back into a user + their keys from this browser
  useEffect(() => {
    if (!token || user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/auth/me");
        const stored = res.needsKeySetup ? null : await loadKeys(res.user.id);
        if (cancelled) return;
        if (!stored) {
          // Keys aren't in this browser (or the account needs upgrading): the password is needed
          logout("Log in again to unlock your encrypted messages.");
        } else {
          setKeys(stored);
          setUser(res.user);
        }
      } catch {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user, logout]);

  const finishLogin = async (newToken, newUser, privateKeys) => {
    await saveKeys(newUser.id, privateKeys).catch(() => {}); // private window may block storage: still works until refresh
    tokenStore.set(newToken);
    setNotice("");
    setKeys(privateKeys);
    setToken(newToken);
    setUser(newUser);
  };

  // "login" can be an email or a username
  const login = async (login, password) => {
    const pre = await api("/auth/prelogin", { method: "POST", body: { login } });

    if (pre.version === 1) {
      // Old account from before encryption: log in the old way once, then upgrade it
      const res = await api("/auth/login", { method: "POST", body: { login, password } });
      tokenStore.set(res.token); // needed for the setup-keys request
      try {
        const account = await createAccountKeys(password);
        const { user } = await api("/auth/setup-keys", { method: "POST", body: { password, ...account.server } });
        return await finishLogin(res.token, user, account.privateKeys);
      } catch (err) {
        tokenStore.clear();
        throw err;
      }
    }

    const { wrapKey, authHash } = await deriveFromPassword(password, pre.kdfSalt);
    const res = await api("/auth/login", { method: "POST", body: { login, authHash } });
    let privateKeys;
    try {
      privateKeys = await importPrivateKeys(await openBundle(res.encryptedPrivateKeys, wrapKey));
    } catch {
      throw new Error("Couldn't unlock your encryption keys");
    }
    return finishLogin(res.token, res.user, privateKeys);
  };

  const signup = async ({ name, username, email, password }) => {
    const account = await createAccountKeys(password);
    const res = await api("/auth/signup", { method: "POST", body: { name, username, email, ...account.server } });
    return finishLogin(res.token, res.user, account.privateKeys);
  };

  // Re-locks the same private keys with the new password, so every old message stays readable
  const changePassword = async (currentPassword, newPassword) => {
    const backup = await api("/users/me/keys");
    const current = await deriveFromPassword(currentPassword, backup.kdfSalt);
    let bundle;
    try {
      bundle = await openBundle(backup.encryptedPrivateKeys, current.wrapKey);
    } catch {
      throw new Error("Current password is wrong");
    }
    const newKdfSalt = randomB64(16);
    const next = await deriveFromPassword(newPassword, newKdfSalt);
    await api("/users/me/password", {
      method: "PATCH",
      body: {
        currentAuthHash: current.authHash,
        newAuthHash: next.authHash,
        newKdfSalt,
        encryptedPrivateKeys: await sealBundle(bundle, next.wrapKey),
      },
    });
  };

  return (
    <AuthContext.Provider
      value={{ token, user, keys, checking, notice, login, signup, logout, setUser, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
