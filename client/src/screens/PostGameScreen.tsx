// PostGameScreen — gameover: winner banner, full board reveal, client-side
// stats, and the both-must-accept rematch loop. Everything renders from the
// gameover snapshot; `revealedOpponentFleet` is only non-null here.

import {
  cellsForPlacement,
  type FleetPlacement,
  type ShotRecord,
} from "@steel-horizon/shared";
import { useGameStore } from "../store";
import { GameSceneAdapter } from "../scene/GameSceneAdapter";
import "./battle.css";

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
