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

// Waterline placement. The extruded+beveled hull body spans local Y in
// [-0.25 * draft, +1.25 * draft] once rotated flat (bevelThickness adds
// 0.25 * draft beyond BOTH extrude faces). We shift it so KEEL_DEPTH of
// hull height sits below y=0 (the resting waterline) and the remainder
// rides above as visible freeboard — a floating ship, not a submerged or
// perched one.
const KEEL_DEPTH = 0.4; // fraction of draft below the waterline
const HULL_Y_MIN_RAW = -0.25; // pre-translate hull bottom, in drafts
const HULL_Y_MAX_RAW = 1.25; // pre-translate hull top (deck line), in drafts
const HULL_Y_SHIFT = -KEEL_DEPTH - HULL_Y_MIN_RAW; // = -0.15 drafts
/** Deck line height above the waterline, in multiples of draft. */
export const DECK_LINE = HULL_Y_MAX_RAW + HULL_Y_SHIFT; // = 1.1 drafts

const HULL_COLOR = "#5b6470";
const DECK_COLOR = "#3f4650";
const SUPERSTRUCTURE_COLOR = "#7a828c";
const RADAR_COLOR = "#c9d6de";

// Sunk-ship damage tint: a simple darkened, rust-red-shifted color swap
// (no geometry change, no sinking animation — that's Phase 5 scope).
const HULL_COLOR_SUNK = "#3a2426";
const DECK_COLOR_SUNK = "#2a1c1e";
const SUPERSTRUCTURE_COLOR_SUNK = "#4a2e30";

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
  // length along local X, draft (height) along local Y, beam along the
  // world Z axis. rotateX(-PI/2) maps the extrude axis to +Y, so the hull
  // body (including bevels) spans y in [HULL_Y_MIN_RAW, HULL_Y_MAX_RAW]
  // drafts. Shift it down so KEEL_DEPTH of the hull sits below the
  // waterline (y=0) and the deck line lands at DECK_LINE drafts above it.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, draft * HULL_Y_SHIFT, 0);

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

export function ShipModel({
  shipClass,
  sunk = false,
}: {
  shipClass: ShipClassId;
  /** Renders the hull/deck/superstructure with a dimmed damage tint. */
  sunk?: boolean;
}) {
  const spec = SHIP_CLASSES[shipClass];

  const hullGeometry = useMemo(() => buildHullGeometry(spec), [spec]);
  const hullMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: sunk ? HULL_COLOR_SUNK : HULL_COLOR,
      }),
    [sunk],
  );
  const deckMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: sunk ? DECK_COLOR_SUNK : DECK_COLOR,
      }),
    [sunk],
  );
  const superstructureMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: sunk ? SUPERSTRUCTURE_COLOR_SUNK : SUPERSTRUCTURE_COLOR,
      }),
    [sunk],
  );

  const { length, beam, draft, turretCount, hasRadar, hasFlatDeck } = spec;
  // The hull's top (deck line) sits at y = draft * DECK_LINE, so the deck
  // plate, superstructure, and turrets sit flush with that line instead of
  // being buried inside the hull body.
  const deckY = draft * DECK_LINE;
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
    // Everything above is built stern-at-0/bow-at-length; recenter so the
    // model's own local origin (what FleetShips positions in world space)
    // is the ship's midpoint, not its stern. Without this, placing ships
    // by "position" causes neighboring hulls to overlap by up to a full
    // ship length.
    <group position={[-length / 2, 0, 0]}>
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
