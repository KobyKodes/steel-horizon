// Minimal, dependency-free SQL migration runner.
//
// drizzle-kit's own migrator expects a private journal/snapshot format that
// its CLI (`drizzle-kit generate`) produces; this workspace's npm hoisting
// leaves drizzle-kit unable to resolve drizzle-orm at runtime (a nested
// workspace quirk, not a schema problem), so `generate` can't run here.
// Since the SQL files in ../../drizzle/ already follow drizzle-kit's own
// `--> statement-breakpoint`-delimited convention, this runner applies them
// itself: each file runs at most once, tracked in `_migrations`, inside a
// transaction, in filename order. Swapping back to drizzle-kit's migrator
// later is a drop-in change — the .sql files don't need to move.
//
// Driver-agnostic by design: callers pass a `query` that runs one raw SQL
// statement and returns its rows, so the same runner serves node-postgres
// (production) and PGlite (tests).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

/** Advisory-lock key; arbitrary, just has to be stable across instances. */
const MIGRATION_LOCK_KEY = 4242424242;

/** Runs a single SQL statement and returns the rows it produced. */
export type QuerySql = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export async function runMigrations(
  query: QuerySql,
  migrationsDir: string,
): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch {
    return; // No migrations directory (e.g. an isolated unit test DB).
  }

  for (const file of files) {
    const statements = readFileSync(path.join(migrationsDir, file), "utf8")
      .split(STATEMENT_BREAKPOINT)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // One transaction per file. The advisory lock serialises concurrent
    // boots (Render overlaps old and new instances during a deploy) and the
    // ON CONFLICT insert decides who actually applies it: exactly one caller
    // gets a row back, everyone else sees zero and skips.
    await query("BEGIN");
    try {
      await query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
      const claim = await query(
        `INSERT INTO _migrations (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING
         RETURNING name`,
        [file],
      );
      if (claim.rows.length > 0) {
        for (const statement of statements) await query(statement);
      }
      await query("COMMIT");
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }
}
