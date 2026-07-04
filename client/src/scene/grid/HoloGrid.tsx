import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import * as THREE from "three";
import { GRID_SIZE } from "@steel-horizon/shared";

// Reusable, game-state-agnostic 10x10 holographic grid overlay.
//
// Rendered with drei <Instances> so all 100 cells cost a single draw call
// (per 04-RESEARCH.md "Don't Hand-Roll") — never 100 individual <mesh>
// elements. The grid knows nothing about fleets, shots, or turns; later
// plans (04-05 targeting, 04-06 placement) wire it to game data.

/** World-unit spacing between cell centers. */
export const CELL_PITCH = 4;
/** Rendered quad size per cell; the gap to CELL_PITCH forms the grid lines. */
const CELL_SIZE = 3.4;
/**
 * Height of the grid plane above the ocean's rest height. Must clear the
 * summed Gerstner crest amplitude (~1.05 world units for waves.ts's WAVES)
 * so crests never poke through the hologram.
 */
export const GRID_ALTITUDE = 1.8;

// Holographic cell glow, consistent with Ocean.tsx's teal/cyan palette.
// Additive blending makes the dim base color read as a faint projected
// light plane over the water rather than solid geometry.
const COLOR_CELL = new THREE.Color("#1d7a90");

interface GridCell {
  col: number;
  row: number;
  /** Local x within the (rotated-flat) grid plane. */
  x: number;
  /** Local y within the grid plane; maps to world -z after rotation. */
  y: number;
}

function buildCells(): GridCell[] {
  const half = (GRID_SIZE - 1) / 2;
  const cells: GridCell[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      cells.push({
        col,
        row,
        x: (col - half) * CELL_PITCH,
        // Group is rotated -PI/2 about X, so local +y maps to world -z.
        // Row 0 lands at world -z (far side from the default camera).
        y: -(row - half) * CELL_PITCH,
      });
    }
  }
  return cells;
}

export function HoloGrid() {
  const cells = useMemo(buildCells, []);

  return (
    <group position={[0, GRID_ALTITUDE, 0]} rotation-x={-Math.PI / 2}>
      <Instances limit={GRID_SIZE * GRID_SIZE}>
        <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
        <meshBasicMaterial
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
        {cells.map((cell) => (
          <Instance
            key={`${cell.col}-${cell.row}`}
            position={[cell.x, cell.y, 0]}
            color={COLOR_CELL}
          />
        ))}
      </Instances>
    </group>
  );
}
