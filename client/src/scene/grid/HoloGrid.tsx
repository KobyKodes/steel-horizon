import { useMemo, useRef, useState } from "react";
import { Instance, Instances, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { GRID_SIZE, type Coordinate } from "@steel-horizon/shared";

// Reusable, game-state-agnostic 10x10 holographic grid overlay.
//
// Rendered with drei <Instances> so all 100 cells cost a single draw call
// (per 04-RESEARCH.md "Don't Hand-Roll") — never 100 individual <mesh>
// elements. Hover/click use R3F's built-in per-instance pointer events
// (drei routes raycasts to each <Instance>), no manual THREE.Raycaster.
//
// The grid knows nothing about fleets, shots, or turns; it only reports
// Coordinate values via callbacks. Later plans (04-05 targeting, 04-06
// placement) wire it to game data.

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

// Holographic cell states, consistent with Ocean.tsx's teal/cyan palette.
// Additive blending makes the dim base color read as a faint projected
// light plane; the hover state is the same hue pushed to a bright glow,
// and the selected state is a warm amber "target lock" — the one contrast
// note against the all-teal scene so a locked cell is unmistakable.
const COLOR_CELL = new THREE.Color("#2fa3bd");
const COLOR_HOVERED = new THREE.Color("#c9f6ff");
const COLOR_SELECTED = new THREE.Color("#ffb45e");

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

const cellKey = (cell: GridCell) => cell.row * GRID_SIZE + cell.col;

export interface HoloGridProps {
  /** Fires with the hovered cell, or null when the pointer leaves the grid. */
  onHoverCell?: (coord: Coordinate | null) => void;
  /** Fires when a cell is clicked; the selection persists until another click. */
  onSelectCell?: (coord: Coordinate) => void;
}

export function HoloGrid({ onHoverCell, onSelectCell }: HoloGridProps) {
  const cells = useMemo(buildCells, []);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  useCursor(hovered !== null);

  // Pointer-out for cell A can arrive AFTER pointer-over for adjacent cell
  // B; the ref lets the out handler skip clearing a hover it no longer
  // owns without depending on stale closure state.
  const hoveredRef = useRef<number | null>(null);
  const applyHover = (key: number | null, coord: Coordinate | null) => {
    hoveredRef.current = key;
    setHovered(key);
    onHoverCell?.(coord);
  };

  return (
    <group position={[0, GRID_ALTITUDE, 0]} rotation-x={-Math.PI / 2}>
      {/*
        renderOrder=1: the grid hovers above the near-opaque (alpha 0.95)
        Ocean plane, but three's transparent sort can draw the ocean AFTER
        the grid, multiplying the hologram's additive glow by (1 - 0.95)
        and washing all cell states out to ~nothing. Drawing the grid after
        the water is always correct here since it physically floats above.
      */}
      <Instances limit={GRID_SIZE * GRID_SIZE} renderOrder={1}>
        <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
        <meshBasicMaterial
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
        {cells.map((cell) => {
          const key = cellKey(cell);
          const color =
            key === selected
              ? COLOR_SELECTED
              : key === hovered
                ? COLOR_HOVERED
                : COLOR_CELL;
          return (
            <Instance
              key={key}
              position={[cell.x, cell.y, 0]}
              color={color}
              onPointerOver={(event) => {
                event.stopPropagation();
                applyHover(key, { col: cell.col, row: cell.row });
              }}
              onPointerOut={() => {
                if (hoveredRef.current === key) applyHover(null, null);
              }}
              onClick={(event) => {
                event.stopPropagation();
                setSelected(key);
                onSelectCell?.({ col: cell.col, row: cell.row });
              }}
            />
          );
        })}
      </Instances>
    </group>
  );
}
