import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(loginValue.trim(), password);
      // Success: GuestOnly in App.jsx sees the user and redirects to the chat
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">🛸</div>
        <h1>Welcome back</h1>
        <p className="muted">Log in to UFOCHAT</p>

        <label>
          Email or username
          <input
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <div className="form-error">{error}</div>}

        <button className="btn-primary" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
        <p className="muted center">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
