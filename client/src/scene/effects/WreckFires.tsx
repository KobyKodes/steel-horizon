// WreckFires — looping comic fire + smoke stamps on every cell of a sunk
// ship. Same visual vocabulary as HoloGrid's shot markers (flat ink-outlined
// shapes on the grid plane, deterministic per-cell stamp tilts) but ALIVE:
// the flame flickers and wobbles, and three smoke puffs per cell grow,
// drift, and fade on staggered loops. Reads clearly under the near-top-down
// CameraRig views, where upright billboards would collapse to slivers.
//
// Purely presentational: takes the sunk-cell Coordinates and renders — no
// game state, mirroring HoloGrid's "render whatever it's handed" contract.
// Cell count is bounded by the fleet (17 cells), so plain per-cell meshes
// are fine; the geometries are module-level singletons shared by all cells.

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Coordinate } from "@steel-horizon/shared";
import { GRID_ALTITUDE } from "../grid/HoloGrid";
import { cellToWorld } from "../grid/gridCoords";

// Comic fire palette on an ink under-shape — flame reds sit between the
// grid's hit-yellow (#ffd21f) and sunk-red (#ff2e3f) so a burning wreck
// reads as the aftermath of those markers, not a new color system.
const COLOR_INK = "#10131a";
const COLOR_FLAME = "#ff7a1a";
const COLOR_FLAME_CORE = "#ffd21f";
const COLOR_SMOKE = "#3a4552";

/** Wavy-edged comic flame: alternating outer tongues and inner notches,
 *  taller than wide so the flicker wobble reads as licking fire. */
function flameGeometry(scale: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const tongues = 5;
  for (let i = 0; i < tongues * 2; i++) {
    const angle = (i / (tongues * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = (i % 2 === 0 ? 1 : 0.52) * scale;
    const x = Math.cos(angle) * radius * 0.8;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// Shared geometries — one of each, reused by every burning cell.
const GEO_FLAME_INK = flameGeometry(1.55);
const GEO_FLAME = flameGeometry(1.25);
const GEO_FLAME_CORE = flameGeometry(0.62);
const GEO_SMOKE_PUFF = new THREE.CircleGeometry(0.7, 20);

/** Stable pseudo-random phase (radians) per cell so neighboring fires
 *  never flicker in lockstep — same trick as HoloGrid's stampTilt. */
function cellPhase(cell: Coordinate): number {
  return ((cell.col * 11 + cell.row * 17) % 16) * 0.39;
}

const SMOKE_PUFFS_PER_CELL = 3;
/** Seconds for one grow-drift-fade smoke loop. */
const SMOKE_LOOP_SECONDS = 2.4;
/** Local-units the puff drifts over one loop (local +y = world -z, the top
 *  of the canvas under both camera views — reads as smoke trailing away). */
const SMOKE_DRIFT = 2.6;

function opaqueBasic(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** One burning cell: flickering flame stack + looping smoke puffs. */
function CellFire({ cell }: { cell: Coordinate }) {
  const phase = cellPhase(cell);
  const [x, z] = cellToWorld(cell);

  const flameRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const puffRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Per-cell materials (opacity is animated per puff, so these can't be
  // module-level singletons like the geometries).
  const materials = useMemo(
    () => ({
      ink: opaqueBasic(COLOR_INK, 0.9),
      flame: opaqueBasic(COLOR_FLAME, 0.95),
      core: opaqueBasic(COLOR_FLAME_CORE, 0.95),
      puffs: Array.from({ length: SMOKE_PUFFS_PER_CELL }, () =>
        opaqueBasic(COLOR_SMOKE, 0),
      ),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;

    // Flame flicker: fast scale pulse + slower rotation wobble. Two
    // incommensurate frequencies so the loop never visibly repeats.
    const flame = flameRef.current;
    if (flame) {
      const pulse = 1 + Math.sin(t * 9.7) * 0.1 + Math.sin(t * 5.3) * 0.07;
      flame.scale.setScalar(pulse);
      flame.rotation.z = Math.sin(t * 3.1) * 0.16;
    }
    // Core flickers against the flame for an inner-glow shimmer.
    const core = coreRef.current;
    if (core) {
      const coreScale = 1 + Math.sin(t * 12.4 + 1.3) * 0.18;
      core.scale.setScalar(coreScale);
    }

    // Smoke puffs: staggered thirds of the same loop. Each cycle a puff
    // starts small and dim at the flame, grows while drifting up-canvas,
    // and fades out — an ever-rising smoke column from a top-down view.
    for (let i = 0; i < SMOKE_PUFFS_PER_CELL; i++) {
      const puff = puffRefs.current[i];
      const material = materials.puffs[i];
      if (!puff || !material) continue;
      const cycle =
        ((t / SMOKE_LOOP_SECONDS + i / SMOKE_PUFFS_PER_CELL) % 1 + 1) % 1;
      puff.position.y = 0.9 + cycle * SMOKE_DRIFT;
      puff.position.x = Math.sin(t * 1.7 + i * 2.1) * 0.35;
      puff.scale.setScalar(0.5 + cycle * 1.4);
      // Quick fade-in, long fade-out.
      material.opacity = (cycle < 0.15 ? cycle / 0.15 : 1 - (cycle - 0.15) / 0.85) * 0.55;
    }
  });

  return (
    <group position={[x, -z, 0]}>
      {/* Smoke behind the flame so tongues stay crisp over the puffs. */}
      {Array.from({ length: SMOKE_PUFFS_PER_CELL }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            puffRefs.current[i] = mesh;
          }}
          geometry={GEO_SMOKE_PUFF}
          material={materials.puffs[i]}
          renderOrder={4}
          raycast={() => null}
        />
      ))}
      <group ref={flameRef}>
        <mesh
          geometry={GEO_FLAME_INK}
          material={materials.ink}
          position={[0, 0, 0.004]}
          renderOrder={5}
          raycast={() => null}
        />
        <mesh
          geometry={GEO_FLAME}
          material={materials.flame}
          position={[0, 0, 0.008]}
          renderOrder={6}
          raycast={() => null}
        />
        <mesh
          ref={coreRef}
          geometry={GEO_FLAME_CORE}
          material={materials.core}
          position={[0, 0.12, 0.012]}
          renderOrder={7}
          raycast={() => null}
        />
      </group>
    </group>
  );
}

export interface WreckFiresProps {
  /** Cells of sunk ships to set ablaze. */
  cells: Coordinate[];
}

export function WreckFires({ cells }: WreckFiresProps) {
  if (cells.length === 0) return null;
  return (
    // Same rotated-flat grid-plane group as HoloGrid/GhostCells: local +y
    // maps to world -z. Floats just above the sunk markers (z offsets on
    // the meshes stack above the markers' 0.01).
    <group position={[0, GRID_ALTITUDE + 0.1, 0]} rotation-x={-Math.PI / 2}>
      {cells.map((cell) => (
        <CellFire key={`${cell.col},${cell.row}`} cell={cell} />
      ))}
    </group>
  );
}
