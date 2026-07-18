// Arcade score popup — the points a shot just earned, launched over the
// scene at impact alongside the ResultCallout. Same comic ink language as
// the callout (Impact italic, thick stroke, misregistered print) but a
// deliberately DIFFERENT motion identity: callouts pop and shudder in
// place; score digits LAUNCH and tumble upward like ejected shell casings,
// with bonus tags slamming in underneath. Outgoing shots only — these are
// YOUR points.

import { useEffect } from "react";
import type { ScoreBonusKind, ScoreEvent } from "@steel-horizon/shared";
import { chainHeat } from "../../components/ScoreHud";
import "./scorePopup.css";

/** Total on-screen lifetime — launch + tumble-drift out (mirrors the CSS). */
const POPUP_LIFETIME_MS = 2000;

const BONUS_LABELS: Record<ScoreBonusKind, string> = {
  "first-blood": "FIRST BLOOD!",
  sink: "SINK BONUS",
  "perfect-kill": "PERFECT KILL!",
};

export interface ScorePopupProps {
  score: ScoreEvent;
  /** Called once the popup has fully played out — clear it from state. */
  onDone: () => void;
}

export function ScorePopup({ score, onDone }: ScorePopupProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, POPUP_LIFETIME_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (score.points <= 0) return null;

  return (
    <div
      className={`score-popup score-popup--${chainHeat(score.multiplier)}`}
      aria-live="polite"
    >
      <div className="score-popup-points">
        +{score.points.toLocaleString()}
        {score.multiplier > 1 && (
          <span className="score-popup-mult">×{score.multiplier}</span>
        )}
      </div>
      {score.bonuses.map((award, i) => (
        <div
          key={award.bonus}
          className={`score-popup-bonus score-popup-bonus--${award.bonus}`}
          style={{ animationDelay: `${0.3 + i * 0.16}s` }}
        >
          {BONUS_LABELS[award.bonus]}
        </div>
      ))}
    </div>
  );
}
