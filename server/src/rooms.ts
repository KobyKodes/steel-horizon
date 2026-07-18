// Room registry. The authoritative Room object lives here, keyed by 6-char
// code — Socket.IO rooms are only a broadcast mechanism, never the source
// of truth. Store is a Map behind a narrow interface (Redis-swappable).

import type { HighScoreEntry, RoomPhase } from "@steel-horizon/shared";
import type { Game } from "./game/engine.js";

export interface RoomPlayer {
  sessionId: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface Room {
  code: string;
  /** Up to 2 players; index 0 is the creator. */
  players: RoomPlayer[];
  phase: RoomPhase;
  /** The authoritative engine state; null while the room is in the lobby. */
  game: Game | null;
  /**
   * Leaderboard state for THIS game's gameover, written by socket.ts when
   * the game ends (scores submitted exactly once per game) and reset on
   * rematch. `leaderboard` is the post-submission global top list;
   * `leaderboardRanks` is each player's 0-based rank if they placed.
   */
  scoresSubmitted: boolean;
  leaderboard: HighScoreEntry[] | null;
  leaderboardRanks: Record<string, number | null>;
}

export interface RoomStore {
  create(room: Room): void;
  get(code: string): Room | undefined;
  delete(code: string): void;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, Room>();

  create(room: Room): void {
    this.rooms.set(room.code, room);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }
}

/** Unambiguous alphabet: A–Z minus I and O, digits 2–9 (32 symbols). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 6;

/**
 * Generate a 6-char room code, retrying on collision. Collision detection
 * is injected so this stays pure with respect to any particular store.
 */
export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[
        Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
      ];
    }
    if (!isTaken(code)) return code;
  }
}
