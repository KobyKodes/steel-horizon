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

// Exported so 05-03's GameSceneAdapter (via SceneRoot) can type its
// per-frame shellFocus tracker's output without redefining this shape.
export interface ViewConfig {
  position: [number, number, number];
  lookAt: [number, number, number];
}

const VIEWS: Record<CameraView, ViewConfig> = {
  // Both views tightened + centered in 04-07 (user feedback: grid/ships
  // read too small, and the grid sat low in the frame). The lookAt z
  // values are solved numerically so the grid's near/far edges (z ±19.7 at
  // altitude 1.8) project to symmetric NDC y (~±0.77) — the grid is
  // vertically centered with margin on all sides in every consumer
  // (placement, both battle views, the smaller side/post-game reveal
  // boards) — verified via headless screenshots of each.
  fleet: {
    position: [0, 48, 22],
    lookAt: [0, 0, 2],
  },
  // Overhead like the fleet view (user feedback: the enemy grid should be
  // viewable from above just like your own fleet), but slightly higher and
  // more top-down — flatter perspective suits aiming at cells, and the
  // small framing difference keeps the damped view toggle reading as a
  // camera move rather than an instant content swap.
  targeting: {
    position: [0, 56, 14],
    lookAt: [0, 0, 1],
  },
};

// Damping smoothing time constant (seconds). Smaller = snappier. Tuned so
// a full view switch reads as substantially complete in ~0.5s while still
// decelerating smoothly into the target (damp is exponential, so it never
// mathematically reaches 0 — "substantially complete" is what's verified).
const DAMP_SMOOTH_TIME = 0.22;

// Screen shake tuning (05-01). Shake is a small additive offset to
// camera.position applied AFTER camera.lookAt() each frame — never a
// direct mutation of camera.rotation, which is what made drei's
// <CameraShake> fight this rig's lookAt-driven rotation (05-RESEARCH.md
// Pitfall 1). Intensity decays toward 0 via the same MathUtils.damp
// pattern used for view transitions, so decay speed is frame-rate
// independent.
const SHAKE_MAGNITUDE = 0.6; // world units of offset at intensity 1
const SHAKE_DECAY_SMOOTH_TIME = 0.5; // seconds; intensity settles within a few seconds

// Module-level shake intensity, mutated by triggerCameraShake and decayed
// inside CameraRig's own useFrame. A plain module-level primitive (not a
// ref/imperative handle) keeps CameraRig a plain component callable the
// same way by existing consumers (SceneRoot renders `<CameraRig view={view} />`
// with no ref today) — 05-03 imports triggerCameraShake directly instead.
let shakeIntensity = 0;

/** Triggers a decaying camera shake. Overlapping triggers take the max
 * intensity rather than stacking additively, so a second impact during an
 * existing shake doesn't runaway-amplify. */
export function triggerCameraShake(intensity: number): void {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

export interface CameraRigProps {
  view: CameraView;
  /**
   * Optional live-updating focus target, e.g. a shell in flight (05-03).
   * When set, the camera damps toward this position/lookAt every frame
   * instead of the named `view`'s static config. This is NOT a third
   * `CameraView` — a static VIEWS entry can't represent a moving target;
   * the caller recomputes shellFocus every frame while it's active.
   * Always damps, never snaps, even on the frame it first becomes non-null.
   */
  shellFocus?: ViewConfig | null;
}

/** Smoothly transitions the R3F default camera between named view configs. */
export function CameraRig({ view, shellFocus }: CameraRigProps) {
  const { camera } = useThree();
  const lookAtTarget = useRef(new Vector3(...VIEWS.targeting.lookAt));
  const initialized = useRef(false);

  useFrame((_state, delta) => {
    const config = shellFocus ?? VIEWS[view];

    if (!initialized.current) {
      // Snap to the initial named view on first frame rather than damping
      // in from an arbitrary starting camera position. Always snaps to
      // VIEWS[view] (never shellFocus) — shellFocus is a per-frame chase
      // target expected to update continuously once active, so it should
      // only ever be damped toward, never snapped to.
      camera.position.set(...VIEWS[view].position);
      lookAtTarget.current.set(...VIEWS[view].lookAt);
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

    // Shake is applied here, after lookAt() has set rotation from the
    // (undisturbed) lookAtTarget — a position-only nudge reads as shake
    // without ever touching camera.rotation directly.
    if (shakeIntensity > 0.001) {
      camera.position.x += (Math.random() * 2 - 1) * shakeIntensity * SHAKE_MAGNITUDE;
      camera.position.y += (Math.random() * 2 - 1) * shakeIntensity * SHAKE_MAGNITUDE;
      shakeIntensity = MathUtils.damp(
        shakeIntensity,
        0,
        1 / SHAKE_DECAY_SMOOTH_TIME,
        delta,
      );
    } else if (shakeIntensity !== 0) {
      shakeIntensity = 0;
    }
  });

  return null;
}
