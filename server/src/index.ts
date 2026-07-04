// Server entry. createServer() is the app/server factory (used by tests to
// bind an ephemeral port); running this file directly starts listening on
// PORT (default 3001), matching the pre-Socket.IO `npm run dev` behavior.

import http from "node:http";
import { pathToFileURL } from "node:url";
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
