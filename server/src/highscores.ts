// Global high-score leaderboard, persisted as a small JSON file. Same
// narrow-interface pattern as rooms.ts: the store is swappable, and tests
// inject the in-memory variant so they never touch disk.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HighScoreEntry } from "@steel-horizon/shared";

/** Leaderboard depth — only the top N survive. */
export const HIGH_SCORE_LIMIT = 20;

export interface HighScoreStore {
  /** Current leaderboard, best first. */
  top(): HighScoreEntry[];
  /** Record an entry; returns its 0-based rank, or null if it didn't place. */
  submit(entry: HighScoreEntry): number | null;
}

/** Insert `entry` into a best-first list, truncated to the limit. */
function insertEntry(
  entries: HighScoreEntry[],
  entry: HighScoreEntry,
): { entries: HighScoreEntry[]; rank: number | null } {
  const next = [...entries, entry].sort((a, b) => b.score - a.score);
  next.length = Math.min(next.length, HIGH_SCORE_LIMIT);
  const rank = next.indexOf(entry);
  return { entries: next, rank: rank === -1 ? null : rank };
}

export class InMemoryHighScoreStore implements HighScoreStore {
  private entries: HighScoreEntry[] = [];

  top(): HighScoreEntry[] {
    return this.entries;
  }

  submit(entry: HighScoreEntry): number | null {
    const result = insertEntry(this.entries, entry);
    this.entries = result.entries;
    return result.rank;
  }
}

/** Shape guard for the file's contents — a hostile/corrupt file loads as []. */
function isEntryShaped(value: unknown): value is HighScoreEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { score?: unknown }).score === "number"
  );
}

export class JsonHighScoreStore implements HighScoreStore {
  private entries: HighScoreEntry[];

  constructor(private readonly filePath: string) {
    this.entries = this.load();
  }

  private load(): HighScoreEntry[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isEntryShaped).slice(0, HIGH_SCORE_LIMIT);
    } catch {
      // Missing or unreadable file: start with an empty board.
      return [];
    }
  }

  private persist(): void {
    // Atomic write: temp file + rename, so a crash mid-write never leaves
    // a truncated leaderboard behind.
    const tempPath = `${this.filePath}.tmp`;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(tempPath, JSON.stringify(this.entries, null, 2));
    renameSync(tempPath, this.filePath);
  }

  top(): HighScoreEntry[] {
    return this.entries;
  }

  submit(entry: HighScoreEntry): number | null {
    const result = insertEntry(this.entries, entry);
    this.entries = result.entries;
    this.persist();
    return result.rank;
  }
}

/** Default on-disk location, overridable for deploys with a mounted disk. */
export function resolveHighScorePath(): string {
  return (
    process.env.HIGHSCORES_PATH ??
    path.resolve(process.cwd(), "data/highscores.json")
  );
}
