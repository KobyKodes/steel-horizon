// Server entry. createServer() is the app/server factory (used by tests to
// bind an ephemeral port); running this file directly starts listening on
// PORT (default 3001), matching the pre-Socket.IO `npm run dev` behavior.
//
// Persistence: one Postgres database (Neon in production, via Drizzle)
// holds accounts, auth tokens, match history, aggregates, and the
// leaderboard. createServer() takes an injected db — tests pass a PGlite
// handle from openTestDatabase() — while start() connects to DATABASE_URL
// and imports the legacy JSON leaderboard exactly once.

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
import { resolveHighScorePath } from "./highscores.js";
import {
  openDatabase,
  openTestDatabase,
  resolveDatabaseUrl,
  type Db,
} from "./db/index.js";
import { logIn, revokeToken, signUp, userForToken } from "./auth.js";
import {
  importLegacyHighscores,
  playerProfile,
  PostgresHighScoreStore,
} from "./stats.js";

export interface ServerHandles {
  app: express.Express;
  httpServer: http.Server;
  io: GameServer;
  db: Db;
}

/**
 * Express 4 does not forward a rejected promise from an async handler, so an
 * unhandled DB error would leave the request hanging until the client gives
 * up. Every async route below is wrapped so failures become a 500.
 */
function route(
  handler: (req: express.Request, res: express.Response) => Promise<void>,
): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch((error: unknown) => {
      console.error(`[server] ${req.method} ${req.path} failed:`, error);
      if (!res.headersSent) res.status(500).json({ error: "Server error." });
      next(error);
    });
  };
}

/** The bearer token from an Authorization header, if any. */
function bearerToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export async function createServer(
  deps: SocketServerDeps = {},
): Promise<ServerHandles> {
  const app = express();

  const db = deps.db ?? (await openTestDatabase()).db;

  // One store instance serves both the socket layer (gameover submissions)
  // and the public HTTP read below.
  const highscores = deps.highscores ?? new PostgresHighScoreStore(db);

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", gridSize: GRID_SIZE });
  });

  // Public read-only leaderboards, so the landing page can show the boards
  // without being in a room. Same shapes the gameover snapshot carries.
  app.get("/leaderboard", route(async (_req, res) => {
    const [allTime, weekly] = await Promise.all([
      highscores.top(),
      highscores.topWeekly(),
    ]);
    res.json({ allTime, weekly });
  }));

  // --- Accounts (one-time login: token lives until explicit logout) ---

  app.post("/auth/signup", route(async (req, res) => {
    const result = await signUp(db, req.body?.username, req.body?.password);
    if (!result.ok) return void res.status(400).json({ error: result.error });
    res.json({ token: result.token, username: result.user.username });
  }));

  app.post("/auth/login", route(async (req, res) => {
    const result = await logIn(db, req.body?.username, req.body?.password);
    if (!result.ok) return void res.status(401).json({ error: result.error });
    res.json({ token: result.token, username: result.user.username });
  }));

  // Re-entry check: the client validates its stored token on boot.
  app.get("/auth/me", route(async (req, res) => {
    const user = await userForToken(db, bearerToken(req));
    if (user === null) return void res.status(401).json({ error: "Signed out." });
    res.json({ username: user.username });
  }));

  app.post("/auth/logout", route(async (req, res) => {
    await revokeToken(db, bearerToken(req));
    res.json({ ok: true });
  }));

  // Public player profile: aggregates + recent games.
  app.get("/players/:name/stats", route(async (req, res) => {
    const profile = await playerProfile(db, req.params.name ?? "");
    if (profile === null) {
      return void res.status(404).json({ error: "No such player." });
    }
    res.json(profile);
  }));

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
  const io = createSocketServer(httpServer, { ...deps, highscores, db });

  return { app, httpServer, io, db };
}

export async function start(
  port = Number(process.env.PORT) || 3001,
): Promise<http.Server> {
  const { db } = await openDatabase(resolveDatabaseUrl());
  // Pre-accounts leaderboard entries migrate into the DB exactly once.
  await importLegacyHighscores(db, resolveHighScorePath());

  const { httpServer } = await createServer({ db });
  httpServer.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });
  return httpServer;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  start().catch((error: unknown) => {
    console.error("[server] failed to start:", error);
    process.exit(1);
  });
}
