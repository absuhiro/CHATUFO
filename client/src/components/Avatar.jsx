import { useState } from "react";

// Round avatar: the user's picture if they have one (Step 8), otherwise
// their initials on a colour picked from their name (same name = same colour).
const COLORS = ["#7c5cff", "#ff6b9a", "#2bb5a8", "#f5a524", "#4c9aff", "#e5604d", "#9b6bff", "#3ddc84"];

function colorFor(name = "") {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name = "?") {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export default function Avatar({ user, size = 36, online }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  // If the photo fails to load, show initials instead (remembered per URL)
  const [failedUrl, setFailedUrl] = useState(null);
  const showPhoto = user?.avatarUrl && failedUrl !== user.avatarUrl;
  return (
    <span className="avatar" style={style}>
      {showPhoto ? (
        <img src={user.avatarUrl} alt={user.name} onError={() => setFailedUrl(user.avatarUrl)} />
      ) : (
        <span className="avatar-initials" style={{ background: colorFor(user?.name) }}>
          {initials(user?.name)}
        </span>
      )}
      {online && <span className="avatar-dot" />}
    </span>
  );
}
