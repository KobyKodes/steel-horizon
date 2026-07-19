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
import {
  InMemoryHighScoreStore,
  JsonHighScoreStore,
  resolveHighScorePath,
} from "./highscores.js";

export interface ServerHandles {
  app: express.Express;
  httpServer: http.Server;
  io: GameServer;
}

export function createServer(deps: SocketServerDeps = {}): ServerHandles {
  const app = express();

  // One store instance serves both the socket layer (gameover submissions)
  // and the public HTTP read below.
  const highscores = deps.highscores ?? new InMemoryHighScoreStore();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", gridSize: GRID_SIZE });
  });

  // Public read-only leaderboards, so the landing page can show the boards
  // without being in a room. Same shapes the gameover snapshot carries.
  app.get("/leaderboard", (_req, res) => {
    res.json({ allTime: highscores.top(), weekly: highscores.topWeekly() });
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
  const io = createSocketServer(httpServer, { ...deps, highscores });

  return { app, httpServer, io };
}

export function start(port = Number(process.env.PORT) || 3001): http.Server {
  // Production gets the persistent JSON leaderboard; tests construct
  // createServer() directly and default to the in-memory store.
  const { httpServer } = createServer({
    highscores: new JsonHighScoreStore(resolveHighScorePath()),
  });
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
