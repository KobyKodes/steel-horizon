import { GRID_SIZE, type Coordinate } from "@steel-horizon/shared";

// Shared grid-to-world coordinate mapping. This is the ONE positioning
// system every 3D component that places game content by grid coordinate
// must use — HoloGrid's cells, FleetShips' placements, and future
// placement-phase (04-07) previews. Nothing should re-derive an
// independent approximation of this math.

/** World-unit spacing between cell centers. */
export const CELL_SIZE = 4;

const HALF = (GRID_SIZE - 1) / 2;

/**
 * Maps a grid Coordinate to a world-plane [x, z] position, anchored so the
 * grid is centered on the world origin (cell (0,0) sits at a fixed corner,
 * `HALF` cells out from center in both axes).
 */
export function cellToWorld(
  coord: Coordinate,
  cellSize: number = CELL_SIZE,
): [x: number, z: number] {
  const x = (coord.col - HALF) * cellSize;
  const z = (coord.row - HALF) * cellSize;
  return [x, z];
}
