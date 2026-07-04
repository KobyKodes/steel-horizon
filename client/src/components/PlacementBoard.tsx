// PlacementBoard — controlled 10×10 fleet-placement grid plus a dock of
// unplaced ships.
//
// Controlled: the fleet draft lives in the parent (`draft` + `onChange`);
// this component owns only transient interaction state (the in-flight drag
// and the illegal-rotation flash). All legality rules come from
// @steel-horizon/shared — nothing is reimplemented here.
//
// Interaction mechanism (one, made solid — per plan): pointer-event drag.
// pointerdown on a dock ship or a placed ship lifts it; window-level
// pointermove tracks the hovered cell with a green/red ghost preview;
// pointerup drops (illegal drops snap back). R rotates mid-drag;
// right-click rotates a placed ship in place.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FLEET,
  GRID_SIZE,
  SHIP_LENGTHS,
  cellsForPlacement,
  coordToLabel,
  inBounds,
  type Coordinate,
  type Orientation,
  type ShipClassId,
  type ShipPlacement,
} from "@steel-horizon/shared";

export type FleetDraft = ReadonlyMap<ShipClassId, ShipPlacement>;

export const SHIP_NAMES: Record<ShipClassId, string> = {
  carrier: "Carrier",
  battleship: "Battleship",
  cruiser: "Cruiser",
  submarine: "Submarine",
  destroyer: "Destroyer",
};

interface DragState {
  ship: ShipClassId;
  orientation: Orientation;
  hover: Coordinate | null;
}

interface PlacementBoardProps {
  draft: FleetDraft;
  onChange: (next: Map<ShipClassId, ShipPlacement>) => void;
  /** Locked read-only view (post-submission). */
  disabled?: boolean;
}

function cellKey(cell: Coordinate): string {
  return `${cell.col},${cell.row}`;
}

function flip(orientation: Orientation): Orientation {
  return orientation === "horizontal" ? "vertical" : "horizontal";
}

/**
 * Draft-time legality for a single ship: all cells in bounds and no
 * collision with OTHER placed ships (bounds/overlap mirror the shared
 * validateFleetPlacement checks, applied per-ship while the fleet is
 * still incomplete).
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

/** Column header letters / row header numbers via coordToLabel only. */
function colHeader(col: number): string {
  return coordToLabel({ col, row: 0 }).slice(0, 1);
}
function rowHeader(row: number): string {
  return coordToLabel({ col: 0, row }).slice(1);
}

export default function PlacementBoard({
  draft,
  onChange,
  disabled = false,
}: PlacementBoardProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flashShip, setFlashShip] = useState<ShipClassId | null>(null);

  const cellsRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs mirror the latest props/state so the window-level drag listeners
  // (registered once per drag) never see stale closures.
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

  function cellFromPoint(x: number, y: number): Coordinate | null {
    const rect = cellsRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return null;
    const coord = {
      col: Math.floor(((x - rect.left) / rect.width) * GRID_SIZE),
      row: Math.floor(((y - rect.top) / rect.height) * GRID_SIZE),
    };
    return inBounds(coord) ? coord : null;
  }

  function startDrag(ship: ShipClassId, e: React.PointerEvent): void {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    setDrag({
      ship,
      orientation: draft.get(ship)?.orientation ?? "horizontal",
      hover: cellFromPoint(e.clientX, e.clientY),
    });
  }

  // Window-level listeners live for the duration of one drag.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const hover = cellFromPoint(e.clientX, e.clientY);
      setDrag((d) => (d === null ? null : { ...d, hover }));
    };

    const onUp = () => {
      const d = dragRef.current;
      if (d !== null && d.hover !== null) {
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
      }
      // Illegal or off-board drop: no onChange — the ship snaps back.
      setDrag(null);
    };

    const onCancel = () => setDrag(null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setDrag((d) => (d === null ? null : { ...d, orientation: flip(d.orientation) }));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

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

  // --- Render maps -------------------------------------------------------

  // Occupancy of placed ships; the dragged ship's cells render dimmed
  // ("lifting") rather than solid, and its bow keeps the label.
  const occupancy = useMemo(() => {
    const map = new Map<string, { ship: ShipClassId; bow: boolean }>();
    for (const [ship, placement] of draft) {
      cellsForPlacement(placement).forEach((cell, i) => {
        map.set(cellKey(cell), { ship, bow: i === 0 });
      });
    }
    return map;
  }, [draft]);

  // Ghost preview for the in-flight drag.
  const ghost = useMemo(() => {
    if (drag === null || drag.hover === null) return null;
    const candidate: ShipPlacement = {
      ship: drag.ship,
      origin: drag.hover,
      orientation: drag.orientation,
    };
    return {
      cells: new Set(
        cellsForPlacement(candidate).filter(inBounds).map(cellKey),
      ),
      legal: isLegalInDraft(candidate, draft),
    };
  }, [drag, draft]);

  const unplaced = FLEET.filter((ship) => !draft.has(ship));

  const cells = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const key = cellKey({ col, row });
      const occupant = occupancy.get(key);

      let className = "cell";
      if (occupant !== undefined) {
        className += " ship";
        if (drag?.ship === occupant.ship) className += " lifting";
        if (flashShip === occupant.ship) className += " flash-illegal";
      }
      if (ghost !== null && ghost.cells.has(key)) {
        className += ghost.legal ? " ghost-legal" : " ghost-illegal";
      }

      cells.push(
        <div
          key={key}
          className={className}
          title={
            occupant !== undefined
              ? `${SHIP_NAMES[occupant.ship]} — ${coordToLabel({ col, row })}`
              : coordToLabel({ col, row })
          }
          onPointerDown={
            occupant !== undefined
              ? (e) => startDrag(occupant.ship, e)
              : undefined
          }
          onContextMenu={
            occupant !== undefined
              ? (e) => {
                  e.preventDefault();
                  rotatePlaced(occupant.ship);
                }
              : undefined
          }
        >
          {occupant?.bow ? SHIP_NAMES[occupant.ship].slice(0, 1) : null}
        </div>,
      );
    }
  }

  return (
    <div
      className={`placement-board${disabled ? " is-disabled" : ""}${dragging ? " is-dragging" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="placement-grid">
        <div className="board-corner" />
        <div className="col-headers">
          {Array.from({ length: GRID_SIZE }, (_, col) => (
            <span key={col}>{colHeader(col)}</span>
          ))}
        </div>
        <div className="row-headers">
          {Array.from({ length: GRID_SIZE }, (_, row) => (
            <span key={row}>{rowHeader(row)}</span>
          ))}
        </div>
        <div className="cells" ref={cellsRef}>
          {cells}
        </div>
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
                className={`dock-ship${drag?.ship === ship ? " lifting" : ""}`}
                onPointerDown={(e) => startDrag(ship, e)}
              >
                <span className="dock-ship-name">
                  {SHIP_NAMES[ship]} · {SHIP_LENGTHS[ship]}
                </span>
                <span className="dock-ship-cells">
                  {Array.from({ length: SHIP_LENGTHS[ship] }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
