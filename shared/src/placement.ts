// Fleet placement legality and random fleet generation. This is the
// server's anti-cheat gate for the placement phase and the client's
// drag-to-place / randomize / auto-place engine.

import { GRID_SIZE, inBounds, type Coordinate, type Orientation } from "./board.js";
import {
  FLEET,
  SHIP_LENGTHS,
  cellsForPlacement,
  type FleetPlacement,
  type ShipClassId,
  type ShipPlacement,
} from "./fleet.js";

export type PlacementValidation =
  | { valid: true }
  | { valid: false; reason: "WRONG_FLEET_COMPOSITION" | "OUT_OF_BOUNDS" | "OVERLAP" };

function cellKey(cell: Coordinate): string {
  return `${cell.col},${cell.row}`;
}

/**
 * Check a fleet against classic Battleship legality: exactly one of each
 * ship class in FLEET, every cell on the board, no two ships sharing a
 * cell. Touching (adjacent cells) is allowed. Checks run in order —
 * composition, then bounds, then overlap — returning the first failure.
 */
export function validateFleetPlacement(
  fleet: FleetPlacement,
): PlacementValidation {
  // Composition: exactly the canonical fleet, each class once.
  if (fleet.length !== FLEET.length) {
    return { valid: false, reason: "WRONG_FLEET_COMPOSITION" };
  }
  const seen = new Set<ShipClassId>(fleet.map((p) => p.ship));
  if (seen.size !== FLEET.length || !FLEET.every((ship) => seen.has(ship))) {
    return { valid: false, reason: "WRONG_FLEET_COMPOSITION" };
  }

  // Bounds: every cell of every ship on the 10x10 grid.
  for (const placement of fleet) {
    if (!cellsForPlacement(placement).every(inBounds)) {
      return { valid: false, reason: "OUT_OF_BOUNDS" };
    }
  }

  // Overlap: no cell occupied twice.
  const occupied = new Set<string>();
  for (const placement of fleet) {
    for (const cell of cellsForPlacement(placement)) {
      const key = cellKey(cell);
      if (occupied.has(key)) {
        return { valid: false, reason: "OVERLAP" };
      }
      occupied.add(key);
    }
  }

  return { valid: true };
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Generate a uniformly-random-ish legal fleet via rejection sampling:
 * place ships longest-first, retrying random origin+orientation until the
 * ship fits in bounds on unoccupied cells. With touching allowed, the
 * classic fleet cannot deadlock on a 10x10 board, so no backtracking is
 * needed. Every returned fleet passes validateFleetPlacement.
 */
export function generateRandomFleet(): FleetPlacement {
  const byLengthDesc = [...FLEET].sort(
    (a, b) => SHIP_LENGTHS[b] - SHIP_LENGTHS[a],
  );

  const occupied = new Set<string>();
  const fleet: FleetPlacement = [];

  for (const ship of byLengthDesc) {
    for (;;) {
      const orientation: Orientation =
        randomInt(2) === 0 ? "horizontal" : "vertical";
      const candidate: ShipPlacement = {
        ship,
        origin: { col: randomInt(GRID_SIZE), row: randomInt(GRID_SIZE) },
        orientation,
      };
      const cells = cellsForPlacement(candidate);
      if (
        cells.every(inBounds) &&
        cells.every((cell) => !occupied.has(cellKey(cell)))
      ) {
        for (const cell of cells) occupied.add(cellKey(cell));
        fleet.push(candidate);
        break;
      }
    }
  }

  return fleet;
}
