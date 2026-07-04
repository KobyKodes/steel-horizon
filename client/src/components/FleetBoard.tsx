// FleetBoard — a fleet plus the shots taken against it. Read-only.
//
// Takes fleet/shots as props (rather than reading the store) so the
// post-game reveal can reuse it for the opponent's true fleet
// (`revealedOpponentFleet` + `yourShots`).

import {
  GRID_SIZE,
  cellsForPlacement,
  coordToLabel,
  type Coordinate,
  type FleetPlacement,
  type ShipClassId,
  type ShotRecord,
} from "@steel-horizon/shared";

interface FleetBoardProps {
  fleet: FleetPlacement | null;
  /** Shots fired AT this fleet. */
  shots: ShotRecord[];
}

function cellKey(coord: Coordinate): string {
  return `${coord.col},${coord.row}`;
}

export default function FleetBoard({ fleet, shots }: FleetBoardProps) {
  const shipByCell = new Map<string, ShipClassId>();
  for (const placement of fleet ?? []) {
    for (const cell of cellsForPlacement(placement)) {
      shipByCell.set(cellKey(cell), placement.ship);
    }
  }

  const shotByCell = new Map<string, ShotRecord>();
  for (const shot of shots) {
    shotByCell.set(cellKey(shot.target), shot);
  }

  const rows = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const cells = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const coord: Coordinate = { col, row };
      const key = cellKey(coord);
      const ship = shipByCell.get(key);
      const shot = shotByCell.get(key);

      let className = "cell";
      if (ship) className += " ship";
      if (shot) className += shot.result === "miss" ? " miss" : " hit";

      cells.push(
        <div key={key} className={className} title={coordToLabel(coord)} />,
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
    <div className="board fleet">
      <div className="board-row">
        <span className="row-label" />
        {colLabels}
      </div>
      {rows}
    </div>
  );
}
