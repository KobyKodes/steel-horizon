// Placement screen — owns the local fleet draft, composes
// PlacementSceneAdapter (the 3D select-then-place board), and submits the
// final FleetPlacement to the authoritative server.
//
// The draft is LOCAL state; the only placement data that reaches the
// store/server is the final `placeFleet` emit. Once the server accepts,
// `snapshot.you.fleet` goes non-null and the board renders locked from the
// snapshot alone (refresh-proof). Readiness in the placement phase IS the
// fleet submission: the server flips the room to battle when both fleets
// land (App's phase router follows) — there is no separate ready toggle
// here (the server's setReady is lobby-only).

import { useMemo, useState } from "react";
import {
  FLEET,
  generateRandomFleet,
  validateFleetPlacement,
  type ErrorCode,
  type FleetPlacement,
  type ShipClassId,
  type ShipPlacement,
} from "@steel-horizon/shared";
import { PlacementSceneAdapter } from "../scene/PlacementSceneAdapter";
import { useGameStore } from "../store";
import "./battle.css";
import "./placement.css";

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  INVALID_PLACEMENT:
    "The server rejected that fleet placement. Adjust your ships and try again.",
};

function toDraft(fleet: FleetPlacement): Map<ShipClassId, ShipPlacement> {
  return new Map(fleet.map((placement) => [placement.ship, placement]));
}

export default function PlacementScreen() {
  const snapshot = useGameStore((s) => s.snapshot);
  const lastError = useGameStore((s) => s.lastError);
  const clearError = useGameStore((s) => s.clearError);
  const placeFleet = useGameStore((s) => s.placeFleet);

  const [draft, setDraft] = useState<Map<ShipClassId, ShipPlacement>>(
    () => new Map(),
  );

  // App routes here only when a placement-phase snapshot exists.
  if (snapshot === null) return null;

  // Server-accepted fleet: lock the board and render it from the snapshot
  // (survives refresh — the draft is gone, the snapshot is not).
  const submitted = snapshot.you.fleet !== null;
  const board = submitted ? toDraft(snapshot.you.fleet!) : draft;

  // Ready gate: all 5 ships placed AND the exact shared validation passes.
  const fleetArray: FleetPlacement = FLEET.flatMap((ship) => {
    const placement = draft.get(ship);
    return placement === undefined ? [] : [placement];
  });
  const canReady =
    !submitted &&
    fleetArray.length === FLEET.length &&
    validateFleetPlacement(fleetArray).valid;

  function submit(): void {
    clearError();
    placeFleet(fleetArray);
  }

  const errorText = lastError
    ? (ERROR_MESSAGES[lastError.code] ?? lastError.message)
    : null;

  return (
    <div className="screen placement">
      <h1>Place your fleet</h1>

      {errorText !== null && (
        <div className="banner error" role="alert">
          <span>{errorText}</span>
          <button type="button" className="banner-dismiss" onClick={clearError}>
            &times;
          </button>
        </div>
      )}

      <PlacementSceneAdapter draft={board} onChange={setDraft} disabled={submitted} />

      {submitted ? (
        <p className="placement-status">
          Fleet locked in. Waiting for opponent&hellip;
        </p>
      ) : (
        <>
          <div className="placement-controls">
            <button
              type="button"
              onClick={() => {
                clearError();
                setDraft(toDraft(generateRandomFleet()));
              }}
            >
              Randomize fleet
            </button>
            <button
              type="button"
              disabled={draft.size === 0}
              onClick={() => setDraft(new Map())}
            >
              Clear
            </button>
            <button
              type="button"
              className="ready-button"
              disabled={!canReady}
              onClick={submit}
            >
              Ready
            </button>
          </div>
          <p className="placement-hint">
            Drag ships from the dock onto the grid · press R while dragging
            to rotate · right-click a placed ship to rotate it
          </p>
          <p className="placement-status">
            {snapshot.opponent !== null
              ? "Opponent is placing ships…"
              : "Waiting for opponent…"}
          </p>
        </>
      )}
    </div>
  );
}
