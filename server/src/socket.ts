// Typed Socket.IO server. Applies the shared protocol event maps and
// resolves player identity through app-level sessions: handshake auth
// carries an optional sessionId; unknown/absent ids get a freshly minted
// UUID. Handlers never trust client-supplied identity — they read
// socket.data.sessionId, which only this middleware writes.
//
// Every inbound payload is treated as hostile: validate first, reply with a
// typed errorEvent and make no state change on rejection. After every
// accepted mutation each player in the room receives their own redacted
// roomState snapshot (per-viewer sends only — snapshots are viewer-specific
// by design, never room-broadcast).

import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  Coordinate,
  ErrorCode,
  FleetPlacement,
  HandshakeAuth,
  ServerToClientEvents,
} from "@steel-horizon/shared";
import { InMemorySessionStore, type SessionStore } from "./session.js";
import {
  generateRoomCode,
  InMemoryRoomStore,
  type Room,
  type RoomStore,
} from "./rooms.js";
import { MatchmakingQueue } from "./matchmaking.js";
import {
  createGame,
  fire as engineFire,
  forfeit as engineForfeit,
  placeFleet as enginePlaceFleet,
  requestRematch as engineRequestRematch,
} from "./game/engine.js";
import { buildSnapshot } from "./snapshot.js";
import { resolveGraceMs } from "./config.js";

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
  rooms?: RoomStore;
  matchmaking?: MatchmakingQueue;
  /** Randomness for the engine's coin flips; tests inject a fixed value. */
  rng?: () => number;
  /** Disconnect grace before forfeit (ms); tests inject ~100–200ms. */
  graceMs?: number;
}

const NAME_MAX_LENGTH = 20;

/** Trimmed 1–20 char name, or null when invalid. */
function validateName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * Structural guard for a hostile placeFleet payload: enough shape for
 * validateFleetPlacement to run without throwing (it owns the real rules).
 */
function isFleetShaped(value: unknown): value is FleetPlacement {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (typeof entry !== "object" || entry === null) return false;
      const origin = (entry as { origin?: unknown }).origin;
      return (
        typeof origin === "object" &&
        origin !== null &&
        typeof (origin as { col?: unknown }).col === "number" &&
        typeof (origin as { row?: unknown }).row === "number"
      );
    })
  );
}

/** Structural guard for a hostile fire payload's target coordinate. */
function isCoordinateShaped(value: unknown): value is Coordinate {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { col?: unknown }).col === "number" &&
    typeof (value as { row?: unknown }).row === "number"
  );
}

/** Human-readable companion text for engine rejection codes. */
const ENGINE_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  WRONG_PHASE: "That action is not allowed in the current phase.",
  NOT_YOUR_TURN: "It is not your turn.",
  INVALID_PLACEMENT: "That fleet placement is not legal.",
  OUT_OF_BOUNDS: "That target is off the board.",
  CELL_ALREADY_SHOT: "You already fired at that cell.",
  NOT_IN_ROOM: "You are not in a room.",
};

export function createSocketServer(
  httpServer: HttpServer,
  deps: SocketServerDeps = {},
): GameServer {
  const sessions = deps.sessions ?? new InMemorySessionStore();
  const rooms = deps.rooms ?? new InMemoryRoomStore();
  const matchmaking = deps.matchmaking ?? new MatchmakingQueue();
  const rng = deps.rng ?? Math.random;
  const graceMs = resolveGraceMs(deps.graceMs);

  /** Live socket per session, for per-viewer snapshot sends and pairing. */
  const socketsBySession = new Map<string, GameSocket>();

  /** Pending disconnect-grace timers, keyed by room+player. */
  const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const io: GameServer = new Server(httpServer);

  // Session middleware: reuse a known sessionId from handshake auth,
  // otherwise mint one and create the session.
  io.use((socket, next) => {
    const auth = socket.handshake.auth as HandshakeAuth;
    const offered =
      typeof auth.sessionId === "string" ? auth.sessionId : undefined;

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

  function fail(socket: GameSocket, code: ErrorCode, message?: string): void {
    socket.emit("errorEvent", {
      code,
      message: message ?? ENGINE_ERROR_MESSAGES[code] ?? "Request rejected.",
    });
  }

  /** Send each player in the room their own redacted snapshot. */
  function sendRoomState(room: Room): void {
    for (const player of room.players) {
      const socket = socketsBySession.get(player.sessionId);
      if (socket === undefined) continue;
      const snapshot = buildSnapshot(room, player.sessionId);
      if (snapshot === null) continue;
      socket.emit("roomState", { snapshot });
    }
  }

  /** Mirror the engine's phase onto the room after an accepted mutation. */
  function syncRoomPhase(room: Room): void {
    if (room.game !== null) room.phase = room.game.phase;
  }

  /** The room the session is seated in, if any. */
  function roomOf(sessionId: string): Room | undefined {
    const roomCode = sessions.get(sessionId)?.roomCode;
    return roomCode == null ? undefined : rooms.get(roomCode);
  }

  function graceKey(roomCode: string, sessionId: string): string {
    return `${roomCode}:${sessionId}`;
  }

  /**
   * Cancel a pending grace timer. MUST run on every reconnect — a stale
   * timer firing after the player returned would forfeit a live game.
   */
  function clearGraceTimer(roomCode: string, sessionId: string): void {
    const key = graceKey(roomCode, sessionId);
    const timer = graceTimers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      graceTimers.delete(key);
    }
  }

  /** Detach a session from its room so the code can be reused. */
  function detachSession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session !== undefined) {
      sessions.set(sessionId, { name: session.name, roomCode: null });
    }
  }

  /**
   * Delete the room once it is fully abandoned: every seat disconnected
   * AND no grace timer still pending (a pending timer means someone may
   * yet return). Frees the room code and un-links the sessions so the
   * store does not leak.
   */
  function maybeDeleteRoom(room: Room): void {
    const abandoned = room.players.every((p) => !p.connected);
    const graced = room.players.some((p) =>
      graceTimers.has(graceKey(room.code, p.sessionId)),
    );
    if (!abandoned || graced) return;
    for (const player of room.players) detachSession(player.sessionId);
    rooms.delete(room.code);
  }

  /** Grace expired without a reconnect: forfeit a live game, free a lobby seat. */
  function onGraceExpired(roomCode: string, sessionId: string): void {
    graceTimers.delete(graceKey(roomCode, sessionId));
    const room = rooms.get(roomCode);
    if (room === undefined) return;
    const player = room.players.find((p) => p.sessionId === sessionId);
    // Defensive: a reconnect clears the timer, so a connected player here
    // means a stale timer slipped through — never forfeit them.
    if (player === undefined || player.connected) return;

    if (room.game !== null && room.game.phase !== "gameover") {
      // Placement or battle: the absent player concedes; opponent wins.
      const result = engineForfeit(room.game, sessionId);
      if (result.ok) {
        syncRoomPhase(room);
        sendRoomState(room);
      }
    } else if (room.game === null) {
      // Lobby: free the seat — a solo lobby stays open for a new joiner.
      room.players = room.players.filter((p) => p.sessionId !== sessionId);
      detachSession(sessionId);
      sendRoomState(room);
    }
    // Gameover rooms linger for rematch until fully abandoned.
    maybeDeleteRoom(room);
  }

  /** Create a room, seat the players, and join their sockets to its channel. */
  function createRoomWith(
    entries: { sessionId: string; name: string }[],
  ): Room {
    const code = generateRoomCode((c) => rooms.get(c) !== undefined);
    const room: Room = {
      code,
      players: entries.map((e) => ({
        sessionId: e.sessionId,
        name: e.name,
        ready: false,
        connected: true,
      })),
      phase: "lobby",
      game: null,
    };
    rooms.create(room);

    for (const entry of entries) {
      sessions.set(entry.sessionId, { name: entry.name, roomCode: code });
      socketsBySession.get(entry.sessionId)?.join(code);
    }
    return room;
  }

  io.on("connection", (socket) => {
    const sessionId = socket.data.sessionId;

    // Last-connect-wins: a refresh often opens the new socket before the
    // old one's disconnect fires. Hand the session to the newest socket
    // and drop the stale one — its disconnect handler sees it is no longer
    // current and leaves the session's state alone. Re-point the map
    // BEFORE disconnecting so the old socket's handler observes the swap.
    const previous = socketsBySession.get(sessionId);
    socketsBySession.set(sessionId, socket);
    if (previous !== undefined && previous.id !== socket.id) {
      previous.disconnect(true);
    }

    socket.emit("session", { sessionId });

    // Session-resume: a known session seated in a room rejoins its
    // channel and is restored from ONE full snapshot — buildSnapshot
    // already carries phase, own fleet, both shot histories, turn, and
    // winner, so resume works identically in lobby, placement, battle,
    // and gameover with no phase-special code.
    const seatedRoom = roomOf(sessionId);
    const seat = seatedRoom?.players.find((p) => p.sessionId === sessionId);
    if (seatedRoom !== undefined && seat !== undefined) {
      socket.join(seatedRoom.code);
      seat.connected = true;
      clearGraceTimer(seatedRoom.code, sessionId);
      // Reconnector gets the resume snapshot; the opponent's snapshot
      // flips `opponent.connected` back to true.
      sendRoomState(seatedRoom);
    }

    socket.on("createRoom", (payload) => {
      const name = validateName(payload?.name);
      if (name === null) {
        return fail(socket, "INVALID_NAME", "Name must be 1-20 characters.");
      }
      const session = sessions.get(sessionId);
      if (session?.roomCode != null) {
        return fail(socket, "ALREADY_JOINED", "You are already in a room.");
      }

      matchmaking.remove(sessionId);
      const room = createRoomWith([{ sessionId, name }]);
      sendRoomState(room);
    });

    socket.on("joinRoom", (payload) => {
      const name = validateName(payload?.name);
      if (name === null) {
        return fail(socket, "INVALID_NAME", "Name must be 1-20 characters.");
      }
      const code =
        typeof payload?.code === "string"
          ? payload.code.trim().toUpperCase()
          : "";
      const room = rooms.get(code);
      if (room === undefined) {
        return fail(socket, "ROOM_NOT_FOUND", `No room with code ${code}.`);
      }
      const session = sessions.get(sessionId);
      if (session?.roomCode != null) {
        return fail(socket, "ALREADY_JOINED", "You are already in a room.");
      }
      if (room.players.length >= 2) {
        return fail(socket, "ROOM_FULL", `Room ${code} already has 2 players.`);
      }

      matchmaking.remove(sessionId);
      room.players.push({ sessionId, name, ready: false, connected: true });
      sessions.set(sessionId, { name, roomCode: code });
      socket.join(code);
      sendRoomState(room);
    });

    socket.on("quickMatch", (payload) => {
      const name = validateName(payload?.name);
      if (name === null) {
        return fail(socket, "INVALID_NAME", "Name must be 1-20 characters.");
      }

      const result = matchmaking.enqueue(
        { sessionId, name },
        (sid) => sessions.get(sid)?.roomCode != null,
      );

      if (result.status === "rejected") {
        return fail(
          socket,
          "ALREADY_JOINED",
          result.reason === "already-queued"
            ? "You are already waiting for a match."
            : "You are already in a room.",
        );
      }
      if (result.status === "paired") {
        const room = createRoomWith(result.players);
        sendRoomState(room);
      }
      // status "waiting": nothing to send — the pairing snapshot arrives
      // when a second player queues up.
    });

    socket.on("setReady", (payload) => {
      const session = sessions.get(sessionId);
      const room =
        session?.roomCode == null ? undefined : rooms.get(session.roomCode);
      if (room === undefined) {
        return fail(socket, "NOT_IN_ROOM", "You are not in a room.");
      }
      if (room.phase !== "lobby") {
        return fail(socket, "WRONG_PHASE", "Ready-up only applies in the lobby.");
      }
      const player = room.players.find((p) => p.sessionId === sessionId);
      if (player === undefined) {
        return fail(socket, "NOT_IN_ROOM", "You are not in a room.");
      }

      player.ready = payload?.ready === true;

      if (room.players.length === 2 && room.players.every((p) => p.ready)) {
        room.phase = "placement";
        // Both ready: hand the room to the engine. The coin flip happens
        // later, when the second fleet lands.
        const [first, second] = room.players;
        if (first !== undefined && second !== undefined) {
          room.game = createGame([first.sessionId, second.sessionId], rng);
        }
      }
      sendRoomState(room);
    });

    socket.on("placeFleet", (payload) => {
      const room = roomOf(sessionId);
      if (room === undefined) {
        return fail(socket, "NOT_IN_ROOM");
      }
      if (room.game === null) {
        return fail(socket, "WRONG_PHASE", "Placement starts after the lobby.");
      }
      const fleet = payload?.fleet;
      if (!isFleetShaped(fleet)) {
        return fail(socket, "INVALID_PLACEMENT");
      }

      const result = enginePlaceFleet(room.game, sessionId, fleet);
      if (!result.ok) {
        return fail(socket, result.code);
      }

      // Never echo the fleet to the opponent in any form — buildSnapshot
      // is the only serialization path and redacts per viewer.
      syncRoomPhase(room);
      sendRoomState(room);
    });

    socket.on("fire", (payload) => {
      const room = roomOf(sessionId);
      if (room === undefined) {
        return fail(socket, "NOT_IN_ROOM");
      }
      if (room.game === null) {
        return fail(socket, "WRONG_PHASE", "The battle has not started.");
      }
      const target = payload?.target;
      if (!isCoordinateShaped(target)) {
        return fail(socket, "OUT_OF_BOUNDS");
      }

      const result = engineFire(room.game, sessionId, target);
      if (!result.ok) {
        return fail(socket, result.code);
      }

      // Cinematic cue for both sides — carries only information present in
      // both players' snapshots. Shooter is the display name, NEVER the
      // sessionId (session ids are resume credentials).
      const shooterName =
        room.players.find((p) => p.sessionId === sessionId)?.name ?? "";
      io.to(room.code).emit("shotResult", {
        shooter: shooterName,
        target: result.record.target,
        result: result.record.result,
        ...(result.record.sunkShip !== undefined
          ? {
              sunkShip: result.record.sunkShip,
              sunkShipCells: result.record.sunkShipCells,
            }
          : {}),
      });

      // On gameover these snapshots carry winner + revealedOpponentFleet.
      syncRoomPhase(room);
      sendRoomState(room);
    });

    socket.on("requestRematch", () => {
      const room = roomOf(sessionId);
      if (room === undefined) {
        return fail(socket, "NOT_IN_ROOM");
      }
      if (room.game === null) {
        return fail(socket, "WRONG_PHASE", "There is no finished game.");
      }

      const result = engineRequestRematch(room.game, sessionId);
      if (!result.ok) {
        return fail(socket, result.code);
      }

      if (result.game !== null) {
        // Both accepted: swap in the fresh game and reset the lobby-era
        // ready flags so snapshots read as a clean placement phase.
        room.game = result.game;
        for (const player of room.players) player.ready = false;
      }
      syncRoomPhase(room);
      sendRoomState(room);
    });

    socket.on("disconnect", () => {
      // A superseded socket (same session, newer tab took over) must not
      // touch session state — the session lives on through the new socket.
      if (socketsBySession.get(sessionId) !== socket) return;
      socketsBySession.delete(sessionId);
      matchmaking.remove(sessionId);

      const room = roomOf(sessionId);
      const player = room?.players.find((p) => p.sessionId === sessionId);
      if (room === undefined || player === undefined) return;

      // The opponent's next snapshot flips `opponent.connected` false —
      // that IS the disconnect notification (no dedicated event type).
      player.connected = false;
      sendRoomState(room);

      // Start the grace clock. unref() so pending timers never hold the
      // process open (the listening server does that while it runs).
      clearGraceTimer(room.code, sessionId);
      const timer = setTimeout(
        () => onGraceExpired(room.code, sessionId),
        graceMs,
      );
      timer.unref();
      graceTimers.set(graceKey(room.code, sessionId), timer);
    });
  });

  return io;
}
