// Battle-screen arcade score HUD: a rolling odometer for points and the
// CHAIN plate for the streak multiplier. The plate is the signature piece:
// it climbs the game's own damage-color ramp (hit-yellow x2, tracer-orange
// x4, kill-red x8), kicks a screen-edge glow at x4+, and visibly shatters
// when a miss breaks the chain. Purely presentational — every number comes
// from server-authoritative ScoreEvents; the parent feeds values that only
// advance when a shot's cinematic has actually resolved on screen.

import { useEffect, useRef, useState } from "react";
import { chainBreak } from "../audio/arcadeSfx";
import "./scoreHud.css";

const DIGITS = "0123456789";
const MIN_DIGIT_COLUMNS = 5;
const SHATTER_LIFETIME_MS = 900;

/**
 * Color tier for a chain multiplier — the damage ramp. The ladder is x2 at
 * a 3-streak, x3 at 5, then +1 per hit (uncapped), so styling keys off
 * heat bands rather than exact values: yellow warm-up, orange overheat,
 * kill-red from x7 up. Shared by the chain plate and the score popup.
 */
export function chainHeat(multiplier: number): "cold" | "warm" | "hot" | "critical" {
  if (multiplier >= 7) return "critical";
  if (multiplier >= 4) return "hot";
  if (multiplier >= 2) return "warm";
  return "cold";
}

/** Odometer: one vertical 0–9 strip per digit, rolled by translateY. */
function Odometer({ value }: { value: number }) {
  const text = String(Math.max(0, value)).padStart(MIN_DIGIT_COLUMNS, "0");
  return (
    <span className="score-hud-odometer" aria-hidden="true">
      {text.split("").map((digit, i) => (
        // Keyed from the right so columns keep identity if the number
        // ever outgrows the pad width.
        <span className="score-hud-digit" key={text.length - i}>
          <span
            className="score-hud-digit-strip"
            style={{ transform: `translateY(-${Number(digit)}em)` }}
          >
            {DIGITS.split("").map((d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

export interface ScoreHudProps {
  points: number;
  streak: number;
  multiplier: number;
  /** Score-box label; defaults to "Score". */
  label?: string;
  /**
   * Quiet mode for the opponent's mirror HUD: no screen-edge glow and no
   * chain-break sfx — those cues belong to the player's own chain only.
   */
  quiet?: boolean;
}

export default function ScoreHud({
  points,
  streak,
  multiplier,
  label = "Score",
  quiet = false,
}: ScoreHudProps) {
  // Pulse the plate when the multiplier climbs; shatter a ghost of it when
  // a miss knocks the chain back down.
  const previousMultiplier = useRef(multiplier);
  const [bumpKey, setBumpKey] = useState(0);
  const [shatter, setShatter] = useState<{ mult: number; key: number } | null>(
    null,
  );

  useEffect(() => {
    const previous = previousMultiplier.current;
    previousMultiplier.current = multiplier;
    if (multiplier > previous) {
      setBumpKey(performance.now());
    } else if (multiplier < previous && previous > 1) {
      setShatter({ mult: previous, key: performance.now() });
      if (!quiet) chainBreak();
    }
  }, [multiplier, quiet]);

  useEffect(() => {
    if (!shatter) return;
    const timer = setTimeout(() => setShatter(null), SHATTER_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [shatter]);

  // Pips show progress toward the next rung: 3 hits to light x2, 2 more to
  // reach x3 — after that every hit climbs the chain, so they burn full.
  const pipSlots = streak < 3 ? 3 : streak < 5 ? 2 : 3;
  const pipsFilled = streak < 3 ? streak : streak < 5 ? streak - 3 : pipSlots;
  const heat = chainHeat(multiplier);

  return (
    <div className="score-hud">
      <div
        className="score-hud-score"
        role="status"
        aria-label={`${label} ${points}`}
      >
        <span className="score-hud-label">{label}</span>
        <Odometer value={points} />
      </div>

      <div className="score-hud-chain-slot">
        <div
          key={bumpKey}
          className={`score-hud-chain score-hud-chain--${heat}`}
          role="status"
          aria-label={`Chain multiplier ${multiplier}${streak > 0 ? `, ${streak} hits in a row` : ""}`}
        >
          <span className="score-hud-chain-mult">×{multiplier}</span>
          <span className="score-hud-chain-word">chain</span>
          <span className="score-hud-pips" aria-hidden="true">
            {Array.from({ length: pipSlots }, (_, slot) => slot).map((slot) => (
              <span
                key={slot}
                className={
                  slot < pipsFilled
                    ? "score-hud-pip score-hud-pip--lit"
                    : "score-hud-pip"
                }
              />
            ))}
          </span>
        </div>
        {shatter && (
          <div
            key={shatter.key}
            className={`score-hud-chain score-hud-chain--${chainHeat(shatter.mult)} score-hud-chain-shatter`}
            aria-hidden="true"
          >
            <span className="score-hud-chain-mult">×{shatter.mult}</span>
            <span className="score-hud-chain-word">chain</span>
          </div>
        )}
      </div>

      {!quiet && (heat === "hot" || heat === "critical") && (
        <div
          className={`score-hud-glow score-hud-glow--${heat}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
