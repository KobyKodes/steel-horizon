// GameSceneAdapter — the game-facing API over the raw 3D scene pieces
// (SceneRoot/CameraRig, FleetShips, HoloGrid). This is the only place real
// RoomSnapshot-shaped data (fleet placements, shot history, turn gating)
// touches the scene; HoloGrid and FleetShips themselves stay
// game-state-agnostic. 04-07 (placement) builds its own thin adapter over
// the same underlying pieces rather than teaching HoloGrid/FleetShips new
// game rules directly.
//
// Two modes: "interactive" (04-05's Battle screen — fleet/targeting view
// toggle, live firing) and "reveal" (04-06's Post-Game screen — a single
// read-only display of one fleet plus its shot history, no firing, no
// hover/click at all).

import type {
  Coordinate,
  FleetPlacement,
  ShipClassId,
  ShotRecord,
} from "@steel-horizon/shared";
import { SceneRoot } from "./SceneRoot";
import { FleetShips } from "./ships/FleetShips";
import { HoloGrid, type CellState } from "./grid/HoloGrid";
import type { CameraView } from "./camera/CameraRig";

/** `` `${col},${row}` `` — matches TargetingBoard.tsx's cellKey convention. */
function cellKey(coord: Coordinate): string {
  return `${coord.col},${coord.row}`;
}

/**
 * Cells belonging to sunk ships, from the server-supplied `sunkShipCells`.
 * Ported verbatim from TargetingBoard.tsx — do not re-derive.
 */
function sunkCellsFrom(shots: ShotRecord[]): Set<string> {
  const sunk = new Set<string>();
  for (const shot of shots) {
    for (const cell of shot.sunkShipCells ?? []) {
      sunk.add(cellKey(cell));
    }
  }
  return sunk;
}

/** Converts a shot history into HoloGrid's `cellStates` map. */
function cellStatesFrom(shots: ShotRecord[]): Map<string, CellState> {
  const sunkCells = sunkCellsFrom(shots);
  const states = new Map<string, CellState>();
  for (const shot of shots) {
    const key = cellKey(shot.target);
    if (shot.result === "miss") {
      states.set(key, "miss");
    } else {
      states.set(key, sunkCells.has(key) ? "sunk" : "hit");
    }
  }
  return states;
}

export interface GameSceneAdapterProps {
  view: CameraView;
  /** Default "interactive" (Battle screen); "reveal" is a read-only display (Post-Game screen). */
  mode?: "interactive" | "reveal";
  /** Fleet placements to render; null before placement completes. */
  yourFleet: FleetPlacement | null;
  /** Shot history against this fleet's opponent, driving the grid's markers. */
  shots: ShotRecord[];
  /** Whether firing is currently allowed (your turn). Ignored in "reveal" mode. */
  canFire?: boolean;
  /** Ignored in "reveal" mode. */
  onFire?: (target: Coordinate) => void;
  /** Ships in `yourFleet` to render with the damaged material tint. */
  sunkShips?: ShipClassId[];
}

export function GameSceneAdapter({
  view,
  mode = "interactive",
  yourFleet,
  shots,
  canFire,
  onFire,
  sunkShips,
}: GameSceneAdapterProps) {
  const cellStates = cellStatesFrom(shots);
  const isReveal = mode === "reveal";

  return (
    <div className="game-scene">
      <SceneRoot view={view}>
        {/* In interactive mode, ships only render in fleet view — the grid
            is shared physical space for both views (04-05 established one
            cellToWorld mapping for everything), but it stands for two
            different boards (your own fleet vs. the enemy's waters), so
            your ships must not appear while the grid is being read as the
            enemy's board. In reveal mode there's only ever one board being
            shown (this fleet + its shot history), so the ships always render. */}
        {(isReveal || view === "fleet") && yourFleet && (
          <FleetShips placements={yourFleet} sunkShips={sunkShips} />
        )}
        <HoloGrid
          cellStates={cellStates}
          interactive={!isReveal}
          onSelectCell={
            isReveal
              ? undefined
              : (target) => {
                  // Mirrors TargetingBoard's old `clickable` gate: only
                  // forward a fire attempt when it's your turn AND the cell
                  // has no existing shot record — HoloGrid already
                  // withholds callbacks for cells with a state, this
                  // additionally guards the (turn-gated) case where the
                  // cell is untargeted but it's not your turn.
                  if (!canFire) return;
                  if (cellStates.has(cellKey(target))) return;
                  onFire?.(target);
                }
          }
        />
      </SceneRoot>
    </div>
  );
}
