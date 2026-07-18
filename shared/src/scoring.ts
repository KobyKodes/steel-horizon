// Arcade scoring rules — pure functions, server-applied. The server engine
// owns the authoritative ScoreState per player and calls applyShot after
// every accepted resolution; the client only ever renders the resulting
// ScoreEvent / ScoreSummary. Never trust the client with score math.
//
// Kept import-light (board + fleet only, result as a literal union) so
// protocol.ts can import these types without a module cycle.

import { coordsEqual, type Coordinate } from "./board.js";
import { SHIP_LENGTHS, type ShipClassId } from "./fleet.js";

/** Points for any hit, before the chain multiplier. */
export const BASE_HIT_POINTS = 100;

/** Sink bonus by ship length — the bigger the ship, the bigger the payout. */
export const SINK_BONUS_BY_LENGTH: Record<number, number> = {
  2: 250,
  3: 400,
  4: 700,
  5: 1000,
};

export const FIRST_BLOOD_BONUS = 150;
export const VICTORY_BONUS = 500;
export const FLAWLESS_BONUS = 750;
/** Accuracy bonus: accuracy% × this, so a perfect 100% pays 1000. */
export const ACCURACY_BONUS_PER_PERCENT = 10;

/** Live per-player score, carried in snapshots during battle. */
export interface ScoreState {
  points: number;
  /** Consecutive non-miss shots; a miss resets to 0. */
  streak: number;
  /** Current chain multiplier derived from streak (see multiplierForStreak). */
  multiplier: number;
  maxMultiplier: number;
}

export type ScoreBonusKind = "first-blood" | "sink" | "perfect-kill";

export interface ScoreBonusAward {
  bonus: ScoreBonusKind;
  points: number;
}

/** What one shot was worth — rides shotResult / ShotRecord as the HUD cue. */
export interface ScoreEvent {
  /** Total points this shot awarded (base + bonuses, multiplier applied). */
  points: number;
  /** Streak AFTER this shot. */
  streak: number;
  /** Multiplier that applied to this shot. */
  multiplier: number;
  /** Shooter's running total AFTER this shot. */
  total: number;
  bonuses: ScoreBonusAward[];
}

/** End-of-game breakdown, revealed on the gameover snapshot. */
export interface ScoreSummary {
  battlePoints: number;
  victoryBonus: number;
  accuracyBonus: number;
  flawlessBonus: number;
  total: number;
  /** Whole-number percent, 0–100. */
  accuracy: number;
  maxMultiplier: number;
  shipsSunk: number;
}

/** One row of the persisted all-players leaderboard. */
export interface HighScoreEntry {
  name: string;
  score: number;
  accuracy: number;
  maxMultiplier: number;
  shipsSunk: number;
  /** ISO timestamp of when the game finished. */
  date: string;
}

export function initialScoreState(): ScoreState {
  return { points: 0, streak: 0, multiplier: 1, maxMultiplier: 1 };
}

/**
 * ×2 at a 3-streak, ×3 at 5, then +1 per consecutive hit (×4 at 6, ×5 at
 * 7, …). Uncapped — a full 17-hit run tops out at ×15.
 */
export function multiplierForStreak(streak: number): number {
  if (streak < 3) return 1;
  if (streak < 5) return 2;
  return streak - 2;
}

/** The just-resolved shot, shaped like a ShotRecord (structurally typed). */
export interface ScoredShot {
  result: "hit" | "miss" | "sunk";
  sunkShip?: ShipClassId;
  sunkShipCells?: Coordinate[];
}

export interface ShotScoreContext {
  /** True when this is the first non-miss shot by EITHER player. */
  firstHitOfMatch: boolean;
  /** This shooter's previous targets, in firing order (for perfect kill). */
  priorTargets: Coordinate[];
}

/**
 * Perfect kill: the ship died to an unbroken run of shots aimed only at it —
 * every one of the shooter's last (length - 1) shots landed on its cells
 * (the sinking shot itself is the length-th).
 */
export function isPerfectKill(
  priorTargets: Coordinate[],
  sunkShip: ShipClassId,
  sunkShipCells: Coordinate[],
): boolean {
  const runLength = SHIP_LENGTHS[sunkShip] - 1;
  if (priorTargets.length < runLength) return false;
  return priorTargets
    .slice(priorTargets.length - runLength)
    .every((target) =>
      sunkShipCells.some((cell) => coordsEqual(cell, target)),
    );
}

/**
 * Fold one resolved shot into a player's score. Returns the next state and
 * the ScoreEvent describing what this shot was worth. A miss pays nothing
 * and breaks the chain; hits extend the streak BEFORE the multiplier is
 * read, so the 3rd consecutive hit itself lands at ×2.
 */
export function applyShot(
  state: ScoreState,
  shot: ScoredShot,
  context: ShotScoreContext,
): { state: ScoreState; event: ScoreEvent } {
  if (shot.result === "miss") {
    const next: ScoreState = { ...state, streak: 0, multiplier: 1 };
    return {
      state: next,
      event: {
        points: 0,
        streak: 0,
        multiplier: 1,
        total: next.points,
        bonuses: [],
      },
    };
  }

  const streak = state.streak + 1;
  const multiplier = multiplierForStreak(streak);
  const bonuses: ScoreBonusAward[] = [];
  let points = BASE_HIT_POINTS * multiplier;

  if (context.firstHitOfMatch) {
    bonuses.push({ bonus: "first-blood", points: FIRST_BLOOD_BONUS });
    points += FIRST_BLOOD_BONUS;
  }

  if (
    shot.result === "sunk" &&
    shot.sunkShip !== undefined &&
    shot.sunkShipCells !== undefined
  ) {
    const sinkBonus =
      (SINK_BONUS_BY_LENGTH[SHIP_LENGTHS[shot.sunkShip]] ?? 0) * multiplier;
    bonuses.push({ bonus: "sink", points: sinkBonus });
    points += sinkBonus;
    if (isPerfectKill(context.priorTargets, shot.sunkShip, shot.sunkShipCells)) {
      // Perfect kill doubles the sink bonus.
      bonuses.push({ bonus: "perfect-kill", points: sinkBonus });
      points += sinkBonus;
    }
  }

  const next: ScoreState = {
    points: state.points + points,
    streak,
    multiplier,
    maxMultiplier: Math.max(state.maxMultiplier, multiplier),
  };
  return {
    state: next,
    event: { points, streak, multiplier, total: next.points, bonuses },
  };
}

export interface FinalizeContext {
  won: boolean;
  /** Flawless = won by destroying the fleet while losing none of your own. */
  flawless: boolean;
}

/**
 * Fold end-of-game bonuses into a final summary. `shots` is the player's
 * full shot history (accuracy + ships sunk are derived from it, matching
 * the PostGame screen's client-side stats).
 */
export function finalizeScore(
  state: ScoreState,
  shots: ScoredShot[],
  context: FinalizeContext,
): ScoreSummary {
  const hits = shots.filter((shot) => shot.result !== "miss").length;
  const accuracy =
    shots.length === 0 ? 0 : Math.round((hits / shots.length) * 100);
  const accuracyBonus = accuracy * ACCURACY_BONUS_PER_PERCENT;
  const victoryBonus = context.won ? VICTORY_BONUS : 0;
  const flawlessBonus = context.flawless ? FLAWLESS_BONUS : 0;
  return {
    battlePoints: state.points,
    victoryBonus,
    accuracyBonus,
    flawlessBonus,
    total: state.points + victoryBonus + accuracyBonus + flawlessBonus,
    accuracy,
    maxMultiplier: state.maxMultiplier,
    shipsSunk: shots.filter((shot) => shot.result === "sunk").length,
  };
}
