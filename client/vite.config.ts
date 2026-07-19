import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Any *.ngrok-free.dev tunnel may reach the dev server (subdomains
    // rotate per ngrok session, so allow the whole suffix).
    allowedHosts: [".ngrok-free.dev"],
    proxy: {
      "/health": "http://localhost:3001",
      "/leaderboard": "http://localhost:3001",
      "/auth": "http://localhost:3001",
      "/players": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
