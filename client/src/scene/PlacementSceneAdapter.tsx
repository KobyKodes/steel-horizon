// PlacementSceneAdapter — the game-facing placement UI over the same
// game-state-agnostic 3D primitives (SceneRoot/CameraRig, HoloGrid,
// FleetShips) that GameSceneAdapter composes for the battle/post-game
// screens. Placement's interaction shape (select a ship, then place it —
// see the plan's checkpoint decision) is different enough from
// GameSceneAdapter's fire/reveal modes to warrant its own component rather
// than a third mode bolted onto it.
//
// Controlled contract, identical to the retired PlacementBoard: a
// `draft: Map<ShipClassId, ShipPlacement>` plus `onChange`, and an optional
// `disabled` for the locked post-submission view. All draft-time legality
// (bounds + no-overlap-with-other-ships) is ported verbatim from
// PlacementBoard.tsx's `isLegalInDraft` — nothing is reimplemented, only
// re-presented in 3D. The camera stays in "fleet" view throughout; there is
// no targeting-view toggle for placement.

import { useEffect, useRef, useState } from "react";
import {
  FLEET,
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
import { HoloGrid } from "./grid/HoloGrid";

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
 * collision with OTHER placed ships. Ported verbatim from
 * PlacementBoard.tsx — do not reimplement, only re-present in 3D.
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

/** First unplaced ship in canonical FLEET order, or null if the draft is full. */
function firstUnplaced(draft: FleetDraft): ShipClassId | null {
  return FLEET.find((ship) => !draft.has(ship)) ?? null;
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
  const [activeShip, setActiveShip] = useState<ShipClassId | null>(() =>
    firstUnplaced(draft),
  );
  // Orientation used for the NEXT placement of a not-yet-placed active ship.
  // Once a ship is placed, its orientation lives in `draft` itself.
  const [pendingOrientation, setPendingOrientation] =
    useState<Orientation>("horizontal");
  const [flashShip, setFlashShip] = useState<ShipClassId | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Re-seed a null selection (e.g. after "Clear") with the next unplaced
  // ship whenever the draft changes out from under us — Randomize/Clear
  // replace the whole draft in PlacementScreen. A non-null selection is
  // always kept as-is (valid whether placed or still unplaced).
  useEffect(() => {
    if (disabled || activeShip !== null) return;
    setActiveShip(firstUnplaced(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, disabled]);

  function flash(ship: ShipClassId): void {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setFlashShip(ship);
    flashTimer.current = setTimeout(() => setFlashShip(null), 450);
  }

  function selectShip(ship: ShipClassId): void {
    if (disabled) return;
    setActiveShip(ship);
    setPendingOrientation(draft.get(ship)?.orientation ?? "horizontal");
  }

  function rotateActive(): void {
    if (disabled || activeShip === null) return;
    const placement = draft.get(activeShip);
    if (placement === undefined) {
      setPendingOrientation((o) => flip(o));
      return;
    }
    const rotated: ShipPlacement = {
      ...placement,
      orientation: flip(placement.orientation),
    };
    if (isLegalInDraft(rotated, draft)) {
      const next = new Map(draft);
      next.set(activeShip, rotated);
      onChange(next);
    } else {
      flash(activeShip);
    }
  }

  function handleSelectCell(coord: Coordinate): void {
    if (disabled || activeShip === null) return;
    const orientation = draft.get(activeShip)?.orientation ?? pendingOrientation;
    const candidate: ShipPlacement = {
      ship: activeShip,
      origin: coord,
      orientation,
    };
    if (!isLegalInDraft(candidate, draft)) {
      flash(activeShip);
      return;
    }
    const next = new Map(draft);
    next.set(activeShip, candidate);
    onChange(next);

    const remaining = FLEET.find(
      (ship) => ship !== activeShip && !next.has(ship),
    );
    setActiveShip(remaining ?? null);
    setPendingOrientation("horizontal");
  }

  // R key rotates the active ship, mirroring PlacementBoard's keybinding.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, activeShip, draft, pendingOrientation]);

  const placements = Array.from(draft.values());

  return (
    <div className={`placement-scene${disabled ? " is-disabled" : ""}`}>
      <div className="game-scene">
        <SceneRoot view="fleet">
          {placements.length > 0 && <FleetShips placements={placements} />}
          <HoloGrid
            interactive={!disabled}
            onSelectCell={disabled ? undefined : handleSelectCell}
          />
        </SceneRoot>
      </div>

      {!disabled && (
        <div className="dock">
          <h2>Dock</h2>
          {FLEET.map((ship) => {
            const placement = draft.get(ship);
            const isActive = activeShip === ship;
            const orientation =
              placement?.orientation ??
              (isActive ? pendingOrientation : "horizontal");
            let className = "dock-ship";
            if (isActive) className += " active";
            if (placement !== undefined) className += " placed";
            if (flashShip === ship) className += " flash-illegal";
            return (
              <button
                key={ship}
                type="button"
                className={className}
                onClick={() => selectShip(ship)}
              >
                <span className="dock-ship-name">
                  {SHIP_NAMES[ship]} &middot; {SHIP_LENGTHS[ship]}
                </span>
                <span className="dock-ship-cells">
                  {Array.from({ length: SHIP_LENGTHS[ship] }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                <span className="dock-ship-status">
                  {placement !== undefined ? "placed" : "unplaced"} &middot;{" "}
                  {orientation}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="rotate-button"
            disabled={activeShip === null}
            onClick={rotateActive}
          >
            Rotate{activeShip ? ` (${SHIP_NAMES[activeShip]})` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
