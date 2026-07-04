// Typed Socket.IO server. Applies the shared protocol event maps and
// resolves player identity through app-level sessions: handshake auth
// carries an optional sessionId; unknown/absent ids get a freshly minted
// UUID. Handlers never trust client-supplied identity — they read
// socket.data.sessionId, which only this middleware writes.

import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  HandshakeAuth,
  ServerToClientEvents,
} from "@steel-horizon/shared";
import { InMemorySessionStore, type SessionStore } from "./session.js";

export interface SocketData {
  sessionId: string;
}

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface SocketServerDeps {
  sessions?: SessionStore;
}

export function createSocketServer(
  httpServer: HttpServer,
  deps: SocketServerDeps = {},
): GameServer {
  const sessions = deps.sessions ?? new InMemorySessionStore();

  const io: GameServer = new Server(httpServer);

  // Session middleware: reuse a known sessionId from handshake auth,
  // otherwise mint one and create the session.
  io.use((socket, next) => {
    const auth = socket.handshake.auth as HandshakeAuth;
    const offered = typeof auth.sessionId === "string" ? auth.sessionId : undefined;

    if (offered !== undefined && sessions.get(offered) !== undefined) {
      socket.data.sessionId = offered;
      return next();
    }

    const sessionId = randomUUID();
    const name = typeof auth.name === "string" ? auth.name.trim() : "";
    sessions.set(sessionId, { name, roomCode: null });
    socket.data.sessionId = sessionId;
    next();
  });

  io.on("connection", (socket) => {
    socket.emit("session", { sessionId: socket.data.sessionId });
  });

  return io;
}
