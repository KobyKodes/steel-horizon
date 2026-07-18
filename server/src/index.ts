// Server entry. createServer() is the app/server factory (used by tests to
// bind an ephemeral port); running this file directly starts listening on
// PORT (default 3001), matching the pre-Socket.IO `npm run dev` behavior.

import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { GRID_SIZE } from "@steel-horizon/shared";
import {
  createSocketServer,
  type GameServer,
  type SocketServerDeps,
} from "./socket.js";

export interface ServerHandles {
  app: express.Express;
  httpServer: http.Server;
  io: GameServer;
}

export function createServer(deps: SocketServerDeps = {}): ServerHandles {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", gridSize: GRID_SIZE });
  });

  // Production static serving (07-01): when the built client exists
  // (`npm run build` at the repo root), this one service serves it — the
  // client connects to Socket.IO same-origin, so no CORS/proxy is needed.
  // In dev the dist dir is absent and Vite serves the client instead;
  // everything before this line (health, socket.io) is unaffected.
  const clientDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../client/dist",
  );
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Single-page app: any non-API GET falls back to index.html (the app
    // routes purely off the server snapshot, so every path is the shell).
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer, deps);

  return { app, httpServer, io };
}

export function start(port = Number(process.env.PORT) || 3001): http.Server {
  const { httpServer } = createServer();
  httpServer.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });
  return httpServer;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  start();
}
