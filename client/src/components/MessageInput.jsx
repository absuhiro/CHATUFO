import { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketContext";

const TYPING_IDLE_MS = 2500; // pause this long = "stopped typing"
const TYPING_RESEND_MS = 3000; // while typing, remind the server this often
const MAX_LENGTH = 2000;

export default function MessageInput({ roomId, disabled, placeholder }) {
  const { socket, connected } = useSocket();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);
  const typingState = useRef({ active: false, lastSent: 0, timer: null });

  const stopTyping = (notifyServer = true) => {
    const t = typingState.current;
    clearTimeout(t.timer);
    if (t.active && notifyServer && socket) socket.emit("typing_stop", { roomId });
    t.active = false;
  };

  // New room: clear the box, focus it, and stop typing in the old room when leaving
  useEffect(() => {
    setText("");
    setError("");
    inputRef.current?.focus();
    return () => stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    setError("");
    if (!socket) return;

    if (!value.trim()) return stopTyping();

    const t = typingState.current;
    const now = Date.now();
    if (!t.active || now - t.lastSent > TYPING_RESEND_MS) {
      socket.emit("typing_start", { roomId });
      t.active = true;
      t.lastSent = now;
    }
    clearTimeout(t.timer);
    t.timer = setTimeout(() => stopTyping(), TYPING_IDLE_MS);
  };

  const send = () => {
    const clean = text.trim();
    if (!clean || sending || !socket) return;
    stopTyping(false); // the server clears typing when the message arrives
    setSending(true);
    socket.emit("send_message", { roomId, text: clean }, (res) => {
      setSending(false);
      if (res.ok) {
        setText("");
        inputRef.current?.focus();
      } else {
        setError(res.error);
      }
    });
  };

  // Enter sends, Shift+Enter adds a new line
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const off = disabled || !connected;

  return (
    <div className="composer">
      {error && <div className="form-error">{error}</div>}
      <div className="composer-row">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={connected ? placeholder || "Type a message" : "Reconnecting..."}
          maxLength={MAX_LENGTH}
          disabled={off}
        />
        <button className="btn-primary send-btn" onClick={send} disabled={off || sending || !text.trim()}>
          Send
        </button>
      </div>
      {text.length > MAX_LENGTH - 200 && (
        <div className="hint right">
          {text.length}/{MAX_LENGTH}
        </div>
      )}
    </div>
  );
}
