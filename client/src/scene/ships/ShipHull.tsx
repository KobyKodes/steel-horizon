import { useMemo } from "react";
import * as THREE from "three";
import type { ShipClassId } from "@steel-horizon/shared";
import { SHIP_CLASSES, type ShipClassSpec } from "./ShipClasses";

// Procedural, parameterized ship builder — one component covers all 5
// classes (per 04-RESEARCH.md Pattern 2). Hull is a THREE.Shape extruded
// along the ship's length axis (pointed bow via quadraticCurveTo, tapered
// stern); superstructure/turrets/radar/conning-tower are primitive
// geometries positioned along that same local length axis. All
// geometries/materials are constructed once via useMemo keyed on
// shipClass, never recreated per frame.

const HULL_COLOR = "#5b6470";
const DECK_COLOR = "#3f4650";
const SUPERSTRUCTURE_COLOR = "#7a828c";
const RADAR_COLOR = "#c9d6de";

function buildHullGeometry(spec: ShipClassSpec): THREE.BufferGeometry {
  const { length, beam, draft } = spec;
  const halfBeam = beam / 2;

  // Profile drawn in the shape's local XY plane: X runs along the ship's
  // length (stern at 0, bow at `length`), Y is the beam (half-width) axis.
  const shape = new THREE.Shape();
  shape.moveTo(0, -halfBeam * 0.7);
  shape.lineTo(length * 0.75, -halfBeam);
  shape.quadraticCurveTo(length, 0, length * 0.75, halfBeam);
  shape.lineTo(0, halfBeam * 0.7);
  shape.quadraticCurveTo(-length * 0.04, 0, 0, -halfBeam * 0.7);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: draft,
    bevelEnabled: true,
    bevelThickness: draft * 0.25,
    bevelSize: halfBeam * 0.12,
    bevelSegments: 2,
    curveSegments: 12,
  });

  // Shape is extruded along local Z; rotate so the hull lies flat with
  // length along local X, draft (height) along local Y, beam along Z is
  // rotated to lie along the correct beam axis, keel resting near y=0.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -draft, 0);

  return geometry;
}

function Turret({
  position,
  scale,
}: {
  position: [number, number, number];
  scale: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, scale * 0.18, 0]}>
        <cylinderGeometry args={[scale * 0.32, scale * 0.36, scale * 0.36, 8]} />
        <meshStandardMaterial color={SUPERSTRUCTURE_COLOR} />
      </mesh>
      <mesh position={[scale * 0.3, scale * 0.18, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[scale * 0.05, scale * 0.05, scale * 0.7, 8]} />
        <meshStandardMaterial color={HULL_COLOR} />
      </mesh>
    </group>
  );
}

function Radar({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 6]} />
        <meshStandardMaterial color={SUPERSTRUCTURE_COLOR} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation-x={Math.PI / 2}>
        <boxGeometry args={[0.5, 0.06, 0.14]} />
        <meshStandardMaterial color={RADAR_COLOR} />
      </mesh>
    </group>
  );
}

export function ShipModel({ shipClass }: { shipClass: ShipClassId }) {
  const spec = SHIP_CLASSES[shipClass];

  const hullGeometry = useMemo(() => buildHullGeometry(spec), [spec]);
  const hullMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: HULL_COLOR }),
    [],
  );
  const deckMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DECK_COLOR }),
    [],
  );
  const superstructureMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SUPERSTRUCTURE_COLOR }),
    [],
  );

  const { length, beam, draft, turretCount, hasRadar, hasFlatDeck } = spec;
  const deckY = draft * 0.15;
  const superstructureX = length * 0.42;

  const turretPositions = useMemo<[number, number, number][]>(() => {
    if (turretCount <= 0) return [];
    const positions: [number, number, number][] = [];
    const spread = length * 0.5;
    for (let i = 0; i < turretCount; i++) {
      const t = turretCount === 1 ? 0.5 : i / (turretCount - 1);
      positions.push([length * 0.15 + spread * t * 0.7, deckY, 0]);
    }
    return positions;
  }, [turretCount, length, deckY]);

  return (
    <group>
      {/* Hull */}
      <mesh geometry={hullGeometry} material={hullMaterial} />

      {/* Deck plate */}
      <mesh position={[length * 0.4, deckY, 0]} material={deckMaterial}>
        <boxGeometry args={[length * 0.75, draft * 0.06, beam * 0.85]} />
      </mesh>

      {hasFlatDeck ? (
        // Carrier: flat flight deck + offset island superstructure, no turrets.
        <group>
          <mesh
            position={[length * 0.55, deckY + draft * 0.12, beam * 0.25]}
            material={superstructureMaterial}
          >
            <boxGeometry
              args={[length * 0.18, draft * 1.4, beam * 0.18]}
            />
          </mesh>
          {hasRadar && (
            <Radar
              position={[
                length * 0.55,
                deckY + draft * 0.12 + draft * 0.7 + 0.45,
                beam * 0.25,
              ]}
            />
          )}
        </group>
      ) : (
        <>
          {/* Standard superstructure block */}
          <mesh
            position={[superstructureX, deckY + draft * 0.7, 0]}
            material={superstructureMaterial}
          >
            <boxGeometry args={[length * 0.16, draft * 1.4, beam * 0.5]} />
          </mesh>

          {/* Conning tower for submarines (no turrets, single tower) */}
          {shipClass === "submarine" && (
            <mesh
              position={[0, deckY + draft * 1.1, 0]}
              material={superstructureMaterial}
            >
              <boxGeometry args={[length * 0.1, draft * 1.6, beam * 0.4]} />
            </mesh>
          )}

          {hasRadar && (
            <Radar
              position={[
                superstructureX,
                deckY + draft * 0.7 + draft * 0.7 + 0.45,
                0,
              ]}
            />
          )}

          {turretPositions.map((pos, i) => (
            <Turret key={i} position={pos} scale={beam * 0.4} />
          ))}
        </>
      )}
    </group>
  );
}
