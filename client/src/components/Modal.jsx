import { useEffect } from "react";

// A centered popup. Closes on Escape or clicking the dark background.
export default function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{title}</h2>
        {subtitle && <p className="muted modal-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
