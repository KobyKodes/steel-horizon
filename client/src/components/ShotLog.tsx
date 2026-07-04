// ShotLog — chronological battle feed rendered from the store's shotFeed.
//
// The feed is transient client state (seeded by shotResult events); after a
// refresh it starts empty. When that happens mid-game we rebuild a per-side
// summary from the snapshot's yourShots/shotsAgainstYou — the interleaving
// is lost, but every shot is still accounted for.

import { useEffect, useRef } from "react";
import { coordToLabel, type ShipClassId } from "@steel-horizon/shared";
import { useGameStore, type ShotFeedEntry } from "../store";

const SHIP_NAMES: Record<ShipClassId, string> = {
  carrier: "Carrier",
  battleship: "Battleship",
  cruiser: "Cruiser",
  submarine: "Submarine",
  destroyer: "Destroyer",
};

function entryText(entry: ShotFeedEntry): string {
  const label = coordToLabel(entry.target);
  const result = entry.result === "miss" ? "MISS" : "HIT";
  return `${entry.shooter} fired ${label} — ${result}`;
}

function LogLine({ entry, mine }: { entry: ShotFeedEntry; mine: boolean }) {
  return (
    <li className={entry.result === "miss" ? "log-miss" : "log-hit"}>
      {entryText(entry)}
      {entry.sunkShip && (
        <span className="log-sunk">
          {" "}
          {mine ? "Enemy" : "Your"} {SHIP_NAMES[entry.sunkShip]} sunk!
        </span>
      )}
    </li>
  );
}

export default function ShotLog() {
  const feed = useGameStore((s) => s.shotFeed);
  const snapshot = useGameStore((s) => s.snapshot);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the newest entry visible.
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  if (!snapshot) return null;

  const youName = snapshot.you.name;
  const opponentName = snapshot.opponent?.name ?? "Opponent";

  // Post-refresh: feed reseeded empty but the snapshot has history —
  // rebuild what we can, in per-side order.
  const rebuilt =
    feed.length === 0 &&
    (snapshot.yourShots.length > 0 || snapshot.shotsAgainstYou.length > 0);

  let content;
  if (rebuilt) {
    content = (
      <>
        <p className="log-section">Your shots</p>
        <ul>
          {snapshot.yourShots.map((shot, i) => (
            <LogLine
              key={`y${i}`}
              mine
              entry={{ shooter: youName, ...shot }}
            />
          ))}
        </ul>
        <p className="log-section">{opponentName}&rsquo;s shots</p>
        <ul>
          {snapshot.shotsAgainstYou.map((shot, i) => (
            <LogLine
              key={`o${i}`}
              mine={false}
              entry={{ shooter: opponentName, ...shot }}
            />
          ))}
        </ul>
      </>
    );
  } else if (feed.length === 0) {
    content = <p className="log-empty">No shots fired yet.</p>;
  } else {
    content = (
      <ul>
        {feed.map((entry, i) => (
          <LogLine key={i} entry={entry} mine={entry.shooter === youName} />
        ))}
      </ul>
    );
  }

  return (
    <div className="shot-log" ref={listRef} aria-live="polite">
      {content}
    </div>
  );
}
