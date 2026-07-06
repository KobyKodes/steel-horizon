import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import type { Mesh } from "three";

// Shell projectile: a small mesh flying start -> end along an eased
// parabolic arc, dragging a fading smoke trail, firing `onImpact` exactly
// once at flight completion. This component only owns the shell mesh +
// trail — it never touches the camera. 05-01's `shellFocus` prop on
// CameraRig (via a separate tracker, see GameSceneAdapter.tsx) is how the
// camera follows the shell; parenting the camera to the shell (or vice
// versa) would fight that damped-follow design.
//
// Per 05-RESEARCH.md Pitfall 3: perceived "cinematic" feel comes from
// easing, not raw duration — a linear lerp across the grid at a fixed
// short duration reads as too fast. `t` is eased in/out before use.

export interface ShellProjectileProps {
  start: [number, number, number];
  end: [number, number, number];
  /** Caller-supplied; must keep the whole firing sequence <=2.5s total (ROADMAP.md). */
  durationSeconds: number;
  /** Peak arc height in world units above the straight start->end lerp. */
  arcHeight?: number;
  /** Fires once, at flight completion, with the final world position. */
  onImpact: (impactPosition: [number, number, number]) => void;
}

const DEFAULT_ARC_HEIGHT = 5;

/** Standard ease-in-out (smoothstep-adjacent) curve for the [0,1] flight parameter. */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Parabolic position along start->end at the given eased t, per
 * 05-RESEARCH.md's standard technique: lerp the straight line, then add a
 * parabola (peaking at t=0.5) to the Y component.
 */
export function parabolicPosition(
  start: [number, number, number],
  end: [number, number, number],
  easedT: number,
  arcHeight: number,
): [number, number, number] {
  const x = start[0] + (end[0] - start[0]) * easedT;
  const y =
    start[1] +
    (end[1] - start[1]) * easedT +
    arcHeight * 4 * easedT * (1 - easedT);
  const z = start[2] + (end[2] - start[2]) * easedT;
  return [x, y, z];
}

export function ShellProjectile({
  start,
  end,
  durationSeconds,
  arcHeight = DEFAULT_ARC_HEIGHT,
  onImpact,
}: ShellProjectileProps) {
  const meshRef = useRef<Mesh>(null);
  const elapsedRef = useRef(0);
  const impactedRef = useRef(false);

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || impactedRef.current) return;

    elapsedRef.current += delta;
    const t = Math.min(elapsedRef.current / durationSeconds, 1);
    const easedT = easeInOutQuad(t);
    const pos = parabolicPosition(start, end, easedT, arcHeight);
    mesh.position.set(pos[0], pos[1], pos[2]);

    if (t >= 1) {
      impactedRef.current = true;
      onImpact(pos);
    }
  });

  return (
    <Trail
      width={1.4}
      length={6}
      decay={0.9}
      local={false}
      stride={0.1}
      interval={1}
      color="#9a9488"
      attenuation={(w) => w}
    >
      <mesh ref={meshRef} position={start} scale={[1, 1, 2.4]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#3a3a35" metalness={0.3} roughness={0.6} />
      </mesh>
    </Trail>
  );
}
