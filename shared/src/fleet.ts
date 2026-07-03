// Fleet composition and placement geometry. A legal fleet contains
// exactly one of each ship class in FLEET.

import type { Coordinate, Orientation } from "./board.js";

export type ShipClassId =
  | "carrier"
  | "battleship"
  | "cruiser"
  | "submarine"
  | "destroyer";

export const SHIP_LENGTHS: Record<ShipClassId, number> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
} as const;

/** Canonical fleet: each ship class exactly once. */
export const FLEET: readonly ShipClassId[] = [
  "carrier",
  "battleship",
  "cruiser",
  "submarine",
  "destroyer",
] as const;

export interface ShipPlacement {
  ship: ShipClassId;
  origin: Coordinate;
  orientation: Orientation;
}

export type FleetPlacement = ShipPlacement[];

/**
 * Expand a placement into the cells it occupies.
 * Horizontal grows col from origin; vertical grows row.
 */
export function cellsForPlacement(placement: ShipPlacement): Coordinate[] {
  const length = SHIP_LENGTHS[placement.ship];
  const cells: Coordinate[] = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      placement.orientation === "horizontal"
        ? { col: placement.origin.col + i, row: placement.origin.row }
        : { col: placement.origin.col, row: placement.origin.row + i },
    );
  }
  return cells;
}

/** Total occupied cells in a legal fleet (win detection: all 17 hit). */
export const TOTAL_SHIP_CELLS: number = FLEET.reduce(
  (sum, ship) => sum + SHIP_LENGTHS[ship],
  0,
);
