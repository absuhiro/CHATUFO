// Turns web addresses in a message into clickable links.
// Builds React elements (never raw HTML), and only http/https links, so it stays safe.
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

export function linkify(text) {
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}
