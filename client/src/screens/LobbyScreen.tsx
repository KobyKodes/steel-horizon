// Lobby — both players, ready indicators, ready toggle, shareable link.
// Renders purely from the snapshot; the server moves the room to placement
// when both players are ready (the phase router follows automatically).

import { useState } from "react";
import type { RoomSnapshot } from "@steel-horizon/shared";
import { useGameStore } from "../store";

export default function LobbyScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  const setReady = useGameStore((s) => s.setReady);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${location.origin}/?code=${snapshot.code}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/http) — the input is selectable.
    }
  }

  return (
    <div className="screen lobby">
      <h1>Lobby</h1>
      <p className="tagline">
        Room code: <strong>{snapshot.code}</strong>
      </p>

      <div className="share-link">
        <input type="text" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copyLink}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="player-list">
        <div className="player-row">
          <span>{snapshot.you.name} (you)</span>
          <span className={`ready-tag${snapshot.you.ready ? " is-ready" : ""}`}>
            {snapshot.you.ready ? "Ready" : "Not ready"}
          </span>
        </div>
        {snapshot.opponent ? (
          <div className="player-row">
            <span>{snapshot.opponent.name}</span>
            <span
              className={`ready-tag${snapshot.opponent.ready ? " is-ready" : ""}`}
            >
              {snapshot.opponent.ready ? "Ready" : "Not ready"}
            </span>
          </div>
        ) : (
          <p className="waiting">Waiting for an opponent to join&hellip;</p>
        )}
      </div>

      <button type="button" onClick={() => setReady(!snapshot.you.ready)}>
        {snapshot.you.ready ? "Unready" : "Ready up"}
      </button>
    </div>
  );
}
