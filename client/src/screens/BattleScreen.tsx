// BattleScreen — the live game. Everything renders from the snapshot:
// yourShots drives the targeting board, you.fleet + shotsAgainstYou drives
// your fleet board, currentTurn gates firing. When the server flips phase to
// gameover, App keeps this screen mounted so the final sink cinematic and
// SUNK! callout play out; once they settle, the victory banner slams in and
// its button (onShowResults) advances to the post-game screen.

import { useEffect, useState } from "react";
import {
  SHIP_LENGTHS,
  cellsForPlacement,
  type ShipClassId,
} from "@steel-horizon/shared";
import { useGameStore } from "../store";
import { GameSceneAdapter } from "../scene/GameSceneAdapter";
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

// Stable empty stream for the side board: it never owns outgoing shots.
const NO_SHOTS: never[] = [];

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

export default function BattleScreen({
  onShowResults,
}: {
  onShowResults?: () => void;
}) {
  const snapshot = useGameStore((s) => s.snapshot);
  const fire = useGameStore((s) => s.fire);
  // Both boards keep fixed cameras (USER direction 2026-07-19): the main
  // board is always enemy waters, the equal-sized side board is always
  // your fleet — incoming-shot cinematics play there, shell from the top
  // of that canvas. This flag only relabels the side panel's header.
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

  // Enemy mirror of scoredCount: their HUD advances when the incoming-shot
  // cinematic finishes on your fleet board (the only per-batch resolution
  // signal the side scene exposes), so their score lands with the shell.
  const [enemyScoredCount, setEnemyScoredCount] = useState(
    () => useGameStore.getState().snapshot?.shotsAgainstYou.length ?? 0,
  );

  // Call-your-shot stake: armed by the toggle, spent by the next shot.
  const [shotCalled, setShotCalled] = useState(false);

  // Victory banner: shown a beat after gameover once every shot cinematic
  // has visibly settled, so the final SUNK! gets its full moment first.
  const [victoryShown, setVictoryShown] = useState(false);
  const gameOver = snapshot?.phase === "gameover";
  const cinematicsSettled =
    scoredCount >= (snapshot?.yourShots.length ?? 0) && !incomingCinematic;
  useEffect(() => {
    if (!gameOver || !cinematicsSettled || victoryShown) return;
    // The SUNK! callout lives ~2.2s from impact; let it finish its exit.
    const timer = setTimeout(() => setVictoryShown(true), 2400);
    return () => clearTimeout(timer);
  }, [gameOver, cinematicsSettled, victoryShown]);

  if (!snapshot) return null;

  const { you, opponent, yourShots, shotsAgainstYou, currentTurn } = snapshot;
  const yourTurn = currentTurn === "you";
  // Server-enforced stake budget; the button just mirrors it.
  const callsLeft = snapshot.calledShotsRemaining;

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

  const enemySettled = shotsAgainstYou.slice(0, enemyScoredCount);
  const enemyLastScored = enemySettled
    .slice()
    .reverse()
    .find((shot) => shot.score)?.score;
  // The enemy's stake only shows once their shot lands: a called shot rides
  // its ScoreEvent as a "called-shot" bonus (positive on hit, penalty on miss).
  const enemyCalledShot =
    enemySettled[enemySettled.length - 1]?.score?.bonuses.some(
      (bonus) => bonus.bonus === "called-shot",
    ) ?? false;

  const winnerName =
    snapshot.winner === "you" ? you.name : (opponent?.name ?? "Opponent");
  const youWon = snapshot.winner === "you";

  return (
    <div className="screen battle-screen">
      {/* Keyed by turn so the narration slab re-stamps on every flip;
          hidden once the game is decided — the victory banner takes over. */}
      {!gameOver && (
        <div
          key={currentTurn}
          className={yourTurn ? "turn-indicator your-turn" : "turn-indicator"}
          role="status"
        >
          {yourTurn ? "Your turn — fire!" : "Opponent’s turn…"}
        </div>
      )}

      <ErrorBanner />

      {/* Comic-page grid: each board column carries its own HUD above the
          panel and its dossier card below; the battle log sits centered
          between the two cards. */}
      <div className="battle-layout">
        <div className="battle-hud battle-hud-enemy">
          <ScoreHud
            quiet
            label="Enemy score"
            points={enemyLastScored?.total ?? 0}
            streak={enemyLastScored?.streak ?? 0}
            multiplier={enemyLastScored?.multiplier ?? 1}
          />
          {enemyCalledShot && (
            <span className="enemy-called" role="status">
              Called their shot!
            </span>
          )}
        </div>

        <div className="battle-hud battle-hud-you">
          <ScoreHud
            points={lastScored?.total ?? 0}
            streak={lastScored?.streak ?? 0}
            multiplier={lastScored?.multiplier ?? 1}
          />
          <button
            type="button"
            className={shotCalled ? "call-shot call-shot--armed" : "call-shot"}
            disabled={!yourTurn || (!shotCalled && callsLeft <= 0)}
            onClick={() => setShotCalled((armed) => !armed)}
          >
            {shotCalled
              ? "Shot called — double or nothing!"
              : callsLeft > 0
                ? `Call your shot (${callsLeft} left)`
                : "No called shots left"}
          </button>
        </div>

        <section className="battle-main">
          <h2>Enemy waters</h2>
          <GameSceneAdapter
            view="targeting"
            yourFleet={you.fleet}
            shots={yourShots}
            canFire={yourTurn}
            onFire={(target) => {
              fire(target, shotCalled);
              setShotCalled(false);
            }}
            onOutgoingResult={() => setScoredCount((count) => count + 1)}
            sunkShips={yourSunkShips}
          />
        </section>

        <section
          className={
            incomingCinematic
              ? "battle-side battle-side--incoming"
              : "battle-side"
          }
        >
          <h2>{incomingCinematic ? "Incoming fire!" : "Your fleet"}</h2>
          <GameSceneAdapter
            view="fleet"
            yourFleet={you.fleet}
            shots={NO_SHOTS}
            incomingShots={shotsAgainstYou}
            onIncomingActiveChange={(active) => {
              setIncomingCinematic(active);
              // Cinematic drained: every incoming shot so far has visibly
              // landed — settle the enemy HUD to the current history.
              if (!active) {
                setEnemyScoredCount(
                  useGameStore.getState().snapshot?.shotsAgainstYou.length ??
                    0,
                );
              }
            }}
            sunkShips={yourSunkShips}
          />
        </section>

        <div className="fleet-status battle-under-enemy">
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

        <div className="fleet-status battle-under-you">
          <h3>Damage report</h3>
          <ul>
            {yourDamage.map(({ ship, hits, length }) => (
              <li key={ship} className={hits === length ? "sunk" : undefined}>
                <span>{SHIP_NAMES[ship]}</span>
                <span
                  className="dmg-cells"
                  aria-label={`${hits} of ${length} cells hit`}
                >
                  {Array.from({ length }, (_, cell) => (
                    <i key={cell} className={cell < hits ? "hit" : undefined} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="battle-log-wrap">
          <h3>Battle log</h3>
          <ShotLog />
        </div>
      </div>

      {/* End-of-game banner in the SUNK! voice: starburst + big Impact
          word, then the button that advances to the post-game screen. */}
      {gameOver && victoryShown && (
        <div
          className={
            youWon
              ? "victory-overlay victory-overlay--won"
              : "victory-overlay victory-overlay--lost"
          }
          role="dialog"
          aria-label={`${winnerName} is victorious`}
        >
          <div className="victory-card">
            <div className="victory-burst" aria-hidden="true" />
            <h2 className="victory-word">
              {winnerName}
              <span className="victory-word-sub">is victorious!</span>
            </h2>
            <button
              type="button"
              className="victory-continue"
              onClick={onShowResults}
            >
              See battle report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
