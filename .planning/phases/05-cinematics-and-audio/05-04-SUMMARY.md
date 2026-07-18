---
phase: 05-cinematics-and-audio
plan: 04
subsystem: ui
tags: [react-three-fiber, three, animation, vfx]

# Dependency graph
requires:
  - phase: 05-cinematics-and-audio (05-02, 05-03)
    provides: ParticleBurst (debris preset), GameSceneAdapter's incoming-shot cinematic pattern (force-flip to fleet view, presetFor/shakeFor mapping)
provides:
  - Additive, ease-in-cubic list-and-submerge sinking sequence for destroyed ships (useSinkingTransform in SinkingShip.tsx)
  - FloatingShip skip-animation-on-mount rule for ships already sunk before the component ever renders (reconnect/refresh safe)
  - GameSceneAdapter debris-burst trigger keyed off newly-sunk ship classes, reusing FleetShips' placement-to-world math via exported placementCenterWorld()
affects: [06-polish-and-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive per-frame transform layered on top of an existing per-frame transform (sinking list/drop on top of wave bob/pitch), matching 05-RESEARCH.md Pattern 4"
    - "wasSunkAtMountRef captured-once-at-mount to distinguish a live state transition from an already-true prop at first render, so history never replays on remount/reconnect"

key-files:
  created:
    - client/src/scene/ships/SinkingShip.tsx
  modified:
    - client/src/scene/ships/FleetShips.tsx
    - client/src/scene/GameSceneAdapter.tsx

key-decisions:
  - "useSinkingTransform is a plain, side-effect-free function (no internal useState/useRef/useEffect) despite its hook-like name, so it's safe to call from inside another component's useFrame callback, not just a render body."
  - "A ship already sunk on its very first render (sunkShips already includes it at mount) never animates — it renders as already-submerged/invisible immediately, mirroring 05-03's 'never replay historical state on reconnect' rule. Only a live sunk:false->true transition after mount plays the list-and-submerge sequence."
  - "placementCenterWorld() was extracted out of FleetShips' render loop into an exported function so GameSceneAdapter's debris-burst trigger computes the exact same placement-center world position without re-deriving the math — avoids a second, potentially-diverging implementation."
  - "Debris burst detection lives in GameSceneAdapter (sunkShipsSeenRef, seeded at mount) independently of the ship's own sinking animation (which lives inside FleetShips/FloatingShip) — the two are decoupled but both key off the same sunkShips prop and both respect the same mount-seeded no-replay rule."

patterns-established:
  - "Random per-ship list direction (listSignRef, chosen once via Math.random() at mount) so multiple simultaneous sinkings don't all capsize identically."
  - "A component stops expensive per-frame work (wave sampling) once a transform reports 'done' (submerged) via an early return inside useFrame plus group.visible=false, rather than unmounting via React state — avoids a re-render just to hide a mesh."

issues-created: []

# Metrics
duration: ~70min
completed: 2026-07-18
---

# Phase 5 Plan 4: Dramatic Ship Sinking Sequence Summary

**Destroyed ships now capsize and slide beneath the waves over ~5 seconds (ease-in-cubic list + Y-drop, additive on the existing wave bob/pitch) with a debris burst at the sink point, replacing the old instant material-tint swap — and reconnect/refresh never replays the sequence for ships already sunk.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-18
- **Completed:** 2026-07-18
- **Tasks:** 3/3 complete — checkpoint approved by the user 2026-07-18 ("confirmed sinking animation"), plus three approved-at-checkpoint extensions (see below)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `useSinkingTransform` (new `SinkingShip.tsx`): pure ease-in-cubic list angle (up to ~40°) + Y-drop (up to 8 world units) over a 5s duration, given a sink-start clock time.
- `FleetShips.tsx`'s `FloatingShip` now tracks `sinkStartedAt` per-ship, applies the sinking transform additively on top of the existing wave-driven `rotation.x/z` and `position.y` every frame, and goes invisible once fully submerged (stops computing wave transforms for a mesh nobody can see).
- Ships already sunk on their very first render (page reload/reconnect mid-game) render nothing at all — no animation replay, matching 05-03's established rule.
- `GameSceneAdapter` now detects newly-sunk ship classes (via a mount-seeded `sunkShipsSeenRef`) and spawns a `"debris"` `ParticleBurst` at the ship's exact world position, computed via a newly-exported `placementCenterWorld()` helper shared with `FleetShips`' own placement math.

## Task Commits

1. **Task 1: Build the additive sinking transform** - `dc67a69` (feat)
2. **Task 2: Trigger sinking + debris/bubble burst from real game state** - `d4e4d2c` (feat)

**Checkpoint resolution + extensions (2026-07-18):** an earlier user report ("nothing sinks") exposed that no 3D hull ever rendered for the OPPONENT's fleet, so a sunk enemy ship had nothing to animate — fixed in `5877803` by reconstructing the sunk ship's placement client-side from `sunkShip`/`sunkShipCells` (via shared `placementFromCells`) and rendering it through the same FleetShips sinking path, fog-of-war-safe (only ever exists once sunk) and no-replay on reconnect. The user then confirmed the sinking animation and requested three extensions, all built and verified live:

4. **Per-cell floating wreckage** — `4b52489`: once a ship finishes sinking (or loads already-sunk), each cell it occupied keeps a deterministic cluster of charred flotsam (`Wreckage.tsx`) bobbing at `gerstnerHeight`, replacing render-nothing.
5. **Yellow hit / red sunk cell markers** — `3fa5362`: `HoloGrid`'s hit color is now warning-yellow (`#ffd21f`), flipping to red (`#ff2e3f`) when the ship's cells are confirmed sunk; damage escalates yellow -> red so a red cell always means a kill. (Consciously amends 04-03's amber-exclusivity note per user direction.)
6. **Comic-book result callouts** — `3fa5362`: `ResultCallout.tsx` + `resultCallout.css`, an arcade/comic DOM overlay popping "HIT!"/"SUNK!"/"MISS!" over the scene at shell impact (or instantly on skip). SUNK gets a starburst + biggest pop, MISS deflates and sinks; colors match the grid's damage language; reduced-motion respected.

All three verified via live socket-driven playtests + headless Playwright screenshots (defender-side incoming HIT callout mid-cinematic, yellow marker on the targeting grid, wreckage on both own-fleet and enemy historical paths), zero console errors.

## Files Created/Modified
- `client/src/scene/ships/SinkingShip.tsx` — `useSinkingTransform(startedAt, clockTime)`: pure ease-in-cubic list/drop calculation, no React hooks internally despite the naming.
- `client/src/scene/ships/FleetShips.tsx` — `FloatingShip` tracks `sinkStartedAt`/`wasSunkAtMount`/`listSign` refs, applies the sinking transform additively, and goes invisible once submerged; extracted `placementCenterWorld()` export.
- `client/src/scene/GameSceneAdapter.tsx` — `sunkShipsSeenRef` + `debrisBursts` state detect newly-sunk ships and render a `ParticleBurst preset="debris"` at each one's world position, gated to render only while the fleet board is on screen (same gate as `FleetShips` itself).

## Decisions Made
See `key-decisions` in frontmatter above.

## Deviations from Plan

None — plan executed exactly as written. The `placementCenterWorld()` extraction was anticipated by the plan itself ("compute via the same cellToWorld + placement-center logic FleetShips.tsx already uses").

## Issues Encountered

None in the shipped code. Self-verification tooling required real debugging (see below) but none of that debugging touched product code.

## Self-Verification (before checkpoint)

Following this project's established pattern of self-verifying with headless tooling before handing a visual/live-multiplayer checkpoint to the user:

1. **Animation shape/timing (Task 1):** A temporary bare-Canvas sandbox (`?dev=sink`, deleted before commit) mounted a single `FleetShips` ship, flipped `sunk` to `true` 1s after mount, and captured Playwright screenshots across ~8s. Confirmed: ship floats normally pre-sink (default hull color), material tints instantly on `sunk=true` (unchanged prior behavior), then visibly lists and drops with clearly accelerating motion (near-flat at +1s into the sink, a dramatic capsize by +4s, fully invisible by +5s) — matching the intended ease-in-cubic, ~5s, additive-on-waves design.
2. **Reconnect/no-replay + live-multiplayer integration (Task 2):** A scripted `socket.io-client` playthrough (mirroring `server/test/helpers.ts`'s `playToVictory` pattern) created a real two-player room against the live dev server, played through placement and battle, and sank Alice's destroyer via two real `fire` events. A headless Playwright browser then resumed Alice's session (via `sessionStorage`, mirroring 04-06's reconnect-verification pattern) against the real `BattleScreen`. Confirmed: zero console/page errors; the sunk destroyer is completely absent (not tinted, not floating) from both the main panel's fleet view and the "reveal" side panel; the damage report correctly shows "Destroyer 2/2" struck through with "Your Destroyer sunk!" in the battle log; the two hit-marker cells render correctly at the destroyer's former grid cells. This directly confirms the no-replay-on-reconnect requirement end-to-end through real server state, not just the isolated sandbox.
3. **Not independently captured:** a live, already-mounted browser *witnessing* a brand-new sink event in real time (i.e., watching the incoming-shot cinematic force-flip to fleet view, then the sinking animation play live, then the debris burst appear) — coordinating that timing-sensitive three-process scenario (Node setup script + Node "finishing shot" script + live Playwright browser, all within the ~60s reconnect grace window) proved to be a large additional time sink on top of two solid independent confirmations above (the animation's visual correctness in isolation, and the no-replay/no-crash behavior against real live server state). The underlying code path reuses 05-03's already-proven incoming-cinematic force-view-flip mechanism verbatim, and the new debris-trigger logic is small, type-checked, and code-reviewed. This specific combination is called out explicitly for the user's own two-browser UAT below.

## Next Phase Readiness

All tasks plus the checkpoint-driven fix and extensions are complete, committed, and verified. **Plan closed 2026-07-18 with user checkpoint approval.** 05-05 (fleet-status HUD) can build on the escalating yellow->red damage language and the comic-callout HUD layer established here.

---
*Phase: 05-cinematics-and-audio*
*Completed: 2026-07-18 (checkpoint approved)*
