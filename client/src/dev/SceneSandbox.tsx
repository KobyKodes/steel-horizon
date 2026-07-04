import { SceneRoot } from "../scene/SceneRoot";
import { FleetShips, type FleetShipInstance } from "../scene/ships/FleetShips";
import { HoloGrid } from "../scene/grid/HoloGrid";

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

export function SceneSandbox() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <SceneRoot>
        <FleetShips ships={SANDBOX_FLEET} />
        <HoloGrid />
      </SceneRoot>
    </div>
  );
}
