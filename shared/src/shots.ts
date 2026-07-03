// Shot resolution and win detection — the server-authoritative core of the
// game. Pure functions over a defender's fleet and shot history; the server
// composes game state around these in Phase 2 and never trusts the client.
//
// Contract: `previousShots` is the history BEFORE the shot being resolved.
// The caller appends `target` to the history after a successful resolution.

import { coordsEqual, inBounds, type Coordinate } from "./board.js";
import {
  cellsForPlacement,
  type FleetPlacement,
  type ShipClassId,
} from "./fleet.js";
import type { ErrorCode } from "./protocol.js";

/**
 * Result of resolving a single shot. Named ShotResolution (not ShotOutcome)
 * because protocol.ts already exports ShotOutcome as the wire-level
 * "hit" | "miss" | "sunk" union, which `result` reuses.
 */
export type ShotResolution =
  | { ok: true; result: "miss" }
  | { ok: true; result: "hit"; ship: ShipClassId }
  | { ok: true; result: "sunk"; ship: ShipClassId }
  | { ok: false; error: Extract<ErrorCode, "OUT_OF_BOUNDS" | "CELL_ALREADY_SHOT"> };

/**
 * Resolve a shot at `target` against a defender's fleet, given every shot
 * already taken against that fleet. Assumes `fleet` is valid (placement
 * validation happens at fleet-placement time, not here).
 */
export function resolveShot(
  fleet: FleetPlacement,
  previousShots: Coordinate[],
  target: Coordinate,
): ShotResolution {
  if (!inBounds(target)) {
    return { ok: false, error: "OUT_OF_BOUNDS" };
  }
  if (previousShots.some((shot) => coordsEqual(shot, target))) {
    return { ok: false, error: "CELL_ALREADY_SHOT" };
  }

  for (const placement of fleet) {
    const cells = cellsForPlacement(placement);
    if (!cells.some((cell) => coordsEqual(cell, target))) continue;

    const sunk = cells.every(
      (cell) =>
        coordsEqual(cell, target) ||
        previousShots.some((shot) => coordsEqual(shot, cell)),
    );
    if (sunk) {
      return { ok: true, result: "sunk", ship: placement.ship };
    }
    return { ok: true, result: "hit", ship: placement.ship };
  }

  return { ok: true, result: "miss" };
}

function cellKey(coord: Coordinate): string {
  return `${coord.col},${coord.row}`;
}

/**
 * True when every cell of every ship in the fleet appears in `shots`
 * (all 17 cells of a legal fleet). Duplicate shots and misses are ignored.
 */
export function isFleetDestroyed(
  fleet: FleetPlacement,
  shots: Coordinate[],
): boolean {
  const shotCells = new Set(shots.map(cellKey));
  return fleet.every((placement) =>
    cellsForPlacement(placement).every((cell) => shotCells.has(cellKey(cell))),
  );
}
