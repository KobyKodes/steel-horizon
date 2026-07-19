// Dock ship preview — the same procedural ShipModel that gets placed on the
// grid, rendered into a small standalone canvas so a dock card shows the
// actual vessel instead of an abstract run of cells.
//
// Deliberately NOT SceneRoot: no ocean, no sky, no CameraRig, no perf
// monitor. A card only needs the hull on a transparent background, so this
// mounts the bare minimum — an orthographic camera framed to the class's
// own length plus the two lights the toon materials need to shade against
// (matching SkyDome's ambient/directional pair so a previewed ship reads
// with the same palette it will have on the board).

import { Canvas } from "@react-three/fiber";
import type { ShipClassId } from "@steel-horizon/shared";
import { ShipModel } from "./ShipHull";
import { SHIP_CLASSES } from "./ShipClasses";

/** Matches SkyDome's sun direction so previews shade like the real scene. */
const SUN: [number, number, number] = [40, 60, 20];

export function ShipPreview({ shipClass }: { shipClass: ShipClassId }) {
  const { length } = SHIP_CLASSES[shipClass];
  // Frame the hull along its length with a little air at bow and stern. The
  // camera is angled rather than straight down: a pure top-down view
  // flattens the island/turrets/funnels that make each class tellable.
  const halfLength = (length / 2) * 1.18;

  return (
    <Canvas
      dpr={1}
      orthographic
      camera={{ position: [0, 9, 7], zoom: 1, near: 0.1, far: 200 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
      frameloop="demand"
      onCreated={({ camera, size }) => {
        // Fit the ship's length to the canvas width, then look at the origin
        // (ShipModel recenters itself around its own midpoint).
        camera.zoom = size.width / (halfLength * 2);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
      }}
    >
      <ambientLight intensity={0.75} color="#a9d6e5" />
      <directionalLight position={SUN} intensity={1.8} color="#ffdca8" />
      <ShipModel shipClass={shipClass} />
    </Canvas>
  );
}
