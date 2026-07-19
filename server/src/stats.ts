// Durable game outcomes: writes one games row + per-human game_results rows
// and transactionally maintains the player_stats aggregates. Also provides
// the SQLite-backed HighScoreStore so the legacy JSON leaderboard is a
// drop-in swap (same interface, same top-20/weekly semantics — but backed
// by full match history instead of a truncated top-100 array).

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { desc, eq, sql } from "drizzle-orm";
import type { HighScoreEntry } from "@steel-horizon/shared";
import type { Db } from "./db/index.js";
import {
  gameResults,
  games,
  legacyHighscores,
  playerStats,
  users,
  type GameMode,
} from "./db/schema.js";
import {
  HIGH_SCORE_LIMIT,
  type HighScoreStore,
  type SubmitResult,
} from "./highscores.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlayerResultInput {
  userId: string;
  score: number;
  won: boolean;
  hits: number;
  misses: number;
  /** Whole-number percent, 0-100. */
  accuracy: number;
  shipsSunk: number;
  shipsLost: number;
  maxMultiplier: number;
  medalsEarned: number;
}

export interface GameRecordInput {
  mode: GameMode;
  startedAt: Date;
  finishedAt: Date;
  winnerUserId: string | null;
  winnerIsBot: boolean;
  results: PlayerResultInput[];
}

/** Persist a finished game and roll every player's aggregates forward. */
export function recordGame(db: Db, input: GameRecordInput): void {
  db.transaction((tx) => {
    const gameId = randomUUID();
    tx.insert(games)
      .values({
        id: gameId,
        mode: input.mode,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        winnerUserId: input.winnerUserId,
        winnerIsBot: input.winnerIsBot,
      })
      .run();

    for (const result of input.results) {
      tx.insert(gameResults)
        .values({
          id: randomUUID(),
          gameId,
          userId: result.userId,
          score: result.score,
          won: result.won,
          hits: result.hits,
          misses: result.misses,
          accuracy: result.accuracy,
          shipsSunk: result.shipsSunk,
          shipsLost: result.shipsLost,
          maxMultiplier: result.maxMultiplier,
          medalsEarned: result.medalsEarned,
          createdAt: input.finishedAt,
        })
        .run();

      const winInc = result.won ? 1 : 0;
      const isBot = input.mode !== "pvp";
      tx.update(playerStats)
        .set({
          gamesPlayed: sql`${playerStats.gamesPlayed} + 1`,
          gamesWon: sql`${playerStats.gamesWon} + ${winInc}`,
          totalPoints: sql`${playerStats.totalPoints} + ${result.score}`,
          bestScore: sql`max(${playerStats.bestScore}, ${result.score})`,
          totalHits: sql`${playerStats.totalHits} + ${result.hits}`,
          totalMisses: sql`${playerStats.totalMisses} + ${result.misses}`,
          totalShipsSunk: sql`${playerStats.totalShipsSunk} + ${result.shipsSunk}`,
          currentWinStreak: result.won
            ? sql`${playerStats.currentWinStreak} + 1`
            : 0,
          bestWinStreak: result.won
            ? sql`max(${playerStats.bestWinStreak}, ${playerStats.currentWinStreak} + 1)`
            : playerStats.bestWinStreak,
          botEasyPlayed: sql`${playerStats.botEasyPlayed} + ${isBot && input.mode === "bot_easy" ? 1 : 0}`,
          botEasyWon: sql`${playerStats.botEasyWon} + ${input.mode === "bot_easy" ? winInc : 0}`,
          botMediumPlayed: sql`${playerStats.botMediumPlayed} + ${input.mode === "bot_medium" ? 1 : 0}`,
          botMediumWon: sql`${playerStats.botMediumWon} + ${input.mode === "bot_medium" ? winInc : 0}`,
          botHardPlayed: sql`${playerStats.botHardPlayed} + ${input.mode === "bot_hard" ? 1 : 0}`,
          botHardWon: sql`${playerStats.botHardWon} + ${input.mode === "bot_hard" ? winInc : 0}`,
          updatedAt: input.finishedAt,
        })
        .where(eq(playerStats.userId, result.userId))
        .run();
    }
  });
}

export interface PlayerProfile {
  username: string;
  memberSince: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    totalPoints: number;
    bestScore: number;
    totalHits: number;
    totalMisses: number;
    /** Lifetime whole-number percent, 0-100. */
    accuracy: number;
    totalShipsSunk: number;
    currentWinStreak: number;
    bestWinStreak: number;
    bots: Record<"easy" | "medium" | "hard", { played: number; won: number }>;
  };
  recentGames: {
    mode: GameMode;
    score: number;
    won: boolean;
    accuracy: number;
    date: string;
  }[];
}

/** Public profile: aggregates + last 10 games. Null when unknown. */
export function playerProfile(db: Db, username: string): PlayerProfile | null {
  const row = db
    .select()
    .from(users)
    .innerJoin(playerStats, eq(playerStats.userId, users.id))
    .where(eq(users.usernameLower, username.trim().toLowerCase()))
    .get();
  if (row === undefined) return null;

  const { users: user, player_stats: stats } = row;
  const shots = stats.totalHits + stats.totalMisses;
  const recent = db
    .select({
      mode: games.mode,
      score: gameResults.score,
      won: gameResults.won,
      accuracy: gameResults.accuracy,
      createdAt: gameResults.createdAt,
    })
    .from(gameResults)
    .innerJoin(games, eq(games.id, gameResults.gameId))
    .where(eq(gameResults.userId, user.id))
    .orderBy(desc(gameResults.createdAt))
    .limit(10)
    .all();

  return {
    username: user.username,
    memberSince: user.createdAt.toISOString(),
    stats: {
      gamesPlayed: stats.gamesPlayed,
      gamesWon: stats.gamesWon,
      totalPoints: stats.totalPoints,
      bestScore: stats.bestScore,
      totalHits: stats.totalHits,
      totalMisses: stats.totalMisses,
      accuracy: shots === 0 ? 0 : Math.round((stats.totalHits / shots) * 100),
      totalShipsSunk: stats.totalShipsSunk,
      currentWinStreak: stats.currentWinStreak,
      bestWinStreak: stats.bestWinStreak,
      bots: {
        easy: { played: stats.botEasyPlayed, won: stats.botEasyWon },
        medium: { played: stats.botMediumPlayed, won: stats.botMediumWon },
        hard: { played: stats.botHardPlayed, won: stats.botHardWon },
      },
    },
    recentGames: recent.map((game) => ({
      mode: game.mode,
      score: game.score,
      won: game.won,
      accuracy: game.accuracy,
      date: game.createdAt.toISOString(),
    })),
  };
}

// --- HighScoreStore over SQL -------------------------------------------------

interface BoardRow {
  name: string;
  score: number;
  accuracy: number;
  max_multiplier: number;
  ships_sunk: number;
  created_at: number;
}

/**
 * The legacy leaderboard interface backed by game_results (login is
 * required to play, so every result row joins to a real user), merged with
 * the one-time legacy_highscores import so pre-account boards survive.
 * `submit` is a read-only rank probe here — the durable write happens in
 * recordGame, in the same settle path, before ranks are read.
 */
export class SqliteHighScoreStore implements HighScoreStore {
  constructor(private readonly db: Db) {}

  private query(sinceMs: number | null): HighScoreEntry[] {
    const since = sinceMs ?? 0;
    const rows = this.db.all<BoardRow>(sql`
      SELECT u.username AS name, r.score, r.accuracy,
             r.max_multiplier, r.ships_sunk, r.created_at
        FROM game_results r JOIN users u ON u.id = r.user_id
       WHERE r.created_at >= ${since}
      UNION ALL
      SELECT name, score, accuracy, max_multiplier, ships_sunk, created_at
        FROM legacy_highscores
       WHERE created_at >= ${since}
       ORDER BY score DESC
       LIMIT ${HIGH_SCORE_LIMIT}
    `);
    return rows.map((row) => ({
      name: row.name,
      score: row.score,
      accuracy: row.accuracy,
      maxMultiplier: row.max_multiplier,
      shipsSunk: row.ships_sunk,
      date: new Date(row.created_at).toISOString(),
    }));
  }

  top(): HighScoreEntry[] {
    return this.query(null);
  }

  topWeekly(nowMs: number = Date.now()): HighScoreEntry[] {
    return this.query(nowMs - WEEK_MS);
  }

  submit(entry: HighScoreEntry): SubmitResult {
    const at = Date.parse(entry.date);
    const when = Number.isFinite(at) ? at : Date.now();
    const rank = (sinceMs: number): number | null => {
      const row = this.db.get<{ above: number }>(sql`
        SELECT (SELECT count(*) FROM game_results
                 WHERE score > ${entry.score} AND created_at >= ${sinceMs})
             + (SELECT count(*) FROM legacy_highscores
                 WHERE score > ${entry.score} AND created_at >= ${sinceMs})
            AS above
      `);
      const position = row?.above ?? 0;
      return position < HIGH_SCORE_LIMIT ? position : null;
    };
    return {
      allTimeRank: rank(0),
      weeklyRank: rank(when - WEEK_MS),
    };
  }
}

// --- One-time legacy import ---------------------------------------------------

/**
 * Import data/highscores.json into legacy_highscores exactly once (skipped
 * when the table already has rows or the file is absent/corrupt). Runs at
 * startup, before the server accepts traffic.
 */
export function importLegacyHighscores(db: Db, jsonPath: string): void {
  const existing = db
    .select({ count: sql<number>`count(*)` })
    .from(legacyHighscores)
    .get();
  if ((existing?.count ?? 0) > 0) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;

  const entries = parsed.filter(
    (value): value is HighScoreEntry =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { score?: unknown }).score === "number",
  );
  if (entries.length === 0) return;

  db.transaction((tx) => {
    for (const entry of entries) {
      const at = Date.parse(entry.date ?? "");
      tx.insert(legacyHighscores)
        .values({
          name: entry.name,
          score: entry.score,
          accuracy: entry.accuracy ?? 0,
          maxMultiplier: entry.maxMultiplier ?? 1,
          shipsSunk: entry.shipsSunk ?? 0,
          createdAt: new Date(Number.isFinite(at) ? at : Date.now()),
        })
        .run();
    }
  });
}
