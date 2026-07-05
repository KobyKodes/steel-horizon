import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { SHIP_LENGTHS, type ShipClassId, type ShipPlacement } from "@steel-horizon/shared";
import { ShipModel } from "./ShipHull";
import { gerstnerHeight } from "../waves";
import { cellToWorld } from "../grid/gridCoords";

// Places a single ship and keeps its group's position/rotation locked to
// the ocean surface every frame. Samples the EXACT gerstnerHeight()
// function/constants Ocean.tsx's shader uses (per 04-RESEARCH.md
// Pitfall 2) — never an independent sine approximation, or the ship will
// visibly desync from the water beneath it.
//
// Pitch/roll are derived from a finite-difference slope: sample the wave
// height at small offsets along the hull's local length (pitch) and beam
// (roll) axes, then convert the height delta into a small rotation angle
// via atan2. This keeps the ship's tilt physically consistent with the
// water surface's actual local slope rather than an arbitrary wobble.
const SAMPLE_OFFSET = 1.5;

interface FloatingShipProps {
  shipClass: ShipClassId;
  position: [number, number];
  /** Yaw around Y, aligning the hull's length axis with the placement's orientation. */
  rotationY: number;
  /** Sunk ships render with a dimmed/damaged material tint (full sinking animation is Phase 5 scope). */
  sunk: boolean;
}

function FloatingShip({
  shipClass,
  position,
  rotationY,
  sunk,
}: FloatingShipProps) {
  const groupRef = useRef<Group>(null);
  const [x, z] = position;

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const time = state.clock.elapsedTime;

    const centerY = gerstnerHeight(x, z, time);
    const lengthAheadY = gerstnerHeight(x + SAMPLE_OFFSET, z, time);
    const lengthBehindY = gerstnerHeight(x - SAMPLE_OFFSET, z, time);
    const beamRightY = gerstnerHeight(x, z + SAMPLE_OFFSET, time);
    const beamLeftY = gerstnerHeight(x, z - SAMPLE_OFFSET, time);

    group.position.set(x, centerY, z);

    // Pitch (rotation around Z, tilting bow/stern) from the length-axis slope.
    group.rotation.z = Math.atan2(
      lengthAheadY - lengthBehindY,
      SAMPLE_OFFSET * 2,
    );
    // Roll (rotation around X, tilting side to side) from the beam-axis slope.
    group.rotation.x = -Math.atan2(
      beamRightY - beamLeftY,
      SAMPLE_OFFSET * 2,
    );
  });

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation-y={rotationY}>
      <ShipModel shipClass={shipClass} sunk={sunk} />
    </group>
  );
}

export interface FleetShipsProps {
  /** Real ship placements — positioned via the shared `cellToWorld` mapping. */
  placements: ShipPlacement[];
  /** Ships to render with a damaged material tint. */
  sunkShips?: ShipClassId[];
}

/** Renders a fleet's ships, each independently tracking the ocean surface. */
export function FleetShips({ placements, sunkShips }: FleetShipsProps) {
  const sunkSet = new Set(sunkShips ?? []);

  return (
    <>
      {placements.map((placement, i) => {
        // ShipModel recenters its hull around its own local origin
        // (midpoint, not stern), so position at the placement's occupied
        // *center* cell — not its origin (first) cell — or the ship
        // renders shifted half its length off its actual grid footprint.
        const length = SHIP_LENGTHS[placement.ship];
        const centerOffset = (length - 1) / 2;
        const center =
          placement.orientation === "horizontal"
            ? {
                col: placement.origin.col + centerOffset,
                row: placement.origin.row,
              }
            : {
                col: placement.origin.col,
                row: placement.origin.row + centerOffset,
              };
        const [x, z] = cellToWorld(center);
        // Ships are modeled stern-at-origin/bow-toward-local-+X. Horizontal
        // placements grow along grid columns (world +x, ship's local +X
        // already matches); vertical placements grow along grid rows
        // (world +z), so yaw the hull 90° to align its length axis there.
        const rotationY =
          placement.orientation === "horizontal" ? 0 : Math.PI / 2;
        return (
          <FloatingShip
            key={`${placement.ship}-${i}`}
            shipClass={placement.ship}
            position={[x, z]}
            rotationY={rotationY}
            sunk={sunkSet.has(placement.ship)}
          />
        );
      })}
    </>
  );
}
