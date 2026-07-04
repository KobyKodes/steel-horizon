// TargetingBoard — the opponent's waters, rendered purely from `yourShots`.
//
// Untargeted cells are clickable only when it's your turn. The single piece
// of optimistic state is the just-clicked cell, disabled until the next
// snapshot arrives (the server confirms via snapshot — nothing else is
// assumed locally).

import { useEffect, useState } from "react";
import {
  GRID_SIZE,
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

/** Cells belonging to sunk ships, from the server-supplied `sunkShipCells`. */
function sunkCellsFrom(shots: ShotRecord[]): Set<string> {
  const sunk = new Set<string>();
  for (const shot of shots) {
    for (const cell of shot.sunkShipCells ?? []) {
      sunk.add(cellKey(cell));
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
  const sunkCells = sunkCellsFrom(shots);

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
