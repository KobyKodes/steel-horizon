import { SceneRoot } from "../scene/SceneRoot";
import { FleetShips, type FleetShipInstance } from "../scene/ships/FleetShips";

// Standalone full-viewport harness for isolated visual verification of the
// 3D scene across plans 04-01 through 04-05. Reached via /?dev=scene.
// Removed once the scene is wired into the real screens (plan 04-06).
//
// One instance of each of the 5 ship classes, spread out atop the 04-01
// Ocean plane, for a side-by-side silhouette + wave-sync check.
const SANDBOX_FLEET: FleetShipInstance[] = [
  { shipClass: "carrier", position: [-24, -10] },
  { shipClass: "battleship", position: [-12, 6] },
  { shipClass: "cruiser", position: [2, -6] },
  { shipClass: "submarine", position: [14, 10] },
  { shipClass: "destroyer", position: [24, -2] },
];

export function SceneSandbox() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <SceneRoot>
        <FleetShips ships={SANDBOX_FLEET} />
      </SceneRoot>
    </div>
  );
}
