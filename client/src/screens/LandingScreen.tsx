// Landing screen — shown whenever there is no room snapshot.
// Name entry plus three entry paths: create private game, join with code,
// quick match. Reads ?code= from the URL to prefill the join input.

import { useEffect, useRef, useState } from "react";
import type { ErrorCode } from "@steel-horizon/shared";
import { getStoredName } from "../socket";
import { useGameStore } from "../store";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: "No game found with that code. Check it and try again.",
  ROOM_FULL: "That game already has two players.",
  INVALID_NAME: "Please enter a valid name.",
  ALREADY_JOINED: "You are already in a game.",
};

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
    </div>
  );
}
