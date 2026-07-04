import { SceneRoot } from "../scene/SceneRoot";
import { FleetShips, type FleetShipInstance } from "../scene/ships/FleetShips";

// Standalone full-viewport harness for isolated visual verification of the
// 3D scene across plans 04-01 through 04-05. Reached via /?dev=scene.
// Removed once the scene is wired into the real screens (plan 04-06).
//
// One instance of each of the 5 ship classes, spread out atop the 04-01
// Ocean plane, for a side-by-side silhouette + wave-sync check.
// Spaced by ship center (ShipModel recenters its hull around its own local
// origin) with at least each pair's combined half-lengths of clearance, so
// the longest hulls (carrier/battleship) never overlap.
// Ships sit on the z=0 line the SceneRoot camera looks at, so the whole
// fleet is framed in view rather than hugging the bottom of the frustum.
const SANDBOX_FLEET: FleetShipInstance[] = [
  { shipClass: "carrier", position: [-30, 0] },
  { shipClass: "battleship", position: [-14, 0] },
  { shipClass: "cruiser", position: [0, 0] },
  { shipClass: "submarine", position: [14, 0] },
  { shipClass: "destroyer", position: [28, 0] },
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
