import { useRef, useState } from "react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { fileToSquareDataUrl } from "../utils/image";

// "User Settings": edit your profile (photo, name, username, about me) and change your password
export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState("profile");
  return (
    <Modal title="Settings" onClose={onClose}>
      <nav className="settings-tabs">
        <button className={`tab ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
          My Profile
        </button>
        <button className={`tab ${tab === "password" ? "active" : ""}`} onClick={() => setTab("password")}>
          Password
        </button>
      </nav>
      {tab === "profile" ? <ProfileForm /> : <PasswordForm />}
    </Modal>
  );
}

function ProfileForm() {
  const { user, setUser } = useAuth();
  const fileInput = useRef(null);
  const [form, setForm] = useState({ name: user.name, username: user.username || "", bio: user.bio || "" });
  const [status, setStatus] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const changed = form.name !== user.name || form.username !== (user.username || "") || form.bio !== (user.bio || "");

  const update = (e) => {
    let value = e.target.value;
    if (e.target.name === "username") value = value.toLowerCase().replace(/\s/g, "");
    setForm({ ...form, [e.target.name]: value });
    setStatus(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { user: updated } = await api("/users/me", { method: "PATCH", body: form });
      setUser(updated);
      setStatus({ ok: true, text: "Saved!" });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // lets you pick the same file again later
    if (!file) return;
    setPhotoBusy(true);
    setStatus(null);
    try {
      const image = await fileToSquareDataUrl(file);
      const { user: updated } = await api("/users/me/avatar", { method: "PUT", body: { image } });
      setUser(updated);
      setStatus({ ok: true, text: "Photo updated!" });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const { user: updated } = await api("/users/me/avatar", { method: "DELETE" });
      setUser(updated);
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <form className="modal-form" onSubmit={save}>
      <div className="settings-avatar">
        <button
          type="button"
          className="avatar-edit"
          onClick={() => fileInput.current.click()}
          disabled={photoBusy}
          title="Change photo"
        >
          <Avatar user={{ ...user, name: form.name || user.name }} size={88} />
          <span className="avatar-edit-overlay">{photoBusy ? "..." : "Change"}</span>
        </button>
        <div className="settings-avatar-actions">
          <button type="button" className="btn-primary small" onClick={() => fileInput.current.click()} disabled={photoBusy}>
            Upload photo
          </button>
          {user.avatarUrl && (
            <button type="button" className="btn-ghost small" onClick={removePhoto} disabled={photoBusy}>
              Remove
            </button>
          )}
          <span className="hint">Any image. It's cropped to a square.</span>
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
      </div>

      <label>
        Display name
        <input name="name" value={form.name} onChange={update} maxLength={50} required />
      </label>
      <label>
        Username
        <input name="username" value={form.username} onChange={update} maxLength={20} autoCapitalize="none" required />
      </label>
      <label>
        About me
        <textarea name="bio" value={form.bio} onChange={update} maxLength={190} rows={3} placeholder="Tell people a bit about you" />
        <span className="hint right">{form.bio.length}/190</span>
      </label>

      {status && <div className={status.ok ? "success-text" : "form-error"}>{status.text}</div>}
      <div className="modal-actions">
        <button className="btn-primary" disabled={busy || !changed}>
          {busy ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setStatus(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 6) return setStatus({ ok: false, text: "New password must be at least 6 characters" });
    if (form.newPassword !== form.confirm) return setStatus({ ok: false, text: "New passwords don't match" });
    setBusy(true);
    try {
      await api("/users/me/password", {
        method: "PATCH",
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setStatus({ ok: true, text: "Password changed!" });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="modal-form" onSubmit={save}>
      <label>
        Current password
        <input type="password" name="currentPassword" value={form.currentPassword} onChange={update} autoComplete="current-password" required />
      </label>
      <label>
        New password
        <input type="password" name="newPassword" value={form.newPassword} onChange={update} autoComplete="new-password" required />
      </label>
      <label>
        Confirm new password
        <input type="password" name="confirm" value={form.confirm} onChange={update} autoComplete="new-password" required />
      </label>
      {status && <div className={status.ok ? "success-text" : "form-error"}>{status.text}</div>}
      <div className="modal-actions">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Change password"}
        </button>
      </div>
    </form>
  );
}
