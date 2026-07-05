---
phase: 04-3d-ocean-scene
plan: 03
subsystem: ui
tags: [react-three-fiber, drei, three, instancing, pointer-events]

requires:
  - phase: 04-3d-ocean-scene (04-01, 04-02)
    provides: SceneRoot/Canvas root with Ocean+SkyDome, waves.ts shared frame clock, FleetShips procedural ship rendering
provides:
  - Reusable, game-state-agnostic HoloGrid component (10x10 instanced holographic overlay)
  - Hover/click coordinate emission via onHoverCell/onSelectCell callbacks, typed on shared Coordinate
  - renderOrder convention for content layered above the transparent Ocean plane
affects: [04-04 (camera targeting view frames this grid), 04-05 (wires real shot data via cellStates), 04-06 (reveal mode), 04-07 (placement interaction reuses click-to-select)]

tech-stack:
  added: []
  patterns: ["drei <Instances>/<Instance> for repeated identical geometry (1 draw call)", "R3F built-in per-instance pointer events instead of manual THREE.Raycaster", "renderOrder ordering for transparent overlays above other transparent meshes"]

key-files:
  created: [client/src/scene/grid/HoloGrid.tsx]
  modified: [client/src/dev/SceneSandbox.tsx]

key-decisions:
  - "Grid cells are additive-blended translucent quads (not wireframe lines) to read as a projected holographic light plane consistent with Ocean.tsx's teal/cyan palette."
  - "Amber (#ffb45e) reserved exclusively for the selected/'target-lock' state — the only warm-hued departure from the all-teal scene, so a locked cell is unmistakable at a glance."
  - "GRID_ALTITUDE (1.8 world units) clears the summed Gerstner crest amplitude (~1.05 units) so wave crests never poke through the hologram."
  - "Grid instances render at renderOrder=1 so they draw after the near-opaque (alpha 0.95) Ocean plane regardless of three's transparent depth-sort order — otherwise the ocean can draw after the grid and multiply the additive glow by 0.05, washing out all cell states."

patterns-established:
  - "Transparent overlay content that must sit visually above another transparent surface sets an explicit renderOrder rather than relying on transparent-object draw order, which three does not guarantee by scene depth."

issues-created: []

duration: ~50min
completed: 2026-07-05
---

# Phase 4 Plan 3: Interactive Holographic Grid Summary

**Instanced 10x10 `<HoloGrid>` overlay (one draw call for all 100 cells) with per-cell hover/select coordinate callbacks, reusable as-is by both the future targeting board (04-05) and placement screen (04-07).**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-05
- **Tasks:** 2 auto tasks + 1 human-verify checkpoint (approved)
- **Files modified:** 2

## Accomplishments
- Built `<HoloGrid>` using drei's `<Instances>`/`<Instance>`, sized off shared `GRID_SIZE`, hovering above the ocean at a fixed altitude clear of wave crests
- Added `onHoverCell`/`onSelectCell` callbacks emitting shared `Coordinate` values, with three distinct visual cell states (dim default, bright hover, amber selected) — the component has zero game-state knowledge
- Extended the dev sandbox with a live DOM readout showing `coordToLabel` output for hover/selection, verified end-to-end with headless Playwright automation (hover sweep produced correct A1-J10 labels; clicks correctly locked/replaced selection; zero console errors)
- Found and fixed a real rendering bug during self-verification: the grid's additive glow was washed out to near-invisibility because three's transparent draw order could place the near-opaque ocean plane after the grid; fixed via explicit `renderOrder`

## Task Commits

Each task was committed atomically:

1. **Task 1: Instanced 10x10 holographic grid overlay** - `904672c` (feat)
2. **Task 2: Hover/click interaction with coordinate callbacks** - `5206b55` (feat, includes renderOrder fix found during self-verification)

**Plan metadata:** this summary + STATE.md update (docs)

## Files Created/Modified
- `client/src/scene/grid/HoloGrid.tsx` - Instanced, hoverable, clickable 10x10 grid; emits `Coordinate` only, no game-state knowledge
- `client/src/dev/SceneSandbox.tsx` - Mounts `<HoloGrid>` alongside the fleet, adds hover/selected DOM readout

## Decisions Made
- Grid rendered as additive-blended translucent quads rather than wireframe lines — reads as a projected holographic plane, matches Ocean.tsx's Fresnel-glow aesthetic more directly than line geometry would.
- Amber reserved solely for the "selected" state as the one intentional warm-color departure from the scene's teal palette (a deliberate, restrained design choice per the frontend-design skill's guidance to spend visual boldness in one place).
- `renderOrder={1}` on the grid's `<Instances>` established as the pattern any future content layered above the Ocean plane should follow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Correctness] Grid hologram invisible due to transparent draw-order interaction with Ocean**
- **Found during:** Task 2 self-verification (headless Playwright screenshot before commit)
- **Issue:** Ocean.tsx's material has `transparent: true` at `opacity: 0.95`. Three.js does not guarantee transparent-object draw order strictly by scene graph position; the ocean plane could render after the grid's additive-blended cells, multiplying their glow by (1 - 0.95) and rendering all three cell states as visually indistinguishable dark tiles.
- **Fix:** Set `renderOrder={1}` on the grid's `<Instances>` so it always draws after the Ocean plane (renderOrder default 0), which is physically correct since the grid floats above the water regardless of camera angle.
- **Files modified:** `client/src/scene/grid/HoloGrid.tsx`
- **Verification:** Re-ran the Playwright hover/click sweep and screenshot after the fix — hovered/selected cells now show clearly distinct bright cyan / amber tiles against the dim teal default grid.
- **Committed in:** `5206b55` (part of Task 2 commit)

### Deferred Enhancements

None.

---

**Total deviations:** 1 auto-fixed (rendering correctness), 0 deferred.
**Impact on plan:** Fix was necessary for the plan's own verification criteria (hover/select must be visually distinguishable); no scope creep beyond the plan's stated task boundaries.

## Issues Encountered
- The first-pass amber/cyan color choices were nearly invisible against the ocean shader's cyan gradient even before the renderOrder bug was found; brightened `COLOR_HOVERED` and bumped base cell opacity from 0.5 to 0.65 during the same self-verification pass so all three states remain legible over the moving wave gradient at any time of the animation cycle.

## Next Phase Readiness
- `HoloGrid` is fully game-state-agnostic and ready for 04-05 to layer `cellStates` (hit/miss/sunk markers) on top without touching its hover/click core.
- 04-04's targeting camera view will frame this same grid; no grid-side changes anticipated for that plan.
- Human checkpoint approved on first pass (no fix-iteration needed), continuing this phase's trend of fewer iterations as the 3D scene's shared conventions (waves.ts, renderOrder, shared Coordinate types) mature.

---
*Phase: 04-3d-ocean-scene*
*Completed: 2026-07-05*
