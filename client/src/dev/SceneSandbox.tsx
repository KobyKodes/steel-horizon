import { useState } from "react";
import {
  coordToLabel,
  type Coordinate,
  type ShipPlacement,
} from "@steel-horizon/shared";
import { SceneRoot } from "../scene/SceneRoot";
import { FleetShips } from "../scene/ships/FleetShips";
import { HoloGrid, type CellState } from "../scene/grid/HoloGrid";
import type { CameraView } from "../scene/camera/CameraRig";

// Standalone full-viewport harness for isolated visual verification of the
// 3D scene across plans 04-01 through 04-05. Reached via /?dev=scene.
// Removed once the scene is wired into the real screens (plan 04-06).
//
// One instance of each of the 5 ship classes, spread along a single grid
// row via the shared `cellToWorld` mapping (04-05) — the same positioning
// system HoloGrid and the real GameSceneAdapter use, so the sandbox stays
// representative of real integration rather than drifting to its own math.
const SANDBOX_FLEET: ShipPlacement[] = [
  { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 0, row: 2 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 0, row: 4 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 0, row: 6 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 0, row: 8 }, orientation: "horizontal" },
];

// Sample cellStates map for verifying HoloGrid's hit/miss/sunk marker
// rendering in isolation.
const SANDBOX_CELL_STATES = new Map<string, CellState>([
  ["3,3", "miss"],
  ["4,3", "hit"],
  ["5,3", "sunk"],
]);

const readoutStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: "8px 12px",
  background: "rgba(2, 24, 32, 0.75)",
  border: "1px solid rgba(63, 193, 214, 0.4)",
  borderRadius: 4,
  color: "#bdf1ff",
  fontFamily: "monospace",
  fontSize: 14,
  lineHeight: 1.6,
  pointerEvents: "none",
};

const viewToggleStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  padding: "8px 16px",
  background: "rgba(2, 24, 32, 0.75)",
  border: "1px solid rgba(63, 193, 214, 0.4)",
  borderRadius: 4,
  color: "#bdf1ff",
  fontFamily: "monospace",
  fontSize: 14,
  cursor: "pointer",
};

export function SceneSandbox() {
  const [hoveredCell, setHoveredCell] = useState<Coordinate | null>(null);
  const [selectedCell, setSelectedCell] = useState<Coordinate | null>(null);
  const [view, setView] = useState<CameraView>("fleet");

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <SceneRoot view={view}>
        <FleetShips placements={SANDBOX_FLEET} />
        <HoloGrid
          onHoverCell={setHoveredCell}
          onSelectCell={setSelectedCell}
          cellStates={SANDBOX_CELL_STATES}
        />
      </SceneRoot>
      <div style={readoutStyle}>
        <div>hover: {hoveredCell ? coordToLabel(hoveredCell) : "—"}</div>
        <div>selected: {selectedCell ? coordToLabel(selectedCell) : "—"}</div>
      </div>
      <button
        type="button"
        style={viewToggleStyle}
        onClick={() =>
          setView((v) => (v === "fleet" ? "targeting" : "fleet"))
        }
      >
        view: {view} (click to toggle)
      </button>
    </div>
  );
}
