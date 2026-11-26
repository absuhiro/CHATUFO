import { useState } from "react";
import Modal from "./Modal";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";

export default function AddFriendModal({ onClose }) {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [result, setResult] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await api("/friends/requests", { method: "POST", body: { username: username.trim() } });
      setResult({
        ok: true,
        text:
          res.status === "accepted"
            ? `You and ${res.user.name} are now friends!`
            : `Friend request sent to @${res.user.username}.`,
      });
      setUsername("");
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add a friend"
      subtitle={
        <>
          Add friends by their username. Yours is <strong>@{user.username}</strong>.
        </>
      }
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={send}>
        <label className={`search-box in-modal ${result ? (result.ok ? "ok" : "bad") : ""}`}>
          <span className="at">@</span>
          <input
            placeholder="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase().replace(/\s|@/g, ""));
              setResult(null);
            }}
            autoCapitalize="none"
            autoFocus
          />
        </label>
        {result && <p className={result.ok ? "success-text" : "error-text"}>{result.text}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Done
          </button>
          <button className="btn-primary" disabled={busy || !username.trim()}>
            {busy ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
