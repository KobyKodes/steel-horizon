// "How scoring works" overlay for the landing screen. Mirrors the
// LeaderboardOverlay shell (backdrop click / Escape to close) but renders
// static rules. Every number is read from the shared scoring constants so
// the guide can never drift from what the server actually awards.

import { useEffect } from "react";
import {
  ACCURACY_BONUS_PER_PERCENT,
  BASE_HIT_POINTS,
  CALLED_SHOT_PENALTY,
  CHAIN_MASTER_MULTIPLIER,
  COMEBACK_BONUS,
  EXECUTIONER_PERFECT_KILLS,
  FIRST_BLOOD_BONUS,
  FLAWLESS_BONUS,
  MEDAL_LABELS,
  QUICK_DRAW_BONUS,
  QUICK_DRAW_WINDOW_MS,
  RANK_TITLES,
  SHARPSHOOTER_MIN_ACCURACY,
  SHARPSHOOTER_MIN_SHOTS,
  SINK_BONUS_BY_LENGTH,
  VICTORY_BONUS,
} from "@steel-horizon/shared";
import "./scoringGuide.css";

const QUICK_DRAW_SECONDS = QUICK_DRAW_WINDOW_MS / 1000;

const MEDAL_RULES: Record<keyof typeof MEDAL_LABELS, string> = {
  sharpshooter: `${SHARPSHOOTER_MIN_ACCURACY}%+ accuracy over ${SHARPSHOOTER_MIN_SHOTS}+ shots`,
  executioner: `${EXECUTIONER_PERFECT_KILLS} perfect kills in one game`,
  untouchable: "win flawless — lose no ships",
  "first-strike": "land the first hit of the match",
  "chain-master": `reach a ×${CHAIN_MASTER_MULTIPLIER} multiplier`,
};

export default function ScoringGuideOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="sg-overlay" onClick={onClose}>
      <div
        className="sg-card"
        role="dialog"
        aria-label="How scoring works"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="sg-close"
          aria-label="Close scoring guide"
          onClick={onClose}
        >
          &times;
        </button>

        <h2 className="sg-title">How scoring works</h2>

        <section className="sg-section">
          <h3>Hits &amp; streaks</h3>
          <p>
            Every hit pays <strong>{BASE_HIT_POINTS} points</strong> times your
            chain multiplier. Consecutive hits build a streak: ×2 at 3 hits,
            ×3 at 5, then +1 for every hit after that — uncapped. A miss
            resets the chain to ×1.
          </p>
        </section>

        <section className="sg-section">
          <h3>Sinking ships</h3>
          <p>
            Sinking pays a bonus by ship size, multiplied by your chain:
          </p>
          <table className="sg-table">
            <thead>
              <tr>
                <th>Ship length</th>
                <th>Sink bonus</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(SINK_BONUS_BY_LENGTH).map(([length, bonus]) => (
                <tr key={length}>
                  <td>{length} cells</td>
                  <td>{bonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            A <strong>perfect kill</strong> — every shot of the takedown lands
            on the same ship, no strays — doubles the sink bonus.
          </p>
        </section>

        <section className="sg-section">
          <h3>Extra bonuses</h3>
          <ul>
            <li>
              <strong>First blood</strong> — first hit of the match: +
              {FIRST_BLOOD_BONUS}
            </li>
            <li>
              <strong>Quick draw</strong> — fire within {QUICK_DRAW_SECONDS}s
              of your turn starting: +{QUICK_DRAW_BONUS}
            </li>
            <li>
              <strong>Comeback</strong> — sink a ship while trailing: +
              {COMEBACK_BONUS}
            </li>
          </ul>
        </section>

        <section className="sg-section">
          <h3>Call your shot — double or nothing</h3>
          <p>
            Arm the call-shot button before firing. Land it and the{" "}
            <strong>entire shot pays double</strong> — base, sink bonus,
            everything. Miss and you lose {CALLED_SHOT_PENALTY} points on top
            of your broken chain.
          </p>
        </section>

        <section className="sg-section">
          <h3>End of game</h3>
          <ul>
            <li>
              <strong>Victory</strong>: +{VICTORY_BONUS}
            </li>
            <li>
              <strong>Accuracy</strong>: +{ACCURACY_BONUS_PER_PERCENT} per
              percent (100% pays {ACCURACY_BONUS_PER_PERCENT * 100})
            </li>
            <li>
              <strong>Flawless</strong> — win without losing a single ship: +
              {FLAWLESS_BONUS}
            </li>
          </ul>
        </section>

        <section className="sg-section">
          <h3>Medals</h3>
          <ul>
            {(
              Object.keys(MEDAL_LABELS) as (keyof typeof MEDAL_LABELS)[]
            ).map((medal) => (
              <li key={medal}>
                <strong>{MEDAL_LABELS[medal]}</strong> — {MEDAL_RULES[medal]}
              </li>
            ))}
          </ul>
        </section>

        <section className="sg-section">
          <h3>Ranks</h3>
          <p>Your final score earns a rank title:</p>
          <table className="sg-table">
            <thead>
              <tr>
                <th>Score</th>
                <th>Rank</th>
              </tr>
            </thead>
            <tbody>
              {RANK_TITLES.map(({ minScore, title }) => (
                <tr key={title}>
                  <td>{minScore.toLocaleString()}+</td>
                  <td>{title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
