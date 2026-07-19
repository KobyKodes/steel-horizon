// BattleScreen — the live game. Everything renders from the snapshot:
// yourShots drives the targeting board, you.fleet + shotsAgainstYou drives
// your fleet board, currentTurn gates firing. When the server flips phase to
// gameover the App router swaps screens — no navigation logic here.

import { useState } from "react";
import {
  SHIP_LENGTHS,
  cellsForPlacement,
  type ShipClassId,
} from "@steel-horizon/shared";
import { useGameStore } from "../store";
import { GameSceneAdapter } from "../scene/GameSceneAdapter";
import type { CameraView } from "../scene/camera/CameraRig";
import ShotLog from "../components/ShotLog";
import ScoreHud from "../components/ScoreHud";
import "../components/callShot.css";
import "./battle.css";

const SHIP_NAMES: Record<ShipClassId, string> = {
  carrier: "Carrier",
  battleship: "Battleship",
  cruiser: "Cruiser",
  submarine: "Submarine",
  destroyer: "Destroyer",
};

const SHIP_ORDER: ShipClassId[] = [
  "carrier",
  "battleship",
  "cruiser",
  "submarine",
  "destroyer",
];

function ErrorBanner() {
  const lastError = useGameStore((s) => s.lastError);
  const clearError = useGameStore((s) => s.clearError);
  if (!lastError) return null;
  return (
    <div className="banner error" role="alert">
      <span>{lastError.message}</span>
      <button type="button" className="banner-dismiss" onClick={clearError}>
        &times;
      </button>
    </div>
  );
}

export default function BattleScreen() {
  const snapshot = useGameStore((s) => s.snapshot);
  const fire = useGameStore((s) => s.fire);
  // Realizes PROJECT.md's "two views... smooth animated camera transition
  // when switching" — CameraRig damps between them, GameSceneAdapter just
  // forwards the choice.
  const [viewMode, setViewMode] = useState<CameraView>("targeting");
  // True while an incoming-shot cinematic is playing on the main panel — the
  // adapter force-flips the view to your own fleet grid for its duration
  // (05-03 defender-side expansion), so the header must stop saying "Enemy
  // waters" and the manual view toggle is meaningless mid-cinematic.
  const [incomingCinematic, setIncomingCinematic] = useState(false);

  // How many of YOUR shots have visibly resolved on screen. The snapshot
  // (and its authoritative scores) arrives before the shell even launches,
  // so the HUD replays score state from the last *settled* shot's
  // ScoreEvent instead — the odometer rolls at impact, with the callout,
  // not a second early. Seeded with the mount-time count so reconnects
  // show the current score immediately without animating history.
  const [scoredCount, setScoredCount] = useState(
    () => useGameStore.getState().snapshot?.yourShots.length ?? 0,
  );

  // Call-your-shot stake: armed by the toggle, spent by the next shot.
  const [shotCalled, setShotCalled] = useState(false);

  if (!snapshot) return null;

  const { you, opponent, yourShots, shotsAgainstYou, currentTurn } = snapshot;
  const yourTurn = currentTurn === "you";

  // Per-ship damage on YOUR fleet, from shotsAgainstYou.
  const hitCells = new Set(
    shotsAgainstYou
      .filter((s) => s.result !== "miss")
      .map((s) => `${s.target.col},${s.target.row}`),
  );
  const yourDamage = (you.fleet ?? []).map((placement) => {
    const cells = cellsForPlacement(placement);
    const hits = cells.filter((c) => hitCells.has(`${c.col},${c.row}`)).length;
    return { ship: placement.ship, hits, length: cells.length };
  });
  const yourSunkShips = yourDamage
    .filter(({ hits, length }) => hits === length)
    .map(({ ship }) => ship);

  // HUD score state from the last settled shot's server-computed
  // ScoreEvent (records without one — pre-scoring games — display as 0).
  const lastScored = yourShots
    .slice(0, scoredCount)
    .reverse()
    .find((shot) => shot.score)?.score;

  return (
    <div className="screen battle-screen">
      <div
        className={yourTurn ? "turn-indicator your-turn" : "turn-indicator"}
        role="status"
      >
        {yourTurn ? "YOUR TURN — fire at the enemy grid" : "Opponent’s turn…"}
      </div>

      <ErrorBanner />

      <ScoreHud
        points={lastScored?.total ?? 0}
        streak={lastScored?.streak ?? 0}
        multiplier={lastScored?.multiplier ?? 1}
      />

      <button
        type="button"
        className={shotCalled ? "call-shot call-shot--armed" : "call-shot"}
        disabled={!yourTurn}
        onClick={() => setShotCalled((armed) => !armed)}
      >
        {shotCalled
          ? "Shot called — double or nothing!"
          : "Call your shot (double or nothing)"}
      </button>

      <div className="battle-layout">
        <section className="battle-main">
          <div className="battle-main-header">
            <h2>
              {incomingCinematic
                ? "Incoming fire!"
                : viewMode === "targeting"
                  ? "Enemy waters"
                  : "Your fleet"}
            </h2>
            <button
              type="button"
              className="view-toggle"
              disabled={incomingCinematic}
              onClick={() =>
                setViewMode((v) => (v === "targeting" ? "fleet" : "targeting"))
              }
            >
              {viewMode === "targeting" ? "View your fleet" : "View enemy waters"}
            </button>
          </div>
          <GameSceneAdapter
            view={viewMode}
            yourFleet={you.fleet}
            shots={yourShots}
            incomingShots={shotsAgainstYou}
            onIncomingActiveChange={setIncomingCinematic}
            canFire={yourTurn}
            onFire={(target) => {
              fire(target, shotCalled);
              setShotCalled(false);
            }}
            onOutgoingResult={() => setScoredCount((count) => count + 1)}
            sunkShips={yourSunkShips}
          />
          <div className="fleet-status">
            <h3>{opponent?.name ?? "Opponent"}&rsquo;s fleet</h3>
            <ul>
              {SHIP_ORDER.map((ship) => {
                const sunk = opponent?.sunkShips.includes(ship) ?? false;
                return (
                  <li key={ship} className={sunk ? "sunk" : undefined}>
                    {SHIP_NAMES[ship]} ({SHIP_LENGTHS[ship]})
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="battle-side">
          <h2>Your fleet</h2>
          <GameSceneAdapter
            view="fleet"
            mode="reveal"
            yourFleet={you.fleet}
            shots={shotsAgainstYou}
            sunkShips={yourSunkShips}
          />
          <div className="fleet-status">
            <h3>Damage report</h3>
            <ul>
              {yourDamage.map(({ ship, hits, length }) => (
                <li key={ship} className={hits === length ? "sunk" : undefined}>
                  {SHIP_NAMES[ship]} {hits}/{length}
                </li>
              ))}
            </ul>
          </div>
          <h3>Battle log</h3>
          <ShotLog />
        </section>
      </div>
    </div>
  );
}
