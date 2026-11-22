import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // One handler for all inputs, using each input's "name"
  const update = (e) => {
    let value = e.target.value;
    // Usernames are lowercase with no spaces, so fix it as they type
    if (e.target.name === "username") value = value.toLowerCase().replace(/\s/g, "");
    setForm({ ...form, [e.target.name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // Quick checks before bothering the server (the server checks again anyway)
    if (form.name.trim().length < 2) return setError("Name must be at least 2 characters");
    if (!/^[a-z0-9_.]{3,20}$/.test(form.username)) {
      return setError("Username must be 3 to 20 characters: letters, numbers, dots or underscores");
    }
    if (form.password.length < 6) return setError("Password must be at least 6 characters");

    setBusy(true);
    try {
      await signup({ ...form, name: form.name.trim(), email: form.email.trim() });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">🛸</div>
        <h1>Join UFOCHAT</h1>
        <p className="muted">Create your account</p>

        <label>
          Display name
          <input name="name" value={form.name} onChange={update} maxLength={50} required autoFocus />
        </label>
        <label>
          Username
          <input name="username" value={form.username} onChange={update} maxLength={20} autoCapitalize="none" required />
          <span className="hint">Friends add you with this. Lowercase letters, numbers, . and _</span>
        </label>
        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={update} required />
        </label>
        <label>
          Password
          <input name="password" type="password" value={form.password} onChange={update} required />
          <span className="hint">At least 6 characters</span>
        </label>

        {error && <div className="form-error">{error}</div>}

        <button className="btn-primary" disabled={busy}>
          {busy ? "Creating account..." : "Sign up"}
        </button>
        <p className="muted center">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
