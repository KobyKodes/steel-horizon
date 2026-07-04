// TargetingBoard — the opponent's waters, rendered purely from `yourShots`.
//
// Untargeted cells are clickable only when it's your turn. The single piece
// of optimistic state is the just-clicked cell, disabled until the next
// snapshot arrives (the server confirms via snapshot — nothing else is
// assumed locally).

import { useEffect, useState } from "react";
import {
  GRID_SIZE,
  SHIP_LENGTHS,
  coordToLabel,
  type Coordinate,
  type ShotRecord,
} from "@steel-horizon/shared";

interface TargetingBoardProps {
  shots: ShotRecord[];
  canFire: boolean;
  onFire: (target: Coordinate) => void;
}

function cellKey(coord: Coordinate): string {
  return `${coord.col},${coord.row}`;
}

/**
 * Best-effort set of cells belonging to sunk ships, derived from `sunkShip`
 * markers. Since hit records don't say which ship they struck, we look for a
 * contiguous run of hits through the sinking shot along one axis: if exactly
 * one axis has a run of exactly the ship's length, those cells are the ship.
 * Ambiguous layouts (touching ships are legal) fall back to marking only the
 * sinking cell — cosmetic only, never authoritative.
 */
function deriveSunkCells(shots: ShotRecord[]): Set<string> {
  const hitCells = new Set(
    shots.filter((s) => s.result !== "miss").map((s) => cellKey(s.target)),
  );

  const runThrough = (
    origin: Coordinate,
    dc: number,
    dr: number,
  ): Coordinate[] => {
    const run: Coordinate[] = [origin];
    for (const dir of [1, -1]) {
      let col = origin.col + dc * dir;
      let row = origin.row + dr * dir;
      while (hitCells.has(cellKey({ col, row }))) {
        run.push({ col, row });
        col += dc * dir;
        row += dr * dir;
      }
    }
    return run;
  };

  const sunk = new Set<string>();
  for (const shot of shots) {
    if (!shot.sunkShip) continue;
    const length = SHIP_LENGTHS[shot.sunkShip];
    const horizontal = runThrough(shot.target, 1, 0);
    const vertical = runThrough(shot.target, 0, 1);
    const candidates = [horizontal, vertical].filter(
      (run) => run.length === length,
    );
    if (length === 1 || candidates.length === 1) {
      for (const cell of candidates[0] ?? [shot.target]) {
        sunk.add(cellKey(cell));
      }
    } else {
      sunk.add(cellKey(shot.target));
    }
  }
  return sunk;
}

export default function TargetingBoard({
  shots,
  canFire,
  onFire,
}: TargetingBoardProps) {
  // Optimistically disable the clicked cell until the next snapshot lands.
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    // Any snapshot update (new shots array identity) clears the optimism —
    // either our shot was recorded or the server rejected it.
    setPending(null);
  }, [shots]);

  const shotByCell = new Map<string, ShotRecord>();
  for (const shot of shots) {
    shotByCell.set(cellKey(shot.target), shot);
  }
  const sunkCells = deriveSunkCells(shots);

  const rows = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const cells = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const coord: Coordinate = { col, row };
      const key = cellKey(coord);
      const record = shotByCell.get(key);
      const label = coordToLabel(coord);

      let className = "cell";
      if (record) {
        className +=
          record.result === "miss"
            ? " miss"
            : sunkCells.has(key)
              ? " hit sunk"
              : " hit";
      } else if (pending === key) {
        className += " pending";
      } else if (canFire) {
        className += " targetable";
      }

      const clickable = canFire && !record && pending === null;
      cells.push(
        <button
          key={key}
          type="button"
          className={className}
          title={label}
          aria-label={label}
          disabled={!clickable}
          onClick={() => {
            setPending(key);
            onFire(coord);
          }}
        />,
      );
    }
    rows.push(
      <div key={row} className="board-row">
        <span className="row-label">{row + 1}</span>
        {cells}
      </div>,
    );
  }

  const colLabels = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    colLabels.push(
      <span key={col} className="col-label">
        {String.fromCharCode(65 + col)}
      </span>,
    );
  }

  return (
    <div className={canFire ? "board targeting your-turn" : "board targeting"}>
      <div className="board-row">
        <span className="row-label" />
        {colLabels}
      </div>
      {rows}
    </div>
  );
}
