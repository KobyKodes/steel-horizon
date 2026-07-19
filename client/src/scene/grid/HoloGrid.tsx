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
/**
 * Height of the grid plane above the ocean's rest height. Must clear the
 * summed Gerstner crest amplitude (~1.05 world units for waves.ts's WAVES)
 * so crests never poke through the hologram.
 */
export const GRID_ALTITUDE = 1.8;

// Holographic cell states, consistent with Ocean.tsx's teal/cyan palette.
// Additive blending makes the dim base color read as a faint projected
// light plane; the hover state is the hue pushed to paper-white glow, and
// the selected state is the UI's hit-yellow "target lock" (#ffd21f — same
// accent the 2D comic chrome uses) so a locked cell is unmistakable.
const COLOR_CELL = new THREE.Color("#2fa3bd");
const COLOR_HOVERED = new THREE.Color("#f4f7ff");
const COLOR_SELECTED = new THREE.Color("#ffd21f");

/** Recorded shot outcome for a cell, keyed `` `${col},${row}` ``. */
export type CellState = "hit" | "miss" | "sunk";

// Shot-marker colors: bright paper-white splash ring for a miss,
// warning-yellow for a ship that's hit but still afloat, red once the
// ship is confirmed sunk (USER direction 2026-07-18 — damage escalates
// yellow -> red, so a red cell always means a kill). Every marker sits on
// an ink under-shape so it reads as an outlined comic stamp, not a flat
// decal (USER direction 2026-07-19 — the old grey miss "O" was drab).
const COLOR_MISS = new THREE.Color("#f4f7ff");
const COLOR_HIT = new THREE.Color("#ffd21f");
const COLOR_SUNK = new THREE.Color("#ff2e3f");
const COLOR_MARKER_INK = new THREE.Color("#10131a");

// Comic shot-marker shapes: a miss is a splash ring, a hit is an 8-point
// comic star, a sunk cell gets a bigger 12-point burst — the same starburst
// vocabulary the 2D chrome's landing-page badge uses. Each marker is tilted
// by a deterministic per-cell angle so a board full of shots reads as
// hand-stamped, not machine-tiled.
function starGeometry(
  points: number,
  outer: number,
  inner: number,
): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** Stable pseudo-random stamp tilt (radians) for a cell. */
function stampTilt(cell: GridCell): number {
  return ((cell.col * 7 + cell.row * 13) % 12) * 0.09 - 0.5;
}

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
  const missCells = markerCells.filter(
    (cell) => cellStates?.get(cellKey(cell)) === "miss",
  );
  const hitCells = markerCells.filter(
    (cell) => cellStates?.get(cellKey(cell)) === "hit",
  );
  const sunkCells = markerCells.filter(
    (cell) => cellStates?.get(cellKey(cell)) === "sunk",
  );

  // Each marker shape pairs with a slightly larger ink under-shape that
  // renders beneath it, forming the comic outline.
  const markerGeometries = useMemo(
    () => ({
      miss: new THREE.RingGeometry(0.55, 1.0, 32),
      missInk: new THREE.RingGeometry(0.35, 1.22, 32),
      hit: starGeometry(8, 1.5, 0.65),
      hitInk: starGeometry(8, 1.78, 0.82),
      sunk: starGeometry(12, 1.9, 0.85),
      sunkInk: starGeometry(12, 2.2, 1.02),
    }),
    [],
  );

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

      {/* Comic-panel frame: an ink border with hit-yellow corner rivets,
          reading the board as one panel torn from the page. Non-interactive
          and drawn with normal blending (ink would vanish additively). */}
      <PanelFrame />

      {/* Shot markers: layered above the base cell, non-interactive (each
          Instance's raycast is disabled so markers never intercept hover
          or click — those keep hitting the base cell layer beneath).
          One Instances batch per outcome shape. */}
      <MarkerLayer
        cells={missCells}
        geometry={markerGeometries.miss}
        inkGeometry={markerGeometries.missInk}
        color={COLOR_MISS}
      />
      <MarkerLayer
        cells={hitCells}
        geometry={markerGeometries.hit}
        inkGeometry={markerGeometries.hitInk}
        color={COLOR_HIT}
      />
      <MarkerLayer
        cells={sunkCells}
        geometry={markerGeometries.sunk}
        inkGeometry={markerGeometries.sunkInk}
        color={COLOR_SUNK}
      />
    </group>
  );
}

/** One instanced batch of same-shaped shot markers, stamp-tilted per cell:
    an ink under-shape batch drawn first, the colored shape on top. */
function MarkerLayer({
  cells,
  geometry,
  inkGeometry,
  color,
}: {
  cells: GridCell[];
  geometry: THREE.BufferGeometry;
  inkGeometry: THREE.BufferGeometry;
  color: THREE.Color;
}) {
  const layers = [
    { geometry: inkGeometry, color: COLOR_MARKER_INK, order: 2, z: 0.008 },
    { geometry, color, order: 3, z: 0.01 },
  ];
  return (
    <>
      {layers.map((layer, i) => (
        <Instances
          key={i}
          limit={GRID_SIZE * GRID_SIZE}
          renderOrder={layer.order}
          geometry={layer.geometry}
        >
          <meshBasicMaterial
            transparent
            opacity={0.95}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
          {cells.map((cell) => (
            <Instance
              key={cellKey(cell)}
              position={[cell.x, cell.y, layer.z]}
              rotation={[0, 0, stampTilt(cell)]}
              color={layer.color}
              raycast={() => null}
            />
          ))}
        </Instances>
      ))}
    </>
  );
}

// Frame metrics: the cells span ±(GRID_SIZE/2 * CELL_PITCH); the ink border
// sits just outside that with the rivets on its corners.
const FRAME_INNER = (GRID_SIZE / 2) * CELL_PITCH + 0.35;
const FRAME_THICKNESS = 0.7;
const FRAME_MID = FRAME_INNER + FRAME_THICKNESS / 2;
const FRAME_LENGTH = FRAME_INNER * 2 + FRAME_THICKNESS * 2;
const RIVET_SIZE = 1.6;
const FRAME_INK = "#10131a";
const RIVET_COLOR = "#ffd21f";

function PanelFrame() {
  return (
    <group renderOrder={2}>
      {/* Top / bottom / left / right border bars. */}
      {([
        [0, FRAME_MID, FRAME_LENGTH, FRAME_THICKNESS],
        [0, -FRAME_MID, FRAME_LENGTH, FRAME_THICKNESS],
        [-FRAME_MID, 0, FRAME_THICKNESS, FRAME_INNER * 2],
        [FRAME_MID, 0, FRAME_THICKNESS, FRAME_INNER * 2],
      ] as const).map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.005]} raycast={() => null}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial
            color={FRAME_INK}
            transparent
            opacity={0.92}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Hit-yellow corner rivets, tilted like slapped-on stickers. */}
      {([
        [-FRAME_MID, FRAME_MID, -0.2],
        [FRAME_MID, FRAME_MID, 0.15],
        [-FRAME_MID, -FRAME_MID, 0.25],
        [FRAME_MID, -FRAME_MID, -0.1],
      ] as const).map(([x, y, tilt], i) => (
        <mesh key={i} position={[x, y, 0.01]} rotation={[0, 0, tilt]} raycast={() => null}>
          <planeGeometry args={[RIVET_SIZE, RIVET_SIZE]} />
          <meshBasicMaterial
            color={RIVET_COLOR}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
