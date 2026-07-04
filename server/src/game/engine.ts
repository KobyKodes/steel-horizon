// Pure authoritative game engine — the cheat-resistant core of the whole
// project. No socket.io, no timers, no I/O: a state machine over the shared
// rule functions (validateFleetPlacement / resolveShot / isFleetDestroyed),
// which stay pure while this module composes state around them (01-04).
//
// Every transition returns a discriminated union `{ ok: true, ... } |
// { ok: false, code }` (the 01-03/01-04 pattern); on `ok: false` the game
// state is untouched. rng is injected so tests and scripted games can force
// deterministic coin flips.

import {
  isFleetDestroyed,
  resolveShot,
  validateFleetPlacement,
  type Coordinate,
  type ErrorCode,
  type FleetPlacement,
  type ShotRecord,
} from "@steel-horizon/shared";

export type GamePhase = "placement" | "battle" | "gameover";

export type WinReason = "all-ships-sunk" | "forfeit";

export interface PlayerGameState {
  /** This player's own placement; null until they place. */
  fleet: FleetPlacement | null;
  /** Shots FIRED by this player, appended after each accepted resolution. */
  shots: ShotRecord[];
}

export interface Game {
  /** Both participants; order fixed at creation (index 0 = room creator). */
  playerIds: [string, string];
  players: Record<string, PlayerGameState>;
  phase: GamePhase;
  /** Whose turn it is during battle; null outside battle. */
  currentPlayer: string | null;
  winner: string | null;
  winReason: WinReason | null;
  rematchRequests: Set<string>;
  /** Injected randomness for coin flips (tests override). */
  rng: () => number;
}

export type Rejection = { ok: false; code: ErrorCode };

export type PlaceFleetResult =
  | { ok: true; battleStarted: boolean }
  | Rejection;

export type FireResult =
  | { ok: true; record: ShotRecord; gameOver: boolean }
  | Rejection;

export type RematchResult =
  /** `game` is the fresh replacement game once BOTH players have requested. */
  | { ok: true; game: Game | null }
  | Rejection;

export type ForfeitResult = { ok: true } | Rejection;

export function createGame(
  playerIds: [string, string],
  rng: () => number,
): Game {
  return {
    playerIds,
    players: {
      [playerIds[0]]: { fleet: null, shots: [] },
      [playerIds[1]]: { fleet: null, shots: [] },
    },
    phase: "placement",
    currentPlayer: null,
    winner: null,
    winReason: null,
    rematchRequests: new Set(),
    rng,
  };
}

export function opponentOf(game: Game, playerId: string): string {
  return game.playerIds[0] === playerId
    ? game.playerIds[1]
    : game.playerIds[0];
}

function isParticipant(game: Game, playerId: string): boolean {
  return game.playerIds.includes(playerId);
}

/**
 * Set (or re-set — placement is simultaneous, so overwriting while still in
 * the placement phase is legal) a player's fleet. When both fleets are in,
 * flips to battle and coin-flips the first turn with the injected rng.
 */
export function placeFleet(
  game: Game,
  playerId: string,
  fleet: FleetPlacement,
): PlaceFleetResult {
  if (!isParticipant(game, playerId)) {
    return { ok: false, code: "NOT_IN_ROOM" };
  }
  if (game.phase !== "placement") {
    return { ok: false, code: "WRONG_PHASE" };
  }
  const validation = validateFleetPlacement(fleet);
  if (!validation.valid) {
    return { ok: false, code: "INVALID_PLACEMENT" };
  }

  game.players[playerId]!.fleet = fleet;

  const bothPlaced = game.playerIds.every(
    (id) => game.players[id]!.fleet !== null,
  );
  if (bothPlaced) {
    game.phase = "battle";
    game.currentPlayer =
      game.rng() < 0.5 ? game.playerIds[0] : game.playerIds[1];
  }
  return { ok: true, battleStarted: bothPlaced };
}

/**
 * Resolve a shot by the current player against the opponent's fleet.
 * Turn ALWAYS alternates after a valid shot — hits grant no extra turn
 * (classic alternating rules). Win on the opponent's last ship cell.
 */
export function fire(
  game: Game,
  playerId: string,
  target: Coordinate,
): FireResult {
  if (!isParticipant(game, playerId)) {
    return { ok: false, code: "NOT_IN_ROOM" };
  }
  if (game.phase !== "battle") {
    return { ok: false, code: "WRONG_PHASE" };
  }
  if (game.currentPlayer !== playerId) {
    return { ok: false, code: "NOT_YOUR_TURN" };
  }

  const shooter = game.players[playerId]!;
  const opponentId = opponentOf(game, playerId);
  const opponentFleet = game.players[opponentId]!.fleet;
  if (opponentFleet === null) {
    // Unreachable in battle phase; guard keeps the engine total.
    return { ok: false, code: "WRONG_PHASE" };
  }

  // resolveShot's contract: history BEFORE the shot being resolved.
  const previousTargets = shooter.shots.map((shot) => shot.target);
  const resolution = resolveShot(opponentFleet, previousTargets, target);
  if (!resolution.ok) {
    return { ok: false, code: resolution.error };
  }

  const record: ShotRecord =
    resolution.result === "sunk"
      ? { target, result: "sunk", sunkShip: resolution.ship }
      : { target, result: resolution.result };
  shooter.shots.push(record);

  const destroyed = isFleetDestroyed(
    opponentFleet,
    shooter.shots.map((shot) => shot.target),
  );
  if (destroyed) {
    game.phase = "gameover";
    game.currentPlayer = null;
    game.winner = playerId;
    game.winReason = "all-ships-sunk";
    return { ok: true, record, gameOver: true };
  }

  game.currentPlayer = opponentId;
  return { ok: true, record, gameOver: false };
}

/**
 * Record a rematch request; both must accept. When the second request
 * lands, returns a FRESH game (same players, empty boards, coin flip to
 * come from the new game's own placement completion).
 */
export function requestRematch(game: Game, playerId: string): RematchResult {
  if (!isParticipant(game, playerId)) {
    return { ok: false, code: "NOT_IN_ROOM" };
  }
  if (game.phase !== "gameover") {
    return { ok: false, code: "WRONG_PHASE" };
  }

  game.rematchRequests.add(playerId);
  if (game.playerIds.every((id) => game.rematchRequests.has(id))) {
    return { ok: true, game: createGame(game.playerIds, game.rng) };
  }
  return { ok: true, game: null };
}

/**
 * Concede: the opponent wins immediately with reason "forfeit". Legal in
 * placement and battle (02-03's disconnect grace timer calls this); a
 * finished game cannot be forfeited.
 */
export function forfeit(game: Game, playerId: string): ForfeitResult {
  if (!isParticipant(game, playerId)) {
    return { ok: false, code: "NOT_IN_ROOM" };
  }
  if (game.phase === "gameover") {
    return { ok: false, code: "WRONG_PHASE" };
  }

  game.phase = "gameover";
  game.currentPlayer = null;
  game.winner = opponentOf(game, playerId);
  game.winReason = "forfeit";
  return { ok: true };
}
