import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { DataProvider } from "./context/DataContext";
import App from "./App";
import "./index.css";

// Providers wrap the app so every component can use the router, the logged in user,
// the socket, and the shared lists (friends, rooms, DMs)
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
