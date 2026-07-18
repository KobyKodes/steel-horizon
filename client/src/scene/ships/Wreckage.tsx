// Persistent per-cell wreckage for a fully-sunk ship (05-04 follow-up).
// Once a ship's sinking animation completes (or it loads already-sunk),
// each grid cell it occupied keeps a small cluster of charred flotsam
// bobbing on the waves — a lasting record of the kill at exactly the cells
// the ship spanned, one cluster per cell.
//
// Colors follow the layered-realism decision (05-02): gritty charred
// grays/browns matching ParticleBurst's debris palette and ShipHull's sunk
// tints — never teal-tinted.
//
// Piece layout is DETERMINISTIC per cell (seeded by the cell's col/row), so
// re-renders, view toggles, and reconnects always reproduce the identical
// wreck field rather than reshuffling it.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Coordinate } from "@steel-horizon/shared";
import { cellToWorld } from "../grid/gridCoords";
import { gerstnerHeight } from "../waves";

// Shared geometries/materials — every wreck cluster is visually identical
// raw material, so these are module-level singletons (cheaper than
// ShipHull's per-class useMemo tables; there's nothing to key on).
const plankGeometry = new THREE.BoxGeometry(1.6, 0.12, 0.5);
const chunkGeometry = new THREE.TetrahedronGeometry(0.55);
const stubGeometry = new THREE.BoxGeometry(0.55, 0.3, 0.55);

const charMaterial = new THREE.MeshStandardMaterial({
  color: "#2b2622",
  roughness: 0.95,
});
const scorchedHullMaterial = new THREE.MeshStandardMaterial({
  color: "#3a2426",
  roughness: 0.9,
});

/** Deterministic [0,1) noise from a cell coordinate + salt. */
function seeded(col: number, row: number, salt: number): number {
  const s = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

interface WreckPiece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Offset from the cell center, world units (stays well inside the cell). */
  dx: number;
  dz: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  /** Phase offset so pieces don't rock in lockstep. */
  phase: number;
  scale: number;
}

const PIECE_SHAPES: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}[] = [
  { geometry: plankGeometry, material: charMaterial },
  { geometry: chunkGeometry, material: scorchedHullMaterial },
  { geometry: stubGeometry, material: charMaterial },
];

function CellWreckage({ cell }: { cell: Coordinate }) {
  const groupRef = useRef<THREE.Group>(null);
  const [x, z] = cellToWorld(cell);

  const pieces: WreckPiece[] = useMemo(
    () =>
      PIECE_SHAPES.map((shape, i) => ({
        ...shape,
        dx: (seeded(cell.col, cell.row, i * 3 + 1) - 0.5) * 2.2,
        dz: (seeded(cell.col, cell.row, i * 3 + 2) - 0.5) * 2.2,
        yaw: seeded(cell.col, cell.row, i * 3 + 3) * Math.PI * 2,
        tiltX: (seeded(cell.col, cell.row, i * 5 + 4) - 0.5) * 0.5,
        tiltZ: (seeded(cell.col, cell.row, i * 5 + 5) - 0.5) * 0.5,
        phase: seeded(cell.col, cell.row, i * 7 + 6) * Math.PI * 2,
        scale: 0.75 + seeded(cell.col, cell.row, i * 11 + 7) * 0.5,
      })),
    [cell.col, cell.row],
  );

  // Each piece rides the live water surface at ITS OWN offset position (the
  // same gerstnerHeight/waves.ts source everything else samples — per the
  // 04-02 shared-clock rule), plus a gentle independent rock so the debris
  // reads as loose flotsam rather than a rigid raft.
  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    group.children.forEach((child, i) => {
      const p = pieces[i];
      if (!p) return;
      child.position.y = gerstnerHeight(x + p.dx, z + p.dz, t) + 0.05;
      child.rotation.x = p.tiltX + Math.sin(t * 0.9 + p.phase) * 0.09;
      child.rotation.z = p.tiltZ + Math.cos(t * 0.7 + p.phase) * 0.09;
    });
  });

  return (
    <group ref={groupRef}>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geometry}
          material={p.material}
          position={[x + p.dx, 0, z + p.dz]}
          rotation={[p.tiltX, p.yaw, p.tiltZ]}
          scale={p.scale}
        />
      ))}
    </group>
  );
}

export interface ShipWreckageProps {
  /** The sunk ship's occupied cells — one wreck cluster per cell. */
  cells: Coordinate[];
}

/** Floating wreckage field covering every cell a sunk ship occupied. */
export function ShipWreckage({ cells }: ShipWreckageProps) {
  return (
    <>
      {cells.map((cell) => (
        <CellWreckage key={`${cell.col},${cell.row}`} cell={cell} />
      ))}
    </>
  );
}
