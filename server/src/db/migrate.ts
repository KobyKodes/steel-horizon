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

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )`,
  );

  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all() as { name: string }[],
  );
  const appliedNames = new Set([...applied].map((row) => row.name));

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch {
    return; // No migrations directory (e.g. an isolated unit test DB).
  }

  const markApplied = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );

  for (const file of files) {
    if (appliedNames.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = sql
      .split(STATEMENT_BREAKPOINT)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const applyFile = db.transaction(() => {
      for (const statement of statements) db.exec(statement);
      markApplied.run(file, Date.now());
    });
    applyFile();
  }
}
