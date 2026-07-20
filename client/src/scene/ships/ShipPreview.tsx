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

import { useLayoutEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Box3, OrthographicCamera, Vector3 } from "three";
import type { ShipClassId } from "@steel-horizon/shared";
import { ShipModel } from "./ShipHull";
import { SHIP_CLASSES } from "./ShipClasses";

/** Matches SkyDome's sun direction so previews shade like the real scene. */
const SUN: [number, number, number] = [40, 60, 20];

/** Direction the camera sits in from the ship; angled, not top-down. */
const EYE = new Vector3(0, 9, 7).normalize();
/** Breathing room around the fitted silhouette. */
const PAD = 1.12;

/**
 * World length of the longest class. Every card is scaled so this — not
 * whatever ship it happens to hold — spans the canvas, which is what makes
 * the dock previews comparable to each other.
 */
const REFERENCE_LENGTH = Math.max(
  ...Object.values(SHIP_CLASSES).map((spec) => spec.length),
);

/**
 * Scales and centres the ship in its card.
 *
 * Zoom is deliberately class-independent: fitting each ship to its own card
 * drew a 2-cell destroyer as large as a 5-cell carrier, so the dock said
 * nothing about how much room a ship needs. Pinning the scale to the
 * longest class instead means on-screen length tracks cell count — carrier
 * biggest, then battleship, cruiser and submarine level at 3 cells each,
 * destroyer smallest. Hulls lie along world x and the camera has pitch but
 * no yaw, so world x maps straight to screen x and length is all that
 * drives it.
 *
 * Centring still measures the built meshes, since ShipModel recenters on
 * x/z but not y. Runs as a child so it mounts after those meshes exist.
 */
function FitToShip({ shipClass }: { shipClass: ShipClassId }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const box = new Box3().setFromObject(scene);
    if (box.isEmpty()) return;

    // ShipModel recenters on x/z but not y, so aim at the measured centre
    // rather than the origin or the hull sits low in the card.
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length();
    camera.position.copy(center).addScaledVector(EYE, radius);
    camera.lookAt(center);
    camera.updateMatrixWorld();

    camera.zoom = size.width / (REFERENCE_LENGTH * PAD);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, scene, size.width, size.height, invalidate, shipClass]);

  return null;
}

export function ShipPreview({ shipClass }: { shipClass: ShipClassId }) {
  return (
    <Canvas
      dpr={1}
      orthographic
      camera={{ position: [0, 9, 7], zoom: 1, near: 0.1, far: 200 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
      frameloop="demand"
    >
      <ambientLight intensity={0.75} color="#a9d6e5" />
      <directionalLight position={SUN} intensity={1.8} color="#ffdca8" />
      <ShipModel shipClass={shipClass} />
      <FitToShip shipClass={shipClass} />
    </Canvas>
  );
}
