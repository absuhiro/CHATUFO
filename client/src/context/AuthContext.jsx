import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "../utils/api";

// Holds who is logged in, and the login / signup / logout actions.
// Any component can read it with useAuth().
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState(null);
  // If a token was saved from last time, we must check it before showing anything
  const [checking, setChecking] = useState(() => !!tokenStore.get());

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  // On page load: turn a saved token back into a user (or drop it if expired)
  useEffect(() => {
    if (!token || user) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api("/auth/me")
      .then(({ user }) => !cancelled && setUser(user))
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [token, user, logout]);

  const saveSession = ({ token, user }) => {
    tokenStore.set(token);
    setToken(token);
    setUser(user);
  };

  // "login" can be an email or a username
  const login = async (login, password) => {
    saveSession(await api("/auth/login", { method: "POST", body: { login, password } }));
  };

  const signup = async ({ name, username, email, password }) => {
    saveSession(await api("/auth/signup", { method: "POST", body: { name, username, email, password } }));
  };

  return (
    <AuthContext.Provider value={{ token, user, checking, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
