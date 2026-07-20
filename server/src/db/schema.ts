// Drizzle schema for Steel Horizon's Postgres database — the durable store
// for accounts and everything that outlives a room (rooms/games-in-progress
// stay in memory, see rooms.ts). One file per concern, all defined here
// since the schema is small enough to read as a whole.

import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/** Every timestamp column: tz-aware, millisecond-precision, defaults to now. */
const stamp = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3, mode: "date" });

// --- Accounts ------------------------------------------------------------

/**
 * A signed-up player. `usernameLower` carries the case-insensitive unique
 * constraint (kept explicit rather than switching to citext, so no server
 * extension is required); `username` keeps the original casing for display.
 * Passwords are scrypt-hashed (see auth.ts) — never store or log a plaintext
 * password.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    createdAt: stamp("created_at").notNull().defaultNow(),
    lastSeenAt: stamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => [unique("users_username_lower_unique").on(table.usernameLower)],
);

/**
 * A persistent login credential — the client's `authToken` (localStorage),
 * distinct from the ephemeral Socket.IO `sessionId` (sessionStorage, a
 * room-resume token). One-time login: minted once at signup/login and
 * reused on every later visit until an explicit logout deletes the row.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: stamp("created_at").notNull().defaultNow(),
    lastUsedAt: stamp("last_used_at").notNull().defaultNow(),
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
export const games = pgTable("games", {
  id: text("id").primaryKey(),
  mode: text("mode", { enum: GAME_MODES }).notNull(),
  startedAt: stamp("started_at").notNull(),
  finishedAt: stamp("finished_at").notNull(),
  /** Null for a bot win/forfeit-with-no-human-winner edge case. */
  winnerUserId: text("winner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  winnerIsBot: boolean("winner_is_bot").notNull().default(false),
});

/** One human player's result row for a game — only signed-in users get one
 *  (bots never do; there is nothing to attribute a bot's side to). */
export const gameResults = pgTable(
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
    won: boolean("won").notNull(),
    hits: integer("hits").notNull(),
    misses: integer("misses").notNull(),
    accuracy: integer("accuracy").notNull(),
    shipsSunk: integer("ships_sunk").notNull(),
    shipsLost: integer("ships_lost").notNull(),
    maxMultiplier: real("max_multiplier").notNull(),
    medalsEarned: integer("medals_earned").notNull(),
    createdAt: stamp("created_at").notNull(),
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
export const legacyHighscores = pgTable(
  "legacy_highscores",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    score: integer("score").notNull(),
    accuracy: integer("accuracy").notNull(),
    maxMultiplier: real("max_multiplier").notNull(),
    shipsSunk: integer("ships_sunk").notNull(),
    createdAt: stamp("created_at").notNull(),
  },
  (table) => [index("legacy_highscores_score_idx").on(table.score)],
);

// --- Aggregate stats -------------------------------------------------------

/**
 * Maintained per-user aggregate, updated transactionally alongside each new
 * `gameResults` row (see stats.ts) so a profile read is O(1) rather than a
 * scan over full match history.
 */
export const playerStats = pgTable("player_stats", {
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
  updatedAt: stamp("updated_at").notNull().defaultNow(),
});
