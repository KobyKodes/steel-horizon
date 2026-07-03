// Typed Socket.IO event maps — the client/server wire contract.
//
// v0 shape: this contract is expected to evolve during Phase 2 planning
// (rooms/matchmaking) and is NOT final. Pure types only — this module must
// never import socket.io; shared stays dependency-free. Server and client
// apply these maps to their own Socket.IO generics.

import type { Coordinate } from "./board.js";
import type { FleetPlacement, ShipClassId } from "./fleet.js";

export type GamePhase = "placement" | "battle" | "gameover";

export type ShotOutcome = "hit" | "miss" | "sunk";

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NOT_YOUR_TURN"
  | "INVALID_PLACEMENT"
  | "CELL_ALREADY_SHOT"
  | "OUT_OF_BOUNDS"
  | "WRONG_PHASE"
  | "ALREADY_JOINED";

export interface LobbyPlayer {
  name: string;
  ready: boolean;
}

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  createRoom: (payload: { name: string }) => void;
  joinRoom: (payload: { name: string; code: string }) => void;
  quickMatch: (payload: { name: string }) => void;
  setReady: (payload: { ready: boolean }) => void;
  placeFleet: (payload: { fleet: FleetPlacement }) => void;
  fire: (payload: { target: Coordinate }) => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  roomCreated: (payload: { code: string }) => void;
  lobbyState: (payload: { players: LobbyPlayer[] }) => void;
  gamePhase: (payload: { phase: GamePhase }) => void;
  shotResult: (payload: {
    shooter: string;
    target: Coordinate;
    result: ShotOutcome;
    sunkShip?: ShipClassId;
  }) => void;
  yourTurn: (payload: { isYourTurn: boolean }) => void;
  gameOver: (payload: {
    winner: string;
    revealedFleets: Record<string, FleetPlacement>;
  }) => void;
  errorEvent: (payload: { code: ErrorCode; message: string }) => void;
}
