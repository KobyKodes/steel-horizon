import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { ShipClassId } from "@steel-horizon/shared";
import { ShipModel } from "./ShipHull";
import { gerstnerHeight } from "../waves";

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
}

function FloatingShip({ shipClass, position }: FloatingShipProps) {
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
    <group ref={groupRef} position={[x, 0, z]}>
      <ShipModel shipClass={shipClass} />
    </group>
  );
}

export interface FleetShipInstance {
  shipClass: ShipClassId;
  position: [number, number];
}

/** Renders a set of floating ships, each independently tracking the ocean surface. */
export function FleetShips({ ships }: { ships: FleetShipInstance[] }) {
  return (
    <>
      {ships.map((ship, i) => (
        <FloatingShip
          key={`${ship.shipClass}-${i}`}
          shipClass={ship.shipClass}
          position={ship.position}
        />
      ))}
    </>
  );
}
