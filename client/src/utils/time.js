// "now", "5m", "2h" (today), "Mon" (this week), "12 Nov" (older): like the chat list in most apps
export function shortTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const seconds = (now - d) / 1000;
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (d.toDateString() === now.toDateString()) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 6 * 86400) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
