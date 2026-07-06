import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { gerstnerHeight } from "../waves";

// Reusable Points-based particle burst covering every effect this phase
// needs (splash, explosion, debris) so 05-03/05-04 never hand-roll their
// own particle systems. One hand-rolled component over a VFX dependency,
// per 05-RESEARCH.md.
//
// Aesthetic direction (05-02 Task 1 checkpoint:decision, USER override —
// "layered"): explosions/smoke/debris render in realistic, gritty
// naval-war-film colors (warm orange fire, gray-black smoke/debris) rather
// than being tinted toward the scene's holographic teal/amber palette. The
// tension between that gritty realism and the existing holographic
// grid/HUD (HoloGrid, 04-03) is resolved by DEPTH, not color: the grid
// stays a separate stylized overlay layer rendered above/independent of
// these particle effects ("tactical HUD over real combat"), so none of the
// presets below borrow teal/amber. Splash is the one exception worth
// calling out — it renders as pale foam-white either way, since spray off
// real water looks the same regardless of which resolution was chosen.
export type BurstPreset = "splash" | "explosion" | "debris";

export interface ParticleBurstProps {
  preset: BurstPreset;
  /** World position where the burst spawns. */
  origin: [number, number, number];
  /** Called once the burst's lifetime elapses, so callers can unmount it. */
  onComplete?: () => void;
}

interface PresetConfig {
  count: number;
  /** Seconds until the burst fully fades and onComplete fires. */
  lifetime: number;
  color: THREE.ColorRepresentation;
  size: number;
  /** Downward acceleration in world units/s^2; 0 = weightless. */
  gravity: number;
  blending: THREE.Blending;
  /** Initial speed range (world units/s). */
  speedRange: [number, number];
  /** Initial velocity distribution. */
  spread: "cone" | "sphere";
}

// Shared, preset-keyed constants (mirrors ShipModel's per-class memoization
// pattern, 04-02): the config table itself is the memoized/shared part.
// Per-burst position/velocity buffers are per-instance state and cannot be
// shared across simultaneous bursts of the same preset.
const PRESETS: Record<BurstPreset, PresetConfig> = {
  splash: {
    count: 40,
    lifetime: 0.6,
    color: "#dce9ec",
    size: 0.35,
    gravity: 9.8,
    blending: THREE.AdditiveBlending,
    speedRange: [3, 7],
    spread: "cone",
  },
  explosion: {
    count: 80,
    lifetime: 0.8,
    color: "#ff7a1a",
    size: 0.5,
    gravity: 0,
    blending: THREE.AdditiveBlending,
    speedRange: [6, 14],
    spread: "sphere",
  },
  debris: {
    count: 30,
    lifetime: 2.5,
    color: "#2b2622",
    size: 0.4,
    gravity: 9.8,
    blending: THREE.NormalBlending,
    speedRange: [2, 6],
    spread: "sphere",
  },
};

/** Random unit vector, mostly-upward with outward horizontal spread. */
function randomConeDirection(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const upBias = 0.6 + Math.random() * 0.4; // mostly up
  const horizontal = Math.sqrt(Math.max(0, 1 - upBias * upBias));
  return new THREE.Vector3(
    Math.cos(angle) * horizontal,
    upBias,
    Math.sin(angle) * horizontal,
  );
}

/** Random unit vector uniformly distributed over the sphere. */
function randomSphereDirection(): THREE.Vector3 {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z);
}

export function ParticleBurst({
  preset,
  origin,
  onComplete,
}: ParticleBurstProps) {
  const config = PRESETS[preset];

  // Splash spawns at the live wave surface height (05-RESEARCH.md Pitfall
  // 2) rather than a fixed Y — sampled once at mount via the single source
  // of truth for wave math, never hand-rolled.
  const spawnOrigin = useMemo<[number, number, number]>(() => {
    if (preset !== "splash") return origin;
    const [x, , z] = origin;
    return [x, gerstnerHeight(x, z, performance.now() / 1000), z];
  }, [preset, origin[0], origin[1], origin[2]]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(config.count * 3); // all start at group-local origin
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [config.count]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: config.color,
        size: config.size,
        blending: config.blending,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [config.color, config.size, config.blending],
  );

  // Per-burst velocity state (cannot be shared across instances).
  const velocities = useMemo(() => {
    const v = new Float32Array(config.count * 3);
    for (let i = 0; i < config.count; i++) {
      const dir =
        config.spread === "cone" ? randomConeDirection() : randomSphereDirection();
      const speed =
        config.speedRange[0] +
        Math.random() * (config.speedRange[1] - config.speedRange[0]);
      v[i * 3] = dir.x * speed;
      v[i * 3 + 1] = dir.y * speed;
      v[i * 3 + 2] = dir.z * speed;
    }
    return v;
  }, [config]);

  const elapsedRef = useRef(0);
  const completedRef = useRef(false);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const t = elapsedRef.current;

    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const posArray = positions.array as Float32Array;

    for (let i = 0; i < config.count; i++) {
      const vi = i * 3;
      if (config.gravity > 0) {
        velocities[vi + 1]! -= config.gravity * delta;
      }
      posArray[vi]! += velocities[vi]! * delta;
      posArray[vi + 1]! += velocities[vi + 1]! * delta;
      posArray[vi + 2]! += velocities[vi + 2]! * delta;
    }
    positions.needsUpdate = true;

    material.opacity = Math.max(0, 1 - t / config.lifetime);

    if (!completedRef.current && t >= config.lifetime) {
      completedRef.current = true;
      onComplete?.();
    }
  });

  return (
    <points position={spawnOrigin} geometry={geometry} material={material} />
  );
}
