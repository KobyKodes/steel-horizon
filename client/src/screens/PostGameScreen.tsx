// PostGameScreen — gameover: winner banner, full board reveal, client-side
// stats, and the both-must-accept rematch loop. Everything renders from the
// gameover snapshot; `revealedOpponentFleet` is only non-null here.

import {
  cellsForPlacement,
  type FleetPlacement,
  type ScoreSummary,
  type ShotRecord,
} from "@steel-horizon/shared";
import { useGameStore } from "../store";
import { GameSceneAdapter } from "../scene/GameSceneAdapter";
import "./battle.css";
import "./postgameScore.css";

function accuracy(shots: ShotRecord[]): number {
  if (shots.length === 0) return 0;
  const hits = shots.filter((s) => s.result !== "miss").length;
  return Math.round((hits / shots.length) * 100);
}

function longestStreak(shots: ShotRecord[]): number {
  let best = 0;
  let current = 0;
  for (const shot of shots) {
    if (shot.result === "miss") {
      current = 0;
    } else {
      current += 1;
      best = Math.max(best, current);
    }
  }
  return best;
}

/** Ships fully hit by `shots`, for the reveal boards' damage tint. */
function sunkShipsIn(fleet: FleetPlacement | null, shots: ShotRecord[]) {
  const hitCells = new Set(
    shots
      .filter((s) => s.result !== "miss")
      .map((s) => `${s.target.col},${s.target.row}`),
  );
  return (fleet ?? [])
    .filter((placement) =>
      cellsForPlacement(placement).every((c) =>
        hitCells.has(`${c.col},${c.row}`),
      ),
    )
    .map((placement) => placement.ship);
}

const WIN_REASON_TEXT: Record<string, string> = {
  "all-ships-sunk": "All enemy ships destroyed",
  forfeit: "Opponent forfeited",
};

function leave(): void {
  sessionStorage.removeItem("sessionId");
  sessionStorage.removeItem("name");
  window.location.reload();
}

/**
 * Arcade score tally: the final breakdown stamps in line by line (battle
 * points, then each earned bonus, then the total), followed by the global
 * top-20 leaderboard with the viewer's fresh entry highlighted. Row
 * cadence is pure CSS animation-delay stepping — no timers.
 */
function ScoreTally({
  summary,
  leaderboard,
  yourRank,
}: {
  summary: ScoreSummary;
  leaderboard: { name: string; score: number; accuracy: number; maxMultiplier: number }[] | null;
  yourRank: number | null;
}) {
  const rows: { label: string; value: number }[] = [
    { label: "Battle points", value: summary.battlePoints },
    { label: "Accuracy bonus", value: summary.accuracyBonus },
  ];
  if (summary.victoryBonus > 0) {
    rows.push({ label: "Victory", value: summary.victoryBonus });
  }
  if (summary.flawlessBonus > 0) {
    rows.push({ label: "Flawless fleet", value: summary.flawlessBonus });
  }

  const stepSeconds = 0.35;
  const totalDelay = rows.length * stepSeconds + 0.2;
  const boardDelay = totalDelay + 0.6;

  return (
    <div className="pg-score">
      <div className="pg-score-tally">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="pg-score-row"
            style={{ animationDelay: `${i * stepSeconds}s` }}
          >
            <span className="pg-score-row-label">{row.label}</span>
            <span className="pg-score-row-value">
              +{row.value.toLocaleString()}
            </span>
          </div>
        ))}
        <div
          className="pg-score-row pg-score-row--total"
          style={{ animationDelay: `${totalDelay}s` }}
        >
          <span className="pg-score-row-label">Final score</span>
          <span className="pg-score-row-value">
            {summary.total.toLocaleString()}
          </span>
        </div>
      </div>

      {leaderboard && leaderboard.length > 0 && (
        <div
          className="pg-score-board"
          style={{ animationDelay: `${boardDelay}s` }}
        >
          {yourRank !== null && (
            <div className="pg-score-newhigh">
              {yourRank === 0 ? "NEW HIGH SCORE!" : "YOU MADE THE BOARD!"}
            </div>
          )}
          <h3>All-time top {leaderboard.length}</h3>
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
              {leaderboard.map((entry, i) => (
                <tr
                  key={`${entry.name}-${entry.score}-${i}`}
                  className={i === yourRank ? "pg-score-you" : undefined}
                >
                  <td>{i + 1}</td>
                  <td>
                    {entry.name}
                    {i === yourRank && (
                      <span className="pg-score-you-tag">you</span>
                    )}
                  </td>
                  <td>{entry.score.toLocaleString()}</td>
                  <td>{entry.accuracy}%</td>
                  <td>×{entry.maxMultiplier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PostGameScreen() {
  const snapshot = useGameStore((s) => s.snapshot);
  const requestRematch = useGameStore((s) => s.requestRematch);

  if (!snapshot) return null;

  const {
    you,
    opponent,
    yourShots,
    shotsAgainstYou,
    winner,
    winReason,
    revealedOpponentFleet,
    rematch,
    finalScores,
    leaderboard,
    yourLeaderboardRank,
  } = snapshot;

  const victory = winner === "you";
  const shotsTaken = yourShots.length;
  const oppShotsTaken = shotsAgainstYou.length;

  return (
    <div className="screen postgame-screen">
      <div className={victory ? "result-banner victory" : "result-banner defeat"}>
        {victory ? "VICTORY" : "DEFEAT"}
        {winReason && (
          <span className="win-reason">
            {WIN_REASON_TEXT[winReason] ?? winReason}
          </span>
        )}
      </div>

      <div className="postgame-boards">
        <div>
          <h2>Your waters</h2>
          <GameSceneAdapter
            view="fleet"
            mode="reveal"
            yourFleet={you.fleet}
            shots={shotsAgainstYou}
            sunkShips={sunkShipsIn(you.fleet, shotsAgainstYou)}
          />
        </div>
        <div>
          <h2>{opponent?.name ?? "Opponent"}&rsquo;s waters (revealed)</h2>
          <GameSceneAdapter
            view="fleet"
            mode="reveal"
            yourFleet={revealedOpponentFleet}
            shots={yourShots}
            sunkShips={opponent?.sunkShips}
          />
        </div>
      </div>

      {finalScores && (
        <ScoreTally
          summary={finalScores.you}
          leaderboard={leaderboard}
          yourRank={yourLeaderboardRank}
        />
      )}

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{shotsTaken}</span>
          <span className="stat-label">Your shots</span>
        </div>
        <div className="stat">
          <span className="stat-value">{accuracy(yourShots)}%</span>
          <span className="stat-label">Accuracy</span>
        </div>
        <div className="stat">
          <span className="stat-value">{longestStreak(yourShots)}</span>
          <span className="stat-label">Best streak</span>
        </div>
        <div className="stat">
          <span className="stat-value">{oppShotsTaken}</span>
          <span className="stat-label">
            {opponent?.name ?? "Opponent"}&rsquo;s shots
          </span>
        </div>
      </div>

      <div className="rematch-row">
        <button
          type="button"
          onClick={requestRematch}
          disabled={rematch.youRequested}
        >
          Request rematch
        </button>
        {rematch.youRequested && !rematch.opponentRequested && (
          <p className="rematch-note">Rematch requested — waiting&hellip;</p>
        )}
        {rematch.opponentRequested && !rematch.youRequested && (
          <p className="rematch-note opponent-wants">
            Opponent wants a rematch!
          </p>
        )}
        <button type="button" className="leave-link" onClick={leave}>
          Leave
        </button>
      </div>
    </div>
  );
}
