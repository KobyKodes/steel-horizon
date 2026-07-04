// Per-class dimension and feature tables for procedural ship meshes.
//
// Values are relative multipliers off a shared base unit — NOT tied to any
// grid-cell size. `length`/`beam`/`draft` feed ShipHull.tsx's hull-shape
// and superstructure placement; they express each class's silhouette
// (Carrier longest/widest/flattest-deck, Destroyer shortest/narrowest,
// Submarine lowest-profile) rather than literal world units.

import { SHIP_LENGTHS, type ShipClassId } from "@steel-horizon/shared";

export interface ShipClassSpec {
  /** Hull length in world units (scene scale, not grid cells). */
  length: number;
  /** Hull beam (width) in world units. */
  beam: number;
  /** Hull draft (depth/height of the hull body) in world units. */
  draft: number;
  /** Number of deck turrets to place along the hull's length. */
  turretCount: number;
  /** Whether the class carries a radar/mast dish on its superstructure. */
  hasRadar: boolean;
  /** Whether the class has a flat flight deck instead of a turreted deck. */
  hasFlatDeck: boolean;
}

// Base unit scales SHIP_LENGTHS (grid-cell lengths, 2-5) up to a visually
// convincing world-space hull length; beam/draft are derived relative to
// that per-class length so proportions stay consistent across classes.
const BASE_UNIT = 3.2;

function specFor(
  shipClass: ShipClassId,
  beamRatio: number,
  draftRatio: number,
  turretCount: number,
  hasRadar: boolean,
  hasFlatDeck: boolean,
): ShipClassSpec {
  const length = SHIP_LENGTHS[shipClass] * BASE_UNIT;
  return {
    length,
    beam: length * beamRatio,
    draft: length * draftRatio,
    turretCount,
    hasRadar,
    hasFlatDeck,
  };
}

export const SHIP_CLASSES: Record<ShipClassId, ShipClassSpec> = {
  // Longest + widest, flat flight deck, no turrets.
  carrier: specFor("carrier", 0.19, 0.09, 0, true, true),
  // Multiple turrets, standard superstructure, radar mast.
  battleship: specFor("battleship", 0.15, 0.1, 3, true, false),
  // Slightly slimmer than the battleship, fewer turrets.
  cruiser: specFor("cruiser", 0.13, 0.1, 2, true, false),
  // Narrowest, lowest-profile, single conning tower, no turrets.
  // Draft ratios for the two shortest classes are proportionally higher so
  // their absolute freeboard still clears the short detail waves' chop —
  // at the original ratios their hulls were regularly awash.
  submarine: specFor("submarine", 0.09, 0.085, 0, false, false),
  // Shortest, narrow, 1-2 turrets, small mast.
  destroyer: specFor("destroyer", 0.14, 0.12, 1, false, false),
};
