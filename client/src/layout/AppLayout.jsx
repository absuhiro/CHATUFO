import { useEffect, useState } from "react";
import { Outlet, useLocation, useMatch } from "react-router-dom";
import ServerRail from "../components/ServerRail";
import HomeSidebar from "../components/HomeSidebar";
import RoomSidebar from "../components/RoomSidebar";
import UserBar from "../components/UserBar";

// The Discord-style frame around every logged in page:
//   [ rail | sidebar | page ]
// The page itself (Friends or a chat) comes from the router through <Outlet />.
export default function AppLayout() {
  const roomMatch = useMatch("/rooms/:roomId");
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false); // phones: rail + sidebar slide in

  // Close the phone menu whenever the page changes
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className={`app ${navOpen ? "nav-open" : ""}`}>
      <div className="nav">
        <ServerRail />
        <aside className="sidebar">
          {roomMatch ? <RoomSidebar roomId={roomMatch.params.roomId} /> : <HomeSidebar />}
          <UserBar />
        </aside>
      </div>

      <main className="page">
        {/* Pages get openNav so their header can show a ☰ button on phones */}
        <Outlet context={{ openNav: () => setNavOpen(true) }} />
      </main>

      {navOpen && <div className="overlay" onClick={() => setNavOpen(false)} />}
    </div>
  );
}
