// Landing screen — shown whenever there is no room snapshot.
// Name entry plus three entry paths: create private game, join with code,
// quick match. Reads ?code= from the URL to prefill the join input.

import { useEffect, useRef, useState } from "react";
import type { ErrorCode, HighScoreEntry } from "@steel-horizon/shared";
import { getStoredName } from "../socket";
import { useGameStore } from "../store";
import LeaderboardPanel from "../components/LeaderboardPanel";
import "../components/leaderboardOverlay.css";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: "No game found with that code. Check it and try again.",
  ROOM_FULL: "That game already has two players.",
  INVALID_NAME: "Please enter a valid name.",
  ALREADY_JOINED: "You are already in a game.",
};

interface LeaderboardData {
  allTime: HighScoreEntry[];
  weekly: HighScoreEntry[];
}

/**
 * "View leaderboards" overlay — same tabbed board as the PostGame screen,
 * fed by the public GET /leaderboard endpoint (no room required).
 * Fetches on every open so the boards are always current.
 */
function LeaderboardOverlay({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/leaderboard")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<LeaderboardData>;
      })
      .then((boards) => {
        if (!cancelled) setData(boards);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div
        className="lb-overlay-card"
        role="dialog"
        aria-label="Leaderboards"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="lb-overlay-close"
          aria-label="Close leaderboards"
          onClick={onClose}
        >
          &times;
        </button>
        {failed && (
          <div className="lb-overlay-status">
            Couldn&rsquo;t load the leaderboards. Close this and try again.
          </div>
        )}
        {!failed && data === null && (
          <div className="lb-overlay-status">Loading&hellip;</div>
        )}
        {data !== null && (
          <LeaderboardPanel allTime={data.allTime} weekly={data.weekly} />
        )}
      </div>
    </div>
  );
}

function filterCode(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export default function LandingScreen() {
  const connection = useGameStore((s) => s.connection);
  const lastError = useGameStore((s) => s.lastError);
  const clearError = useGameStore((s) => s.clearError);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const quickMatch = useGameStore((s) => s.quickMatch);

  const [name, setName] = useState(getStoredName);
  const [code, setCode] = useState(() =>
    filterCode(new URLSearchParams(location.search).get("code") ?? ""),
  );
  const [waitingForMatch, setWaitingForMatch] = useState(false);
  const [showLeaderboards, setShowLeaderboards] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Shareable-link prefill: focus the join-code input when ?code= is present.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("code")) {
      codeInputRef.current?.focus();
    }
  }, []);

  const trimmedName = name.trim();
  const busy = connection === "connecting";
  const canAct = trimmedName.length > 0 && !busy;

  function withFreshError(action: () => void) {
    clearError();
    setWaitingForMatch(false);
    action();
  }

  const errorText = lastError
    ? (ERROR_MESSAGES[lastError.code] ?? lastError.message)
    : null;

  return (
    <div className="screen landing">
      <h1>Steel Horizon</h1>
      <p className="tagline">Naval battle for two players</p>

      {errorText && (
        <div className="banner error" role="alert">
          <span>{errorText}</span>
          <button type="button" className="banner-dismiss" onClick={clearError}>
            &times;
          </button>
        </div>
      )}

      <label className="field">
        <span>Your name</span>
        <input
          type="text"
          value={name}
          maxLength={24}
          placeholder="Enter your name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="actions">
        <button
          type="button"
          disabled={!canAct}
          onClick={() => withFreshError(() => createRoom(trimmedName))}
        >
          Create private game
        </button>

        <div className="join-row">
          <input
            ref={codeInputRef}
            type="text"
            className="code-input"
            value={code}
            placeholder="CODE"
            onChange={(e) => setCode(filterCode(e.target.value))}
          />
          <button
            type="button"
            disabled={!canAct || code.length !== ROOM_CODE_LENGTH}
            onClick={() => withFreshError(() => joinRoom(trimmedName, code))}
          >
            Join with code
          </button>
        </div>

        <button
          type="button"
          disabled={!canAct || waitingForMatch}
          onClick={() =>
            withFreshError(() => {
              quickMatch(trimmedName);
              setWaitingForMatch(true);
            })
          }
        >
          Quick match
        </button>
      </div>

      {waitingForMatch && !lastError && (
        <p className="waiting">Waiting for an opponent&hellip;</p>
      )}

      <button
        type="button"
        className="lb-open"
        onClick={() => setShowLeaderboards(true)}
      >
        View leaderboards
      </button>

      {showLeaderboards && (
        <LeaderboardOverlay onClose={() => setShowLeaderboards(false)} />
      )}
    </div>
  );
}
