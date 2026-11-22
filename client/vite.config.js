import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app runs on :5173 and the server on :5000.
// The proxy forwards /api and /socket.io to the server, so the browser
// only ever talks to :5173 (no CORS headaches, no hardcoded server URL).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
      "/socket.io": { target: "http://localhost:5000", ws: true },
    },
  },
});
