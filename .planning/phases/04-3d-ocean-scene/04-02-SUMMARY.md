---
phase: 04-3d-ocean-scene
plan: 02
subsystem: 3d-scene
tags: [react-three-fiber, three.js, extrude-geometry, gerstner-waves, procedural-ships]

# Dependency graph
requires:
  - phase: 04-3d-ocean-scene (plan 04-01)
    provides: waves.ts (shared Gerstner wave math), Ocean.tsx shader, SceneRoot Canvas wrapper, /?dev=scene sandbox route
provides:
  - Parameterized procedural <ShipModel shipClass=...> builder (ShipHull.tsx) covering all 5 classes from one component — extruded hull with pointed bow/tapered stern, class-driven turrets/radar/flat deck/conning tower
  - Ship class dimension tables (ShipClasses.ts) derived from shared SHIP_LENGTHS, with explicit KEEL_DEPTH/DECK_LINE waterline constants
  - FleetShips.tsx wave-synced flotation — gerstnerHeight sampling for bob plus finite-difference pitch/roll, driven by the same frame clock as the ocean shader
  - Sandbox showing all 5 classes floating on the animated ocean at /?dev=scene
affects: [04-03..04-05 (scene composition), 04-06 (places ShipModel at real game positions and removes sandbox)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One parameterized builder per procedural asset family (ShipModel keyed on ShipClassId), never N hand-authored one-off components; all geometries/materials built in useMemo keyed on the class"
    - "Ocean shader time and ship wave-sampling time must read the SAME shared frame clock (clock.elapsedTime) — independently accumulated deltas desync water from ships"
    - "Waterline placement uses explicit named constants (KEEL_DEPTH fraction below waterline, DECK_LINE above), not ad-hoc nudges; wave steepness is tuned so summed crest amplitude stays below the smallest hull's freeboard"

key-files:
  created:
    - client/src/scene/ships/ShipClasses.ts
    - client/src/scene/ships/ShipHull.tsx
    - client/src/scene/ships/FleetShips.tsx
  modified:
    - client/src/dev/SceneSandbox.tsx
    - client/src/scene/SceneRoot.tsx
    - client/src/scene/Ocean.tsx
    - client/src/scene/waves.ts

key-decisions:
  - "Hull built via THREE.Shape + ExtrudeGeometry (quadraticCurveTo bow, tapered stern, beveled cross-section) per 04-RESEARCH.md Pattern 2; superstructure/turrets/radar composed from Box/Cylinder/Cone primitives positioned by class spec"
  - "Class proportions are relative multipliers off shared SHIP_LENGTHS from @steel-horizon/shared, not absolute grid-cell assumptions"
  - "Pitch/roll from finite-difference gerstnerHeight sampling at small offsets along local length/beam axes — no independent sine approximation"
  - "Explicit waterline constants: keel sits 40% of draft below the waterline, deck line at 1.1 drafts above it — replaces an ad-hoc +0.3*draft nudge that misread ExtrudeGeometry's actual y-span (bevel extends past both extrude faces)"
  - "Ocean uTime and FleetShips both read clock.elapsedTime — Ocean previously accumulated its own delta, desyncing by the pre-first-frame gap"
  - "Wave steepness calmed (0.15/0.10/0.08 → 0.11/0.07/0.05) and the two shortest classes' draft ratios raised so trough-riding ships never vanish behind neighboring crests"

patterns-established:
  - "Procedural asset families: one component parameterized by a spec table, geometries memoized on the spec key"
  - "Anything that must agree with the ocean shader (height, time) reads waves.ts constants and the shared frame clock — verified visually across the wave cycle before approval"

# Metrics
duration: ~95min (2 auto tasks + human-verify checkpoint with 2 fix iterations)
completed: 2026-07-04
---

# Phase 4, Plan 2: Procedural Ships & Wave-Synced Flotation Summary

**One parameterized `<ShipModel>` builder producing all 5 distinct ship classes via ExtrudeGeometry hulls, floating on the 04-01 ocean with shared-clock Gerstner bob/pitch/roll — checkpoint-approved after two real flotation bug fixes**

## Performance

- **Duration:** ~95 min (first task commit 20:41, final fix 22:15, then approval)
- **Tasks:** 2 auto tasks + 1 human-verify checkpoint (approved after 2 fix iterations)
- **Files modified:** 7

## Accomplishments
- `ShipClasses.ts`: `Record<ShipClassId, ShipClassSpec>` deriving relative length/beam/draft/turretCount/hasRadar/hasFlatDeck from shared `SHIP_LENGTHS` — Carrier longest/widest flat deck, Battleship/Cruiser turreted, Submarine low-profile conning tower, Destroyer shortest
- `ShipHull.tsx`: single `<ShipModel shipClass=...>` component building the hull from `THREE.Shape` + `ExtrudeGeometry` (pointed bow, tapered stern, beveled cross-section) and composing deck furniture from primitives, all memoized per class — no per-frame allocation
- `FleetShips.tsx`: per-frame `gerstnerHeight` sampling for `position.y` plus finite-difference sampling at length/beam offsets for pitch/roll, using the exact `waves.ts` math the ocean shader uses
- Sandbox extended to render all 5 classes on the animated ocean; human checkpoint confirmed distinct silhouettes, continuous surface tracking with no clipping or detachment, and smooth FPS

## Task Commits

1. **Task 1: Ship class dimension tables and procedural hull builder** - `887c580` (feat)
2. **Task 2: Wave-synced bob/pitch/roll and sandbox integration** - `2f3a57c` (feat)
3. **Checkpoint fix 1: hull origin centering + freeboard/waterline offset** - `0eb65cc` (fix)
4. **Checkpoint fix 2: ships visibly float on the water surface line** - `b273312` (fix)
5. **Checkpoint: human visual verification** - approved after fix iterations

## Files Created/Modified
- `client/src/scene/ships/ShipClasses.ts` - class spec table with waterline-aware draft ratios
- `client/src/scene/ships/ShipHull.tsx` - parameterized procedural ship builder with KEEL_DEPTH/DECK_LINE constants
- `client/src/scene/ships/FleetShips.tsx` - wave-synced flotation (bob + finite-difference pitch/roll)
- `client/src/dev/SceneSandbox.tsx` - all 5 classes placed on the z=0 waterline
- `client/src/scene/SceneRoot.tsx` - camera tilted down at the water (was identity rotation staring at the horizon)
- `client/src/scene/Ocean.tsx` - uTime now reads the shared frame clock instead of accumulating its own delta
- `client/src/scene/waves.ts` - calmed steepness tuned against ship freeboard

## Decisions Made
See frontmatter key-decisions; the load-bearing ones for later plans are the shared-clock requirement (ocean shader and any wave sampler read the same `clock.elapsedTime`) and the explicit KEEL_DEPTH/DECK_LINE waterline constants.

## Deviations from Plan

Two unplanned fix commits, both driven by the human-verify checkpoint:

**1. [Checkpoint feedback] Hull double-submersion and un-centered hull overlap**
- **Found during:** Checkpoint iteration 1
- **Issue:** Hull geometry origin wasn't centered and the freeboard/waterline offset double-counted submersion, so hulls overlapped and sat wrong relative to the surface
- **Fix:** Centered hull origin; corrected freeboard/waterline offset
- **Committed in:** `0eb65cc`

**2. [Checkpoint feedback] Ships read as sunk beneath the surface**
- **Found during:** Checkpoint iteration 2 (user reported ships underwater/detached)
- **Issue:** Four compounding causes: (a) misread ExtrudeGeometry y-span — bevel extends past both extrude faces and extrude depth maps to +Y — so the ad-hoc +0.3*draft nudge was wrong; (b) deck furniture buried inside the hull (deckY = draft*0.3); (c) Ocean accumulated its own uTime delta while FleetShips sampled clock.elapsedTime, desyncing water from ships; (d) identity-rotation camera made surface-level ships read as sunk against the far waterline
- **Fix:** Explicit KEEL_DEPTH/DECK_LINE constants, deck flush with real deck line, shared frame clock, camera lookAt the water, calmed wave steepness, raised draft ratios for the two shortest classes
- **Verification:** Headless Playwright screenshots across the wave cycle — all 5 ships ride the surface line with visible freeboard in every frame; then human approval
- **Committed in:** `b273312`

**Total deviations:** 2 checkpoint-driven fixes. No scope creep — all work was making the planned behavior actually true.

## Issues Encountered
- ExtrudeGeometry's coordinate behavior (bevel extending past extrude faces, depth mapping to +Y after rotateX) contradicted the original code comments — resolved by measuring the real y-span and encoding it in named constants
- The checkpoint again proved its worth: the initial submission looked plausible in isolation but read as sunk ships to a human at the real camera angle

## Next Phase Readiness
- `<ShipModel>` is ready for 04-06 to place at real game positions; FleetShips demonstrates the sampling pattern
- Any future animated element that must agree with the water (splashes, wakes, projectiles) must read `waves.ts` + the shared frame clock
- Sandbox still active at `/?dev=scene` until 04-06 removes it

---
*Phase: 04-3d-ocean-scene*
*Completed: 2026-07-04*
