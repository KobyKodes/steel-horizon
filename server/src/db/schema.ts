// Drizzle schema for Steel Horizon's SQLite database — the durable store
// for accounts and everything that outlives a room (rooms/games-in-progress
// stay in memory, see rooms.ts). One file per concern, all defined here
// since the schema is small enough to read as a whole.

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// --- Accounts ------------------------------------------------------------

/**
 * A signed-up player. `usernameLower` carries the case-insensitive unique
 * constraint (SQLite has no native citext); `username` keeps the original
 * casing for display. Passwords are scrypt-hashed (see auth.ts) — never
 * store or log a plaintext password.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (table) => [unique("users_username_lower_unique").on(table.usernameLower)],
);

/**
 * A persistent login credential — the client's `authToken` (localStorage),
 * distinct from the ephemeral Socket.IO `sessionId` (sessionStorage, a
 * room-resume token). One-time login: minted once at signup/login and
 * reused on every later visit until an explicit logout deletes the row.
 */
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (table) => [index("auth_tokens_user_id_idx").on(table.userId)],
);

// --- Match history ---------------------------------------------------------

export const GAME_MODES = [
  "pvp",
  "bot_easy",
  "bot_medium",
  "bot_hard",
] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** One finished (or forfeited) room's outcome. */
export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  mode: text("mode", { enum: GAME_MODES }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }).notNull(),
  /** Null for a bot win/forfeit-with-no-human-winner edge case. */
  winnerUserId: text("winner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  winnerIsBot: integer("winner_is_bot", { mode: "boolean" })
    .notNull()
    .default(false),
});

/** One human player's result row for a game — only signed-in users get one
 *  (bots never do; there is nothing to attribute a bot's side to). */
export const gameResults = sqliteTable(
  "game_results",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    won: integer("won", { mode: "boolean" }).notNull(),
    hits: integer("hits").notNull(),
    misses: integer("misses").notNull(),
    accuracy: integer("accuracy").notNull(),
    shipsSunk: integer("ships_sunk").notNull(),
    shipsLost: integer("ships_lost").notNull(),
    maxMultiplier: real("max_multiplier").notNull(),
    medalsEarned: integer("medals_earned").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("game_results_user_id_idx").on(table.userId),
    index("game_results_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Pre-accounts leaderboard entries imported once from the legacy
 * data/highscores.json (anonymous names, no user to attach to). Merged
 * into leaderboard reads so the boards survive the migration; never
 * written to after the one-time import.
 */
export const legacyHighscores = sqliteTable(
  "legacy_highscores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    score: integer("score").notNull(),
    accuracy: integer("accuracy").notNull(),
    maxMultiplier: real("max_multiplier").notNull(),
    shipsSunk: integer("ships_sunk").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("legacy_highscores_score_idx").on(table.score)],
);

// --- Aggregate stats -------------------------------------------------------

/**
 * Maintained per-user aggregate, updated transactionally alongside each new
 * `gameResults` row (see stats.ts) so a profile read is O(1) rather than a
 * scan over full match history.
 */
export const playerStats = sqliteTable("player_stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  gamesPlayed: integer("games_played").notNull().default(0),
  gamesWon: integer("games_won").notNull().default(0),
  totalPoints: integer("total_points").notNull().default(0),
  bestScore: integer("best_score").notNull().default(0),
  totalHits: integer("total_hits").notNull().default(0),
  totalMisses: integer("total_misses").notNull().default(0),
  totalShipsSunk: integer("total_ships_sunk").notNull().default(0),
  currentWinStreak: integer("current_win_streak").notNull().default(0),
  bestWinStreak: integer("best_win_streak").notNull().default(0),
  botEasyPlayed: integer("bot_easy_played").notNull().default(0),
  botEasyWon: integer("bot_easy_won").notNull().default(0),
  botMediumPlayed: integer("bot_medium_played").notNull().default(0),
  botMediumWon: integer("bot_medium_won").notNull().default(0),
  botHardPlayed: integer("bot_hard_played").notNull().default(0),
  botHardWon: integer("bot_hard_won").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});
