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

/** Matches SkyDome's sun direction so previews shade like the real scene. */
const SUN: [number, number, number] = [40, 60, 20];

/** Direction the camera sits in from the ship; angled, not top-down. */
const EYE = new Vector3(0, 9, 7).normalize();
/** Breathing room around the fitted silhouette. */
const PAD = 1.12;

/**
 * Frames the whole rendered ship — hull, island, masts and all — in the
 * card. Fitting to the class's hull `length` alone isn't enough: the camera
 * is angled, so a tall superstructure eats vertical screen space that a
 * width-only fit doesn't account for, and the tallest classes got clipped
 * off the top of the short card. So measure what actually got built and fit
 * the projected bounds on both axes.
 *
 * Runs as a child so it mounts after ShipModel's meshes exist.
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

    // Project the corners into camera space; the extents there are what the
    // orthographic frustum has to cover.
    let halfW = 0;
    let halfH = 0;
    const corner = new Vector3();
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          halfW = Math.max(halfW, Math.abs(corner.x));
          halfH = Math.max(halfH, Math.abs(corner.y));
        }
      }
    }

    camera.zoom = Math.min(
      size.width / (halfW * 2 * PAD),
      size.height / (halfH * 2 * PAD),
    );
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
