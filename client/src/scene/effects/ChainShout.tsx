// Announcer shout for chain heat tier-ups: "DOUBLE UP!" when the chain
// first lights (x2), "RAMPAGE!" going hot (x4), "UNSTOPPABLE!" at critical
// (x7+). Third motion identity in the comic language: callouts pop in
// place, score digits tumble upward — the shout SLAMS THROUGH sideways, a
// banner strafing the top of the scene.

import { useEffect } from "react";
import "./chainShout.css";

const SHOUT_LIFETIME_MS = 1700;

export type ChainShoutTier = "warm" | "hot" | "critical";

const WORDS: Record<ChainShoutTier, string> = {
  warm: "DOUBLE UP!",
  hot: "RAMPAGE!",
  critical: "UNSTOPPABLE!",
};

export interface ChainShoutProps {
  tier: ChainShoutTier;
  /** Called once the shout has fully played out — clear it from state. */
  onDone: () => void;
}

export function ChainShout({ tier, onDone }: ChainShoutProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOUT_LIFETIME_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`chain-shout chain-shout--${tier}`} aria-live="polite">
      <span className="chain-shout-word">{WORDS[tier]}</span>
    </div>
  );
}
