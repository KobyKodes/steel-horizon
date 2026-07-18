// Additive sinking transform for a destroyed ship (05-04). 05-CONTEXT.md is
// explicit that sinking should read as dramatic & gradual — a list, then a
// slide under the waves over several seconds — not the previous instant
// material-tint swap (ShipHull.tsx's `sunk` boolean still handles that tint;
// this layers a physical capsize-and-submerge on top of it).
//
// Per 05-RESEARCH.md Pattern 4, this must be ADDITIVE on top of the
// wave-driven bob/pitch FleetShips.tsx already computes every frame from
// `gerstnerHeight`, never a replacement — a half-sunk ship should still
// visibly bob with the live water until it goes under, not freeze mid-list.
//
// `useSinkingTransform` is named like a hook (matching the plan's naming)
// but is a plain, side-effect-free function — no useState/useRef/useEffect
// inside it — so it's safe to call from anywhere, including inside another
// component's `useFrame` callback (not just component render bodies).

/** Total duration of the list-and-submerge sequence, in seconds. Tuned to
 * read as "gradual" per 05-CONTEXT.md without dragging the pace of play. */
const SINK_DURATION_SECONDS = 5;

/** Maximum additive roll (list) angle at full submersion, in radians (~40°). */
const MAX_LIST_ANGLE = (Math.PI / 180) * 40;

/** Maximum additive downward Y offset at full submersion, in world units.
 * Comfortably clears the tallest hull's deck/superstructure/radar profile
 * (~3 units, see ShipHull.tsx/ShipClasses.ts) plus wave amplitude, so the
 * ship is fully hidden beneath the surface well before this transform
 * reports `submerged`. */
const MAX_Y_DROP = 8;

export interface SinkingTransform {
  /** Additive roll (list) angle, in radians. 0 when not sinking. */
  listAngle: number;
  /** Additive downward Y offset, world units (<= 0). 0 when not sinking. */
  yDrop: number;
  /** True once the sequence has fully played out — caller should stop
   * rendering the ship (it's now beneath the waves). */
  submerged: boolean;
}

const NOT_SINKING: SinkingTransform = { listAngle: 0, yDrop: 0, submerged: false };

/** Ease-in cubic: slow start, accelerating — matches a real capsize, which
 * starts as a slow list and picks up speed as the hull goes under. */
function easeInCubic(t: number): number {
  return t * t * t;
}

/**
 * Given the elapsed clock time a ship started sinking at (`startedAt`,
 * `null` if not sinking) and the current scene clock time, returns the
 * additive list/drop to layer on top of the wave-driven transform.
 */
export function useSinkingTransform(
  startedAt: number | null,
  clockTime: number,
): SinkingTransform {
  if (startedAt === null) return NOT_SINKING;

  const elapsed = Math.max(0, clockTime - startedAt);
  const t = Math.min(elapsed / SINK_DURATION_SECONDS, 1);
  const eased = easeInCubic(t);

  return {
    listAngle: MAX_LIST_ANGLE * eased,
    yDrop: -MAX_Y_DROP * eased,
    submerged: t >= 1,
  };
}
