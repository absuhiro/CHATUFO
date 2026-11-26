import FriendsPanel from "../components/FriendsPanel";

// Your friends, requests and room invites
export default function FriendsPage() {
  return (
    <div className="list-page">
      <div className="list-page-head">
        <h1>Friends</h1>
        <p className="muted">Find friends, answer requests, start a chat</p>
      </div>
      <div className="card list-card">
        <FriendsPanel />
      </div>
    </div>
  );
}
