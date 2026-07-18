// Comic-book shot-result callout (05-04 follow-up, USER request): a big
// arcade-style "HIT!" / "SUNK!" / "MISS!" word that pops over the scene at
// impact, holds for a beat, then clears itself. Pure DOM/CSS overlay above
// the R3F canvas — it's HUD-layer language (like the holographic grid), so
// it deliberately does NOT live inside the 3D world.
//
// The outcome drives everything: SUNK is the kill and gets the loudest
// treatment (starburst + biggest pop), HIT pops sharp in the same warning
// yellow as the grid's hit cells, MISS deflates and sinks — the callout
// speaks the exact same damage language as the cell markers.

import { useEffect } from "react";
import type { ShotOutcome } from "@steel-horizon/shared";
import "./resultCallout.css";

/** Total on-screen lifetime — pop + hold + exit (mirrors the CSS timings). */
const CALLOUT_LIFETIME_MS = 2200;

const WORDS: Record<ShotOutcome, string> = {
  hit: "HIT!",
  sunk: "SUNK!",
  miss: "MISS!",
};

export interface ResultCalloutProps {
  result: ShotOutcome;
  /** Called once the callout has fully played out — clear it from state. */
  onDone: () => void;
}

export function ResultCallout({ result, onDone }: ResultCalloutProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, CALLOUT_LIFETIME_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`result-callout result-callout--${result}`} aria-live="polite">
      {result === "sunk" && <div className="result-callout-burst" />}
      <span className="result-callout-word">{WORDS[result]}</span>
    </div>
  );
}
