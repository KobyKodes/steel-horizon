// GameSceneAdapter — the game-facing API over the raw 3D scene pieces
// (SceneRoot/CameraRig, FleetShips, HoloGrid). This is the only place real
// RoomSnapshot-shaped data (fleet placements, shot history, turn gating)
// touches the scene; HoloGrid and FleetShips themselves stay
// game-state-agnostic. 04-06 (post-game) and 04-07 (placement) build their
// own thin adapters over the same underlying pieces rather than teaching
// HoloGrid/FleetShips new game rules directly.

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
  /** Your own fleet's placements; null before placement completes. */
  yourFleet: FleetPlacement | null;
  /** Shot history against the opponent, driving the targeting grid's markers. */
  shots: ShotRecord[];
  /** Whether firing is currently allowed (your turn). */
  canFire: boolean;
  onFire: (target: Coordinate) => void;
  /** Ships in `yourFleet` to render with the damaged material tint. */
  sunkShips?: ShipClassId[];
}

export function GameSceneAdapter({
  view,
  yourFleet,
  shots,
  canFire,
  onFire,
  sunkShips,
}: GameSceneAdapterProps) {
  const cellStates = cellStatesFrom(shots);

  return (
    <div className="game-scene">
      <SceneRoot view={view}>
        {/* Ships only render in fleet view. The grid is shared physical
            space for both views (04-05 established one cellToWorld mapping
            for everything), but it stands for two different boards — your
            own fleet in fleet view, the enemy's waters in targeting view —
            so your ships must not appear while the grid is being read as
            the enemy's board. */}
        {view === "fleet" && yourFleet && (
          <FleetShips placements={yourFleet} sunkShips={sunkShips} />
        )}
        <HoloGrid
          cellStates={cellStates}
          onSelectCell={(target) => {
            // Mirrors TargetingBoard's old `clickable` gate: only forward a
            // fire attempt when it's your turn AND the cell has no existing
            // shot record — HoloGrid already withholds callbacks for cells
            // with a state, this additionally guards the (turn-gated) case
            // where the cell is untargeted but it's not your turn.
            if (!canFire) return;
            if (cellStates.has(cellKey(target))) return;
            onFire(target);
          }}
        />
      </SceneRoot>
    </div>
  );
}
