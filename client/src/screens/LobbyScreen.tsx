// Lobby — both players, ready indicators, ready toggle, shareable link.
// Renders purely from the snapshot; the server moves the room to placement
// when both players are ready (the phase router follows automatically).
// Styled as the comic fight card: two player plates squared off around a
// starburst VS badge, room code as the ticket stub.

import { useState } from "react";
import type { RoomSnapshot } from "@steel-horizon/shared";
import { useGameStore } from "../store";
import "./lobby.css";

function PlayerCard({
  name,
  you,
  ready,
}: {
  name: string;
  you?: boolean;
  ready: boolean;
}) {
  return (
    <div className="lobby-card">
      {you && <span className="lobby-card-you">You</span>}
      <span className="lobby-card-name">{name}</span>
      <span
        className={ready ? "lobby-ready lobby-ready--yes" : "lobby-ready"}
      >
        {ready ? "Ready!" : "Not ready"}
      </span>
    </div>
  );
}

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
      <div className="lobby-masthead">
        <h1>Lobby</h1>
        <p className="lobby-code">
          Room code <strong>{snapshot.code}</strong>
        </p>
      </div>

      <div className="share-link">
        <input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" onClick={copyLink}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="lobby-matchup">
        <PlayerCard name={snapshot.you.name} you ready={snapshot.you.ready} />
        <div className="lobby-vs" aria-hidden="true">
          VS
        </div>
        {snapshot.opponent ? (
          <PlayerCard
            name={snapshot.opponent.name}
            ready={snapshot.opponent.ready}
          />
        ) : (
          <div className="lobby-card lobby-card--empty">
            <span className="lobby-card-mystery" aria-hidden="true">
              ?
            </span>
            <span className="waiting">Waiting for a challenger&hellip;</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className={
          snapshot.you.ready
            ? "lobby-ready-button lobby-ready-button--armed"
            : "lobby-ready-button"
        }
        onClick={() => setReady(!snapshot.you.ready)}
      >
        {snapshot.you.ready ? "Unready" : "Ready up"}
      </button>
    </div>
  );
}
