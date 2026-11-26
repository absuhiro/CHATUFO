import { Outlet, useLocation } from "react-router-dom";
import NavRail from "../components/NavRail";

// The frame around every logged in page:   [ rail | page ]
// No sidebars: the page is the dashboard, a list, or a full chat view (from the router via <Outlet />).
export default function AppLayout() {
  const { pathname } = useLocation();
  const chatOpen = pathname.startsWith("/chat/");

  return (
    <div className={`app ${chatOpen ? "chat-open" : ""}`}>
      <NavRail />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
