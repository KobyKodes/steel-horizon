// Board and coordinate primitives. Internal indices are 0-based;
// classic Battleship notation (columns A–J, rows 1–10) is display-only.

export const GRID_SIZE = 10;

/** 0-based grid position: col 0 → "A", row 0 → "1". */
export interface Coordinate {
  col: number;
  row: number;
}

export type Orientation = "horizontal" | "vertical";

/** True when the coordinate lies on the 10x10 grid. */
export function inBounds(coord: Coordinate): boolean {
  return (
    Number.isInteger(coord.col) &&
    Number.isInteger(coord.row) &&
    coord.col >= 0 &&
    coord.col < GRID_SIZE &&
    coord.row >= 0 &&
    coord.row < GRID_SIZE
  );
}

/** {col: 1, row: 6} → "B7". Throws on out-of-bounds input. */
export function coordToLabel(coord: Coordinate): string {
  if (!inBounds(coord)) {
    throw new RangeError(
      `Coordinate out of bounds: col=${coord.col}, row=${coord.row}`,
    );
  }
  const colLetter = String.fromCharCode("A".charCodeAt(0) + coord.col);
  return `${colLetter}${coord.row + 1}`;
}

/**
 * "B7" → {col: 1, row: 6}. Case-insensitive.
 * Returns null for anything that is not a valid on-board label
 * (e.g. "K3", "A11", "A0", "7B", "").
 */
export function labelToCoord(label: string): Coordinate | null {
  const match = /^([A-Ja-j])([1-9]|10)$/.exec(label);
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  const col = match[1].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  const row = Number(match[2]) - 1;
  return { col, row };
}

export function coordsEqual(a: Coordinate, b: Coordinate): boolean {
  return a.col === b.col && a.row === b.row;
}
