import ChatList from "../components/ChatList";

// Every conversation, with search and filters. Opening one shows the full chat view.
export default function ChatsPage() {
  return (
    <div className="list-page">
      <div className="list-page-head">
        <h1>Chats</h1>
        <p className="muted">All your conversations, newest first</p>
      </div>
      <div className="card list-card">
        <ChatList />
      </div>
    </div>
  );
}
