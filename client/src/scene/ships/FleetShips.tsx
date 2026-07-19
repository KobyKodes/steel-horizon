import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import {
  SHIP_LENGTHS,
  cellsForPlacement,
  type Coordinate,
  type ShipClassId,
  type ShipPlacement,
} from "@steel-horizon/shared";
import { ShipModel } from "./ShipHull";
import { SHIP_CLASSES } from "./ShipClasses";
import { gerstnerHeight } from "../waves";
import { cellToWorld } from "../grid/gridCoords";
import { useSinkingTransform } from "./SinkingShip";
import { ShipWreckage } from "./Wreckage";

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

// Ships ride at the wave height sampled at their CENTER, but pitch/roll
// rotate the hull about that same center — so on a steep wave the bow and
// stern swing below the surface. On the longest hulls that end-dip exceeds
// the freeboard and the ship reads as briefly submerged. Two corrections,
// both keyed to hull size rather than a flat fudge:
//   FLOAT_LIFT_DRAFTS  extra freeboard, in multiples of the class's draft.
//   TILT_DAMPING       fraction of the true surface slope actually applied,
//                      so long hulls stay closer to level than the water is.
// The ship still visibly bobs and tilts with the water; it just stops
// burying its ends in it.
//
// The lift is per-class (USER direction): the cruiser and destroyer sit on
// proportionally deeper drafts than their hull volume suggests, so at the
// shared 0.55 they still rode noticeably low next to the rest of the fleet.
const FLOAT_LIFT_DRAFTS: Record<ShipClassId, number> = {
  carrier: 0.55,
  battleship: 0.55,
  cruiser: 2.0,
  submarine: 0.55,
  destroyer: 2.0,
};
const TILT_DAMPING = 0.55;

interface FloatingShipProps {
  shipClass: ShipClassId;
  position: [number, number];
  /** Yaw around Y, aligning the hull's length axis with the placement's orientation. */
  rotationY: number;
  /** True once this ship is fully destroyed — triggers the sinking sequence. */
  sunk: boolean;
  /**
   * True when `sunk` was already true before the OWNING ADAPTER ever
   * mounted (reconnect/refresh) — skip the sinking animation entirely and
   * render as already-submerged.
   *
   * This is deliberately a caller-supplied flag, NOT inferred from "is
   * `sunk` already true on this component's own first render": for the
   * player's own fleet, every `FloatingShip` mounts once at battle start
   * (well before any sinking), so those two things happen to coincide. But
   * an ENEMY ship's `FloatingShip` only starts existing once it's sunk at
   * all (fog of war — its placement isn't reconstructable before then), so
   * ITS own first render always has `sunk === true` whether that sinking
   * was live just now or historical from before mount. Only the caller
   * (GameSceneAdapter) knows which case it is.
   */
  historical: boolean;
  /** The placement's occupied cells — the sunk-wreckage field's footprint. */
  cells: Coordinate[];
}

function FloatingShip({
  shipClass,
  position,
  rotationY,
  sunk,
  historical,
  cells,
}: FloatingShipProps) {
  const groupRef = useRef<Group>(null);
  const [x, z] = position;
  const floatLift =
    SHIP_CLASSES[shipClass].draft * FLOAT_LIFT_DRAFTS[shipClass];

  // A fully-submerged ship leaves a persistent per-cell wreckage field in
  // its place. Historical (sunk-before-mount) ships start wrecked — they
  // skip the animation and load straight into their final state, which is
  // now floating debris rather than nothing at all.
  const [wrecked, setWrecked] = useState(historical);
  const wreckedRef = useRef(historical);

  // Set exactly once, the first frame `sunk` is observed true post-mount —
  // this is the sinking sequence's start time, read against the scene
  // clock so it survives re-renders without restarting.
  const sinkStartedAtRef = useRef<number | null>(null);

  // Random per-ship list direction so multiple simultaneous sinkings don't
  // all capsize the same way. Stable for the component's lifetime.
  const listSignRef = useRef<1 | -1>(Math.random() < 0.5 ? 1 : -1);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const time = state.clock.elapsedTime;

    if (sunk && sinkStartedAtRef.current === null) {
      sinkStartedAtRef.current = time;
    }

    const { listAngle, yDrop, submerged } = useSinkingTransform(
      sinkStartedAtRef.current,
      time,
    );

    if (submerged) {
      // Fully under — swap the hull for the persistent wreckage field
      // (setState guarded to fire exactly once; safe inside useFrame).
      group.visible = false;
      if (!wreckedRef.current) {
        wreckedRef.current = true;
        setWrecked(true);
      }
      return;
    }
    group.visible = true;

    const centerY = gerstnerHeight(x, z, time);
    const lengthAheadY = gerstnerHeight(x + SAMPLE_OFFSET, z, time);
    const lengthBehindY = gerstnerHeight(x - SAMPLE_OFFSET, z, time);
    const beamRightY = gerstnerHeight(x, z + SAMPLE_OFFSET, time);
    const beamLeftY = gerstnerHeight(x, z - SAMPLE_OFFSET, time);

    // Sinking drop is ADDITIVE on top of the live wave height, so a
    // half-sunk ship keeps bobbing with the water instead of freezing.
    group.position.set(x, centerY + floatLift + yDrop, z);

    // Pitch (rotation around Z, tilting bow/stern) from the length-axis slope.
    group.rotation.z =
      Math.atan2(lengthAheadY - lengthBehindY, SAMPLE_OFFSET * 2) * TILT_DAMPING;
    // Roll (rotation around X, tilting side to side) from the beam-axis
    // slope, plus the additive capsize list angle (undamped — the capsize
    // is meant to read as a violent, unnatural roll).
    group.rotation.x =
      -Math.atan2(beamRightY - beamLeftY, SAMPLE_OFFSET * 2) * TILT_DAMPING +
      listAngle * listSignRef.current;
  });

  // Wrecked (finished sinking, or already sunk before mount): the hull is
  // gone — render the per-cell debris field in its place instead.
  if (wrecked) return <ShipWreckage cells={cells} />;

  return (
    <group ref={groupRef} position={[x, 0, z]} rotation-y={rotationY}>
      <ShipModel shipClass={shipClass} sunk={sunk} />
    </group>
  );
}

/**
 * A placement's occupied *center* cell mapped to world [x, z] via the
 * shared `cellToWorld`. Ported out of the render loop below so
 * GameSceneAdapter (05-04) can compute the exact same world position for a
 * newly-sunk ship's debris burst without re-deriving this math.
 */
export function placementCenterWorld(placement: ShipPlacement): [number, number] {
  // ShipModel recenters its hull around its own local origin (midpoint,
  // not stern), so position at the placement's occupied *center* cell —
  // not its origin (first) cell — or the ship renders shifted half its
  // length off its actual grid footprint.
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
  return cellToWorld(center);
}

export interface FleetShipsProps {
  /** Real ship placements — positioned via the shared `cellToWorld` mapping. */
  placements: ShipPlacement[];
  /** Ships to play the dramatic sinking sequence for (see SinkingShip.tsx). */
  sunkShips?: ShipClassId[];
  /**
   * Ships in `sunkShips` that were ALREADY sunk before the owning adapter
   * mounted — these skip the animation entirely (see `FloatingShip`'s
   * `historical` prop doc for why this can't just be inferred locally).
   * Ships omitted from this set default to "not historical", i.e. animate
   * normally when/if `sunkShips` includes them — this preserves the
   * original behavior for every existing caller that doesn't pass it.
   */
  historicalSunkShips?: ShipClassId[];
}

/** Renders a fleet's ships, each independently tracking the ocean surface. */
export function FleetShips({
  placements,
  sunkShips,
  historicalSunkShips,
}: FleetShipsProps) {
  const sunkSet = new Set(sunkShips ?? []);
  const historicalSet = new Set(historicalSunkShips ?? []);

  return (
    <>
      {placements.map((placement, i) => {
        const [x, z] = placementCenterWorld(placement);
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
            historical={historicalSet.has(placement.ship)}
            cells={cellsForPlacement(placement)}
          />
        );
      })}
    </>
  );
}
