import { useState } from "react";
import { coordToLabel, type Coordinate } from "@steel-horizon/shared";
import { SceneRoot } from "../scene/SceneRoot";
import { FleetShips, type FleetShipInstance } from "../scene/ships/FleetShips";
import { HoloGrid } from "../scene/grid/HoloGrid";
import type { CameraView } from "../scene/camera/CameraRig";

// Standalone full-viewport harness for isolated visual verification of the
// 3D scene across plans 04-01 through 04-05. Reached via /?dev=scene.
// Removed once the scene is wired into the real screens (plan 04-06).
//
// One instance of each of the 5 ship classes, spread out atop the 04-01
// Ocean plane, for a side-by-side silhouette + wave-sync check.
// Spaced by ship center (ShipModel recenters its hull around its own local
// origin) with at least each pair's combined half-lengths of clearance, so
// the longest hulls (carrier/battleship) never overlap.
// Ships sit behind the HoloGrid footprint (grid spans roughly x/z in
// [-20, 20] around the origin the camera looks at), so the grid overlay
// and the fleet silhouettes are both fully visible without overlapping.
const SANDBOX_FLEET: FleetShipInstance[] = [
  { shipClass: "carrier", position: [-30, -32] },
  { shipClass: "battleship", position: [-14, -32] },
  { shipClass: "cruiser", position: [0, -32] },
  { shipClass: "submarine", position: [14, -32] },
  { shipClass: "destroyer", position: [28, -32] },
];

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
        <FleetShips ships={SANDBOX_FLEET} />
        <HoloGrid onHoverCell={setHoveredCell} onSelectCell={setSelectedCell} />
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
