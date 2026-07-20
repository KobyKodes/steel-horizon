// Global high-score leaderboard, persisted as a small JSON file. Same
// narrow-interface pattern as rooms.ts: the store is swappable, and tests
// inject the in-memory variant so they never touch disk.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { HighScoreEntry } from "@steel-horizon/shared";

/** Visible leaderboard depth (both all-time and weekly views). */
export const HIGH_SCORE_LIMIT = 20;

/** Entries kept on disk — deeper than the view so the weekly board can
    surface scores that don't crack the all-time top 20. */
export const HIGH_SCORE_STORAGE_LIMIT = 100;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface SubmitResult {
  /** 0-based rank on the all-time top-20, or null if unplaced. */
  allTimeRank: number | null;
  /** 0-based rank on the last-7-days top-20, or null if unplaced. */
  weeklyRank: number | null;
}

// Async because the durable implementation (PostgresHighScoreStore, in
// stats.ts) talks to Postgres over the network; the in-memory and JSON
// stores below satisfy the same contract by returning settled promises.
export interface HighScoreStore {
  /** All-time top-20, best first. */
  top(): Promise<HighScoreEntry[]>;
  /** Last-7-days top-20, best first. */
  topWeekly(nowMs?: number): Promise<HighScoreEntry[]>;
  /** Record an entry; returns where it placed on each board. */
  submit(entry: HighScoreEntry): Promise<SubmitResult>;
}

/** Insert `entry` into a best-first list, truncated to storage depth. */
function insertEntry(
  entries: HighScoreEntry[],
  entry: HighScoreEntry,
): { entries: HighScoreEntry[]; result: SubmitResult } {
  const next = [...entries, entry].sort((a, b) => b.score - a.score);
  next.length = Math.min(next.length, HIGH_SCORE_STORAGE_LIMIT);
  const allTime = next.indexOf(entry);
  const weekly = weeklyView(next, Date.parse(entry.date)).indexOf(entry);
  return {
    entries: next,
    result: {
      allTimeRank: allTime >= 0 && allTime < HIGH_SCORE_LIMIT ? allTime : null,
      weeklyRank: weekly >= 0 && weekly < HIGH_SCORE_LIMIT ? weekly : null,
    },
  };
}

/** Entries dated within the last 7 days of `nowMs`, still best first. */
function weeklyView(entries: HighScoreEntry[], nowMs: number): HighScoreEntry[] {
  return entries.filter((entry) => {
    const at = Date.parse(entry.date);
    return Number.isFinite(at) && nowMs - at <= WEEK_MS;
  });
}

export class InMemoryHighScoreStore implements HighScoreStore {
  private entries: HighScoreEntry[] = [];

  async top(): Promise<HighScoreEntry[]> {
    return this.entries.slice(0, HIGH_SCORE_LIMIT);
  }

  async topWeekly(nowMs: number = Date.now()): Promise<HighScoreEntry[]> {
    return weeklyView(this.entries, nowMs).slice(0, HIGH_SCORE_LIMIT);
  }

  async submit(entry: HighScoreEntry): Promise<SubmitResult> {
    const inserted = insertEntry(this.entries, entry);
    this.entries = inserted.entries;
    return inserted.result;
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
      return parsed.filter(isEntryShaped).slice(0, HIGH_SCORE_STORAGE_LIMIT);
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

  async top(): Promise<HighScoreEntry[]> {
    return this.entries.slice(0, HIGH_SCORE_LIMIT);
  }

  async topWeekly(nowMs: number = Date.now()): Promise<HighScoreEntry[]> {
    return weeklyView(this.entries, nowMs).slice(0, HIGH_SCORE_LIMIT);
  }

  async submit(entry: HighScoreEntry): Promise<SubmitResult> {
    const inserted = insertEntry(this.entries, entry);
    this.entries = inserted.entries;
    this.persist();
    return inserted.result;
  }
}

/** Default on-disk location, overridable for deploys with a mounted disk. */
export function resolveHighScorePath(): string {
  return (
    process.env.HIGHSCORES_PATH ??
    path.resolve(process.cwd(), "data/highscores.json")
  );
}
