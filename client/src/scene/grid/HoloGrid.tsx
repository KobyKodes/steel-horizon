import { useMemo, useRef, useState } from "react";
import { Instance, Instances, useCursor } from "@react-three/drei";
import * as THREE from "three";
import { GRID_SIZE, type Coordinate } from "@steel-horizon/shared";
import { cellToWorld, CELL_SIZE as CELL_PITCH } from "./gridCoords";

// Reusable, game-state-agnostic 10x10 holographic grid overlay.
//
// Rendered with drei <Instances> so all 100 cells cost a single draw call
// (per 04-RESEARCH.md "Don't Hand-Roll") — never 100 individual <mesh>
// elements. Hover/click use R3F's built-in per-instance pointer events
// (drei routes raycasts to each <Instance>), no manual THREE.Raycaster.
//
// The grid knows nothing about fleets, shots, or turns beyond rendering
// whatever `cellStates` it's handed; it only reports Coordinate values via
// callbacks for cells with no recorded state. 04-05 (targeting) and 04-06
// (post-game) are the callers that derive `cellStates` from real snapshot
// data — HoloGrid itself never reaches into game state.

/** Rendered quad size per cell; the gap to CELL_PITCH forms the grid lines. */
const CELL_QUAD_SIZE = 3.4;
/** Small marker quad size for recorded shot states, layered above the cell. */
const MARKER_SIZE = 1.4;
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

/** Recorded shot outcome for a cell, keyed `` `${col},${row}` ``. */
export type CellState = "hit" | "miss" | "sunk";

// Shot-marker colors: dim marker for a miss, bright red for a hit, a
// darker red for a sunk ship's cells.
const COLOR_MISS = new THREE.Color("#5c6e85");
const COLOR_HIT = new THREE.Color("#ff4d5e");
const COLOR_SUNK = new THREE.Color("#7a1018");
const MARKER_COLORS: Record<CellState, THREE.Color> = {
  miss: COLOR_MISS,
  hit: COLOR_HIT,
  sunk: COLOR_SUNK,
};

interface GridCell {
  col: number;
  row: number;
  /** Local x within the (rotated-flat) grid plane. */
  x: number;
  /** Local y within the grid plane; maps to world -z after rotation. */
  y: number;
}

/** `` `${col},${row}` `` — matches TargetingBoard.tsx's cellKey convention. */
function cellKey(coord: Coordinate): string {
  return `${coord.col},${coord.row}`;
}

function buildCells(): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      // cellToWorld gives world [x, z]; this group is rotated -PI/2 about
      // X, so local +y maps to world -z — negate z to get the local y that
      // reproduces the same world position after rotation.
      const [x, z] = cellToWorld({ col, row }, CELL_PITCH);
      cells.push({ col, row, x, y: -z });
    }
  }
  return cells;
}

export interface HoloGridProps {
  /** Fires with the hovered cell, or null when the pointer leaves the grid. */
  onHoverCell?: (coord: Coordinate | null) => void;
  /** Fires when a cell is clicked; the selection persists until another click. */
  onSelectCell?: (coord: Coordinate) => void;
  /**
   * Fires on pointerdown over a cell, with the native button number
   * (0 = primary, 2 = secondary). Lets callers implement press-based
   * interactions (04-07's drag-to-place lift / right-click rotate) without
   * HoloGrid knowing anything about them.
   */
  onPointerDownCell?: (coord: Coordinate, button: number) => void;
  /**
   * Recorded shot outcome per cell, keyed `` `${col},${row}` ``. Cells with
   * an entry render a shot marker layered above the base cell and stop
   * emitting hover/select callbacks — HoloGrid stays otherwise
   * state-agnostic, it just renders whatever it's handed.
   */
  cellStates?: Map<string, CellState>;
  /**
   * Set false for a pure read-only display (04-06's post-game reveal):
   * disables hover/click entirely, including the hover/selected cell
   * highlight — only the static `cellStates` markers render. Defaults true.
   */
  interactive?: boolean;
}

export function HoloGrid({
  onHoverCell,
  onSelectCell,
  onPointerDownCell,
  cellStates,
  interactive = true,
}: HoloGridProps) {
  const cells = useMemo(buildCells, []);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useCursor(interactive && hovered !== null);

  // Pointer-out for cell A can arrive AFTER pointer-over for adjacent cell
  // B; the ref lets the out handler skip clearing a hover it no longer
  // owns without depending on stale closure state.
  const hoveredRef = useRef<string | null>(null);
  const applyHover = (key: string | null, coord: Coordinate | null) => {
    hoveredRef.current = key;
    setHovered(key);
    onHoverCell?.(coord);
  };

  const markerCells = cellStates
    ? cells.filter((cell) => cellStates.has(cellKey(cell)))
    : [];

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
        <planeGeometry args={[CELL_QUAD_SIZE, CELL_QUAD_SIZE]} />
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
          const hasState = cellStates?.has(key) ?? false;
          const disabled = !interactive || hasState;
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
              onPointerOver={
                disabled
                  ? undefined
                  : (event) => {
                      event.stopPropagation();
                      applyHover(key, { col: cell.col, row: cell.row });
                    }
              }
              onPointerOut={
                disabled
                  ? undefined
                  : () => {
                      if (hoveredRef.current === key) applyHover(null, null);
                    }
              }
              onClick={
                // The amber "selected" highlight only makes sense for
                // click-to-select consumers; press-based (drag) consumers
                // pass onPointerDownCell instead and must not accumulate a
                // stale selected cell from the click that ends a drag.
                disabled || onSelectCell === undefined
                  ? undefined
                  : (event) => {
                      event.stopPropagation();
                      setSelected(key);
                      onSelectCell({ col: cell.col, row: cell.row });
                    }
              }
              onPointerDown={
                disabled || onPointerDownCell === undefined
                  ? undefined
                  : (event) => {
                      event.stopPropagation();
                      onPointerDownCell(
                        { col: cell.col, row: cell.row },
                        event.button,
                      );
                    }
              }
            />
          );
        })}
      </Instances>

      {/* Shot markers: layered above the base cell, non-interactive (each
          Instance's raycast is disabled so markers never intercept hover
          or click — those keep hitting the base cell layer beneath). */}
      <Instances limit={GRID_SIZE * GRID_SIZE} renderOrder={2}>
        <planeGeometry args={[MARKER_SIZE, MARKER_SIZE]} />
        <meshBasicMaterial
          transparent
          opacity={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
        {markerCells.map((cell) => {
          const state = cellStates?.get(cellKey(cell));
          if (!state) return null;
          return (
            <Instance
              key={cellKey(cell)}
              position={[cell.x, cell.y, 0.01]}
              color={MARKER_COLORS[state]}
              raycast={() => null}
            />
          );
        })}
      </Instances>
    </group>
  );
}
