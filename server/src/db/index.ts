// Postgres database bootstrap: connects to DATABASE_URL (Neon in
// production), applies migrations, and hands back a Drizzle instance.
// `openTestDatabase()` gives tests a throwaway in-process Postgres via
// PGlite — the same real dialect, zero setup, no server to manage. It
// replaces the old SQLite `:memory:` handle and keeps the same pattern
// as InMemoryHighScoreStore.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { runMigrations } from "./migrate.js";
import * as schema from "./schema.js";

/** Both drivers expose the same query surface, so callers stay driver-blind. */
export type Db =
  | ReturnType<typeof drizzlePg<typeof schema>>
  | ReturnType<typeof drizzlePglite<typeof schema>>;

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

/** The Neon connection string. Set in the Render dashboard (sync: false in
 *  render.yaml) and in server/.env for local dev — never committed. */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "DATABASE_URL is not set. Add the Neon connection string to the " +
        "Render dashboard (production) or server/.env (local dev).",
    );
  }
  return url;
}

export interface DatabaseHandles {
  db: Db;
  close: () => Promise<void>;
}

/** Connect to the real Postgres and bring the schema up to date. */
export async function openDatabase(
  connectionString: string,
): Promise<DatabaseHandles> {
  const pool = new pg.Pool({
    connectionString,
    // Neon terminates idle connections; keep the pool small and let it
    // recycle rather than holding sockets open across the free-tier
    // spin-down window.
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  await runMigrations(
    (sql, params) => pool.query(sql, params as unknown[]),
    MIGRATIONS_DIR,
  );
  return {
    db: drizzlePg(pool, { schema }),
    close: () => pool.end(),
  };
}

/** An isolated in-process Postgres for tests — the old `:memory:` handle. */
export async function openTestDatabase(): Promise<DatabaseHandles> {
  const client = new PGlite();
  await runMigrations(
    (sql, params) => client.query(sql, params as unknown[]),
    MIGRATIONS_DIR,
  );
  return {
    db: drizzlePglite(client, { schema }),
    close: () => client.close(),
  };
}
