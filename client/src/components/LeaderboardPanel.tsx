// The tabbed global leaderboard (This week / All time) — one component,
// two homes: the PostGame score tally (with the viewer's fresh entry
// highlighted) and the landing page's "View leaderboards" overlay (no
// highlight, data fetched over HTTP). Styling reuses the pg-score classes
// from postgameScore.css — it IS the postgame board, just portable.

import { useState } from "react";
import type { HighScoreEntry } from "@steel-horizon/shared";
import "../screens/postgameScore.css";

export interface LeaderboardPanelProps {
  allTime: HighScoreEntry[] | null;
  weekly: HighScoreEntry[] | null;
  /** Viewer's 0-based rank per board; highlights + "you" tag when set. */
  yourAllTimeRank?: number | null;
  yourWeeklyRank?: number | null;
  /** Show the NEW HIGH SCORE! / YOU MADE THE BOARD! flasher (postgame). */
  showPlacement?: boolean;
  /** Stamp-in cadence offset when embedded in the postgame tally. */
  delaySeconds?: number;
}

export default function LeaderboardPanel({
  allTime,
  weekly,
  yourAllTimeRank = null,
  yourWeeklyRank = null,
  showPlacement = false,
  delaySeconds = 0,
}: LeaderboardPanelProps) {
  const [board, setBoard] = useState<"weekly" | "all-time">("weekly");
  const entries = board === "weekly" ? weekly : allTime;
  const highlightRank = board === "weekly" ? yourWeeklyRank : yourAllTimeRank;

  if (entries === null) return null;

  return (
    <div
      className="pg-score-board"
      style={{ animationDelay: `${delaySeconds}s` }}
    >
      {showPlacement && highlightRank !== null && (
        <div className="pg-score-newhigh">
          {highlightRank === 0 ? "NEW HIGH SCORE!" : "YOU MADE THE BOARD!"}
        </div>
      )}
      <div className="pg-score-tabs">
        <button
          type="button"
          className={board === "weekly" ? "pg-score-tab pg-score-tab--on" : "pg-score-tab"}
          onClick={() => setBoard("weekly")}
        >
          This week
        </button>
        <button
          type="button"
          className={board === "all-time" ? "pg-score-tab pg-score-tab--on" : "pg-score-tab"}
          onClick={() => setBoard("all-time")}
        >
          All time
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Captain</th>
            <th>Score</th>
            <th>Acc</th>
            <th>Chain</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr
              key={`${entry.name}-${entry.score}-${entry.date}-${i}`}
              className={i === highlightRank ? "pg-score-you" : undefined}
            >
              <td>{i + 1}</td>
              <td>
                {entry.name}
                {i === highlightRank && (
                  <span className="pg-score-you-tag">you</span>
                )}
              </td>
              <td>{entry.score.toLocaleString()}</td>
              <td>{entry.accuracy}%</td>
              <td>×{entry.maxMultiplier}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5}>
                {board === "weekly"
                  ? "No scores yet this week — set the bar."
                  : "No scores yet — be the first on the board."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
