import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, MathUtils } from "three";

// Camera rig driven purely by a `view` prop — no external animation
// library (per 04-RESEARCH.md Pattern 3, which explicitly rules out
// GSAP/Theatre.js for a simple two-state transition). Damps both the
// camera's position and its look-at target toward the active view's
// config every frame, using elapsed delta time so the transition speed
// is frame-rate independent.
//
// `fleetView`: a wide, high overlooking angle framing the 5-ship row from
// 04-02 (ships sit around z=-32, spread roughly x=[-30, 28]).
// `targetingView`: matches SceneRoot's prior static default — close over
// the origin, where 04-03's HoloGrid (altitude 1.8, spanning roughly
// x/z=[-18, 18]) sits.
export type CameraView = "fleet" | "targeting";

interface ViewConfig {
  position: [number, number, number];
  lookAt: [number, number, number];
}

const VIEWS: Record<CameraView, ViewConfig> = {
  fleet: {
    position: [0, 46, 6],
    lookAt: [-1, 0, -32],
  },
  targeting: {
    position: [0, 20, 52],
    lookAt: [0, 0, 0],
  },
};

// Damping smoothing time constant (seconds). Smaller = snappier. Tuned so
// a full view switch reads as substantially complete in ~0.5s while still
// decelerating smoothly into the target (damp is exponential, so it never
// mathematically reaches 0 — "substantially complete" is what's verified).
const DAMP_SMOOTH_TIME = 0.22;

export interface CameraRigProps {
  view: CameraView;
}

/** Smoothly transitions the R3F default camera between named view configs. */
export function CameraRig({ view }: CameraRigProps) {
  const { camera } = useThree();
  const lookAtTarget = useRef(new Vector3(...VIEWS.targeting.lookAt));
  const initialized = useRef(false);

  useFrame((_state, delta) => {
    const config = VIEWS[view];

    if (!initialized.current) {
      // Snap to the initial view on first frame rather than damping in
      // from an arbitrary starting camera position.
      camera.position.set(...config.position);
      lookAtTarget.current.set(...config.lookAt);
      initialized.current = true;
    } else {
      camera.position.x = MathUtils.damp(
        camera.position.x,
        config.position[0],
        1 / DAMP_SMOOTH_TIME,
        delta,
      );
      camera.position.y = MathUtils.damp(
        camera.position.y,
        config.position[1],
        1 / DAMP_SMOOTH_TIME,
        delta,
      );
      camera.position.z = MathUtils.damp(
        camera.position.z,
        config.position[2],
        1 / DAMP_SMOOTH_TIME,
        delta,
      );

      lookAtTarget.current.x = MathUtils.damp(
        lookAtTarget.current.x,
        config.lookAt[0],
        1 / DAMP_SMOOTH_TIME,
        delta,
      );
      lookAtTarget.current.y = MathUtils.damp(
        lookAtTarget.current.y,
        config.lookAt[1],
        1 / DAMP_SMOOTH_TIME,
        delta,
      );
      lookAtTarget.current.z = MathUtils.damp(
        lookAtTarget.current.z,
        config.lookAt[2],
        1 / DAMP_SMOOTH_TIME,
        delta,
      );
    }

    camera.lookAt(lookAtTarget.current);
  });

  return null;
}
