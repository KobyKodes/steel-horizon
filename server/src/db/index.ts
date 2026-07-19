// SQLite database bootstrap: opens (or creates) the DB file, applies
// pragmas and migrations, and hands back a Drizzle instance over it.
// `openDatabase(":memory:")` gives tests a throwaway DB with the full
// schema and zero disk I/O — the same pattern as InMemoryHighScoreStore.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { runMigrations } from "./migrate.js";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandles {
  db: Db;
  sqlite: Database.Database;
}

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

/** Default on-disk location, mirroring resolveHighScorePath()'s pattern. */
export function resolveDatabasePath(): string {
  return (
    process.env.DATABASE_PATH ??
    path.resolve(process.cwd(), "data/steel-horizon.db")
  );
}

export function openDatabase(filePath: string): DatabaseHandles {
  if (filePath !== ":memory:") {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite, MIGRATIONS_DIR);
  return { db: drizzle(sqlite, { schema }), sqlite };
}
