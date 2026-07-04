// Typed Socket.IO event maps — the client/server wire contract.
//
// v1 shape: snapshot-driven protocol (Phase 2 DISCOVERY §3). After every
// accepted mutation the server sends each player their own redacted
// RoomSnapshot; transient events (shotResult) ride alongside as animation
// cues. Pure types only — this module must never import socket.io; shared
// stays dependency-free. Server and client apply these maps to their own
// Socket.IO generics.

import type { Coordinate } from "./board.js";
import type { FleetPlacement, ShipClassId } from "./fleet.js";

/** Lifecycle of a room, lobby through gameover. */
export type RoomPhase = "lobby" | "placement" | "battle" | "gameover";

export type ShotOutcome = "hit" | "miss" | "sunk";

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NOT_YOUR_TURN"
  | "INVALID_PLACEMENT"
  | "CELL_ALREADY_SHOT"
  | "OUT_OF_BOUNDS"
  | "WRONG_PHASE"
  | "ALREADY_JOINED"
  | "NOT_IN_ROOM"
  | "INVALID_NAME";

/** One resolved shot, as recorded in a snapshot's shot histories. */
export interface ShotRecord {
  target: Coordinate;
  result: ShotOutcome;
  sunkShip?: ShipClassId;
  /**
   * All cells of the ship this shot sank. Safe to reveal in full: once a
   * ship is sunk its shape is permanently public, and this never touches
   * the cells of other (possibly touching, still-alive) ships.
   */
  sunkShipCells?: Coordinate[];
}

/**
 * The per-viewer redacted room state. The server rebuilds and sends one of
 * these to each player after every accepted mutation.
 *
 * Anti-cheat by construction: the opponent's FleetPlacement appears ONLY in
 * `revealedOpponentFleet`, which stays null until phase === "gameover" —
 * the type shape makes pre-gameover fleet leakage impossible.
 */
export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  you: {
    name: string;
    ready: boolean;
    connected: boolean;
    fleet: FleetPlacement | null;
  };
  opponent: {
    name: string;
    ready: boolean;
    connected: boolean;
    sunkShips: ShipClassId[];
  } | null;
  yourShots: ShotRecord[];
  shotsAgainstYou: ShotRecord[];
  currentTurn: "you" | "opponent" | null;
  winner: "you" | "opponent" | null;
  winReason: "all-ships-sunk" | "forfeit" | null;
  revealedOpponentFleet: FleetPlacement | null;
  rematch: { youRequested: boolean; opponentRequested: boolean };
}

/**
 * Handshake auth payload the client supplies on connect. A known sessionId
 * resumes that session; otherwise the server mints a fresh one and delivers
 * it via the `session` event.
 */
export interface HandshakeAuth {
  sessionId?: string;
  name?: string;
}

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  createRoom: (payload: { name: string }) => void;
  joinRoom: (payload: { name: string; code: string }) => void;
  quickMatch: (payload: { name: string }) => void;
  setReady: (payload: { ready: boolean }) => void;
  placeFleet: (payload: { fleet: FleetPlacement }) => void;
  fire: (payload: { target: Coordinate }) => void;
  requestRematch: () => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  session: (payload: { sessionId: string }) => void;
  roomState: (payload: { snapshot: RoomSnapshot }) => void;
  shotResult: (payload: {
    shooter: string;
    target: Coordinate;
    result: ShotOutcome;
    sunkShip?: ShipClassId;
    sunkShipCells?: Coordinate[];
  }) => void;
  errorEvent: (payload: { code: ErrorCode; message: string }) => void;
}
