// PlacementSceneAdapter — the game-facing placement UI over the same
// game-state-agnostic 3D primitives (SceneRoot/CameraRig, HoloGrid,
// FleetShips) that GameSceneAdapter composes for the battle/post-game
// screens.
//
// Interaction: continuous pointer-drag, mirroring the 2D PlacementBoard
// exactly (user-requested — placement should feel like the 2D drag-to-place
// did). pointerdown on a dock ship or a placed ship's grid cell lifts it;
// while dragging, HoloGrid's per-cell R3F hover events track the hovered
// cell and a green/red ghost previews legality; pointerup drops (illegal
// drops snap back). R rotates mid-drag; right-click rotates a placed ship
// in place. All draft-time legality (bounds + no-overlap-with-other-ships)
// is ported verbatim from the 2D PlacementBoard's `isLegalInDraft`.
//
// Touch: a touch pointerdown on a dock card implicitly captures to that
// DOM node (outside the R3F canvas), which would otherwise starve the
// canvas of pointermove and freeze hover for the whole drag — the dock
// card's onPointerDown releases that capture so the finger's later moves
// hit-test normally. There's no right-click on touch, so a placed ship
// also rotates on a double-tap (two taps with no movement between, within
// DOUBLE_TAP_MS). A tap on a DOCK card (never reaching the grid) deploys
// that ship to a random free spot, which the player then drags into place
// — dock-to-grid dragging is the awkward gesture on a phone; grid-to-grid
// is not. All three are detected in the shared pointerup handler below,
// distinguished by `hover` (did the pointer reach the grid?) and
// `fromGrid` (was the ship already placed?).
//
// Controlled contract, identical to the retired PlacementBoard: a
// `draft: Map<ShipClassId, ShipPlacement>` plus `onChange`, and an optional
// `disabled` for the locked post-submission view. The camera stays in
// "fleet" view throughout — no targeting-view toggle for placement.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Instance, Instances } from "@react-three/drei";
import {
  FLEET,
  GRID_SIZE,
  SHIP_LENGTHS,
  cellsForPlacement,
  inBounds,
  type Coordinate,
  type Orientation,
  type ShipClassId,
  type ShipPlacement,
} from "@steel-horizon/shared";
import { SceneRoot } from "./SceneRoot";
import { FleetShips } from "./ships/FleetShips";
import { ShipPreview } from "./ships/ShipPreview";
import { HoloGrid, GRID_ALTITUDE } from "./grid/HoloGrid";
import { cellToWorld } from "./grid/gridCoords";

export type FleetDraft = ReadonlyMap<ShipClassId, ShipPlacement>;

export const SHIP_NAMES: Record<ShipClassId, string> = {
  carrier: "Carrier",
  battleship: "Battleship",
  cruiser: "Cruiser",
  submarine: "Submarine",
  destroyer: "Destroyer",
};

function cellKey(cell: Coordinate): string {
  return `${cell.col},${cell.row}`;
}

function flip(orientation: Orientation): Orientation {
  return orientation === "horizontal" ? "vertical" : "horizontal";
}

/**
 * Draft-time legality for a single ship: all cells in bounds and no
 * collision with OTHER placed ships. Ported verbatim from the 2D
 * PlacementBoard — do not reimplement, only re-present in 3D.
 */
function isLegalInDraft(candidate: ShipPlacement, draft: FleetDraft): boolean {
  const cells = cellsForPlacement(candidate);
  if (!cells.every(inBounds)) return false;

  const occupied = new Set<string>();
  for (const [ship, placement] of draft) {
    if (ship === candidate.ship) continue;
    for (const cell of cellsForPlacement(placement)) occupied.add(cellKey(cell));
  }
  return cells.every((cell) => !occupied.has(cellKey(cell)));
}

/**
 * A uniformly-random legal spot for one ship given the rest of the draft,
 * or null when the board has no room left for it. Enumerating every
 * candidate (at most 200 per ship) and picking one keeps the distribution
 * even and terminates deterministically — no retry-until-it-fits loop.
 */
function randomLegalPlacement(
  ship: ShipClassId,
  draft: FleetDraft,
): ShipPlacement | null {
  const candidates: ShipPlacement[] = [];
  for (const orientation of ["horizontal", "vertical"] as const) {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const candidate: ShipPlacement = {
          ship,
          origin: { col, row },
          orientation,
        };
        if (isLegalInDraft(candidate, draft)) candidates.push(candidate);
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

interface DragState {
  ship: ShipClassId;
  orientation: Orientation;
  hover: Coordinate | null;
  /** True when the drag was lifted from an already-placed grid cell (as
   *  opposed to a dock ship) — only these count toward double-tap-to-rotate. */
  fromGrid: boolean;
}

/** Two taps on the same placed ship within this window count as a
 *  double-tap (rotate) instead of two independent no-op taps. */
const DOUBLE_TAP_MS = 350;

// Ghost preview colors: match the 2D board's green/red legality signal,
// tuned bright for the additive-blended hologram look.
const GHOST_LEGAL = new THREE.Color("#5aff8a");
const GHOST_ILLEGAL = new THREE.Color("#ff4d5e");
const GHOST_QUAD_SIZE = 3.4;
const MAX_SHIP_LENGTH = Math.max(...FLEET.map((ship) => SHIP_LENGTHS[ship]));

/** Green/red ghost cells for the in-flight drag, floating just above the grid. */
function GhostCells({ cells, legal }: { cells: Coordinate[]; legal: boolean }) {
  return (
    <group position={[0, GRID_ALTITUDE + 0.05, 0]} rotation-x={-Math.PI / 2}>
      <Instances limit={MAX_SHIP_LENGTH} renderOrder={3}>
        <planeGeometry args={[GHOST_QUAD_SIZE, GHOST_QUAD_SIZE]} />
        <meshBasicMaterial
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
        {cells.map((cell) => {
          // Same local-coordinate trick as HoloGrid: the group is rotated
          // -PI/2 about X, so local +y maps to world -z.
          const [x, z] = cellToWorld(cell);
          return (
            <Instance
              key={cellKey(cell)}
              position={[x, -z, 0]}
              color={legal ? GHOST_LEGAL : GHOST_ILLEGAL}
              raycast={() => null}
            />
          );
        })}
      </Instances>
    </group>
  );
}

export interface PlacementSceneAdapterProps {
  draft: FleetDraft;
  onChange: (next: Map<ShipClassId, ShipPlacement>) => void;
  /** Locked read-only view (post-submission). */
  disabled?: boolean;
}

export function PlacementSceneAdapter({
  draft,
  onChange,
  disabled = false,
}: PlacementSceneAdapterProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flashShip, setFlashShip] = useState<ShipClassId | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last no-op tap (pointerdown+up with no hover change) on a placed ship,
  // for double-tap-to-rotate detection — see the onUp handler below.
  const lastTapRef = useRef<{ ship: ShipClassId; time: number } | null>(null);

  // Refs mirror the latest props/state so the window-level drag listeners
  // (registered once per drag) never see stale closures — same pattern the
  // 2D PlacementBoard used.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    },
    [],
  );

  function flash(ship: ShipClassId): void {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setFlashShip(ship);
    flashTimer.current = setTimeout(() => setFlashShip(null), 450);
  }

  function startDrag(ship: ShipClassId, fromGrid = false): void {
    if (disabled) return;
    setDrag({
      ship,
      orientation: draft.get(ship)?.orientation ?? "horizontal",
      hover: null,
      fromGrid,
    });
  }

  function rotatePlaced(ship: ShipClassId): void {
    if (disabled) return;
    const placement = draft.get(ship);
    if (placement === undefined) return;
    const rotated: ShipPlacement = {
      ...placement,
      orientation: flip(placement.orientation),
    };
    if (isLegalInDraft(rotated, draft)) {
      const next = new Map(draft);
      next.set(ship, rotated);
      onChange(next);
    } else {
      flash(ship);
    }
  }

  // Grid pointerdown: primary button lifts the placed ship occupying that
  // cell (if any); secondary button rotates it in place — mirroring the 2D
  // board's pointerdown-lift and right-click-rotate.
  function handleGridPointerDown(coord: Coordinate, button: number): void {
    if (disabled) return;
    const key = cellKey(coord);
    let owner: ShipClassId | null = null;
    for (const [ship, placement] of draft) {
      if (cellsForPlacement(placement).some((c) => cellKey(c) === key)) {
        owner = ship;
        break;
      }
    }
    if (owner === null) return;
    if (button === 0) startDrag(owner, true);
    else if (button === 2) rotatePlaced(owner);
  }

  // Window-level listeners live for the duration of one drag: pointerup
  // drops (legal hover commits, otherwise snap back), R rotates mid-drag.
  // HoloGrid's own hover events feed `drag.hover` — no manual raycasting.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;

    const onUp = () => {
      const d = dragRef.current;
      if (d !== null && d.hover !== null) {
        // A real drag (the pointer crossed onto a grid cell): commit or
        // snap back as before, and this ship no longer has a pending tap.
        lastTapRef.current = null;
        const candidate: ShipPlacement = {
          ship: d.ship,
          origin: d.hover,
          orientation: d.orientation,
        };
        if (isLegalInDraft(candidate, draftRef.current)) {
          const next = new Map(draftRef.current);
          next.set(d.ship, candidate);
          onChangeRef.current(next);
        }
      } else if (d !== null && d.fromGrid) {
        // Press-and-release with no movement on a placed ship, i.e. a tap
        // (touch has no right-click for the desktop rotate gesture). Two
        // of these on the same ship within DOUBLE_TAP_MS rotate it in
        // place; a single tap is a no-op, same as before this feature.
        const now = Date.now();
        const lastTap = lastTapRef.current;
        if (lastTap !== null && lastTap.ship === d.ship && now - lastTap.time < DOUBLE_TAP_MS) {
          lastTapRef.current = null;
          const placement = draftRef.current.get(d.ship);
          if (placement !== undefined) {
            const rotated: ShipPlacement = {
              ...placement,
              orientation: flip(placement.orientation),
            };
            if (isLegalInDraft(rotated, draftRef.current)) {
              const next = new Map(draftRef.current);
              next.set(d.ship, rotated);
              onChangeRef.current(next);
            } else {
              flash(d.ship);
            }
          }
        } else {
          lastTapRef.current = { ship: d.ship, time: now };
        }
      } else if (d !== null) {
        // Tap on a DOCK ship (pressed and released without ever reaching
        // the grid). Dragging a card straight onto a 10x10 board is fiddly
        // on a phone, so a tap deploys the ship to a random free spot and
        // the player drags it from there — the grid-to-grid drag above is
        // a much easier gesture than dock-to-grid.
        lastTapRef.current = null;
        const spot = randomLegalPlacement(d.ship, draftRef.current);
        if (spot !== null) {
          const next = new Map(draftRef.current);
          next.set(d.ship, spot);
          onChangeRef.current(next);
        } else {
          // No room anywhere for this hull — say so rather than no-op.
          flash(d.ship);
        }
      }
      // Illegal or off-grid drop: no onChange — the ship snaps back.
      setDrag(null);
    };

    const onCancel = () => setDrag(null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setDrag((d) => (d === null ? null : { ...d, orientation: flip(d.orientation) }));
      }
    };

    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragging]);

  // Ghost preview cells for the in-flight drag (in-bounds subset, exactly
  // like the 2D board rendered its ghost).
  const ghost = useMemo(() => {
    if (drag === null || drag.hover === null) return null;
    const candidate: ShipPlacement = {
      ship: drag.ship,
      origin: drag.hover,
      orientation: drag.orientation,
    };
    return {
      cells: cellsForPlacement(candidate).filter(inBounds),
      legal: isLegalInDraft(candidate, draft),
    };
  }, [drag, draft]);

  // The dragged ship lifts off the water while in flight; everything else
  // stays rendered at its real position.
  const placements = Array.from(draft.values()).filter(
    (placement) => placement.ship !== drag?.ship,
  );

  const unplaced = FLEET.filter((ship) => !draft.has(ship));

  return (
    <div
      className={`placement-scene${disabled ? " is-disabled" : ""}${dragging ? " is-dragging" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="game-scene">
        <SceneRoot view="fleet">
          {placements.length > 0 && <FleetShips placements={placements} />}
          <HoloGrid
            interactive={!disabled}
            onHoverCell={
              dragging
                ? (coord) =>
                    setDrag((d) => (d === null ? null : { ...d, hover: coord }))
                : undefined
            }
            onPointerDownCell={disabled ? undefined : handleGridPointerDown}
          />
          {ghost !== null && (
            <GhostCells cells={ghost.cells} legal={ghost.legal} />
          )}
        </SceneRoot>
      </div>

      {!disabled && (
        <div className="dock">
          <h2>Dock</h2>
          {unplaced.length === 0 ? (
            <p className="dock-empty">All ships deployed</p>
          ) : (
            unplaced.map((ship) => (
              <div
                key={ship}
                className={`dock-ship${drag?.ship === ship ? " lifting" : ""}${flashShip === ship ? " flash-illegal" : ""}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  // Touch pointers implicitly capture to whatever DOM node
                  // they went down on (the dock card here, outside the R3F
                  // canvas). Left uncontested, every later pointermove keeps
                  // targeting this card instead of the canvas, so the
                  // dragged ship never gets a hover cell over the grid and
                  // every drop looks illegal — release the capture so the
                  // browser hit-tests under the finger as it moves, same as
                  // desktop hover already does.
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  startDrag(ship);
                }}
              >
                <span className="dock-ship-name">
                  {SHIP_NAMES[ship]}
                  <span className="dock-ship-length">
                    {SHIP_LENGTHS[ship]}
                  </span>
                </span>
                <span className="dock-ship-preview" aria-hidden="true">
                  <ShipPreview shipClass={ship} />
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
