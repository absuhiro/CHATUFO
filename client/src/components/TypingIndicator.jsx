export default function TypingIndicator({ users }) {
  let text = "";
  if (users.length === 1) text = `${users[0].name} is typing`;
  else if (users.length === 2) text = `${users[0].name} and ${users[1].name} are typing`;
  else if (users.length > 2) text = "Several people are typing";

  // Always rendered (even empty) so the layout doesn't jump when it appears
  return (
    <div className="typing">
      {text && (
        <>
          {text}
          <span className="dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </>
      )}
    </div>
  );
}
