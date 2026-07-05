---
phase: 04-3d-ocean-scene
plan: 05
subsystem: ui
tags: [react-three-fiber, three.js, zustand, socket.io]

# Dependency graph
requires:
  - phase: 04-3d-ocean-scene (04-01..04-04)
    provides: Ocean/SkyDome environment, procedural ShipModel, HoloGrid overlay, CameraRig fleet/targeting damping — all previously only wired into the ?dev=scene sandbox
provides:
  - Shared client/src/scene/grid/gridCoords.ts cellToWorld mapping used by both HoloGrid and FleetShips
  - HoloGrid cellStates prop (hit/miss/sunk markers layered above cells)
  - FleetShips placements prop (real ShipPlacement[] positioning, replacing 04-02's fixed demo layout) and sunkShips damage tint
  - GameSceneAdapter — the game-facing composition of SceneRoot/FleetShips/HoloGrid used by BattleScreen (and reusable by 04-06/04-07)
  - BattleScreen's targeting board is now the live 3D scene with a fleet/targeting view toggle; TargetingBoard.tsx retired
affects: [04-06-post-game-integration, 04-07-placement-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single cellToWorld(coord, cellSize?) mapping in gridCoords.ts is the only grid-to-world positioning math; HoloGrid, FleetShips, and ShipClasses' BASE_UNIT all read it rather than approximating"
    - "GameSceneAdapter pattern: a thin game-facing wrapper over game-state-agnostic 3D primitives (HoloGrid/FleetShips), converting ShotRecord[] into cellStates and gating onFire — 04-06/04-07 build their own adapters over the same primitives rather than teaching the primitives new game rules"
    - "The grid is shared physical space for both camera views but represents two different boards; ships render only in fleet view (view === 'fleet') so they never appear superimposed on what the targeting view is presenting as the enemy's grid"

key-files:
  created:
    - client/src/scene/grid/gridCoords.ts
    - client/src/scene/GameSceneAdapter.tsx
  modified:
    - client/src/scene/grid/HoloGrid.tsx
    - client/src/scene/ships/FleetShips.tsx
    - client/src/scene/ships/ShipHull.tsx
    - client/src/scene/ships/ShipClasses.ts
    - client/src/dev/SceneSandbox.tsx
    - client/src/screens/BattleScreen.tsx
    - client/src/screens/battle.css
  deleted:
    - client/src/components/TargetingBoard.tsx

key-decisions:
  - "gridCoords.ts's cellToWorld is the one grid-to-world mapping every 3D component must use (grid cells, ship placements, and ShipClasses' world-unit scale)"
  - "Ships render only when view === 'fleet' in GameSceneAdapter — the grid stands for two different boards (your fleet vs. the enemy's waters) depending on camera view, so rendering ships unconditionally would show your own fleet superimposed on the targeting grid"
  - "ShipClasses' BASE_UNIT must equal gridCoords' CELL_SIZE so a ship's rendered hull length exactly spans its SHIP_LENGTHS cell count once placed via cellToWorld"

patterns-established:
  - "GameSceneAdapter: game-facing API over game-state-agnostic scene primitives, reused by 04-06/04-07"

issues-created: []

# Metrics
duration: 55min
completed: 2026-07-05
---

# Phase 4 Plan 05: Battle Screen 3D Integration Summary

**BattleScreen's targeting board is now the live 3D scene (Ocean/HoloGrid/FleetShips/CameraRig) driven by real RoomSnapshot data through a new `GameSceneAdapter`, with `TargetingBoard.tsx` retired and a shared `cellToWorld` grid-coordinate system established for 04-06/04-07 to reuse.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-05T00:00:00Z (approx.)
- **Completed:** 2026-07-05
- **Tasks:** 2 planned tasks (+ 1 self-verified checkpoint)
- **Files modified:** 9 (2 created, 6 modified, 1 deleted)

## Accomplishments

- `gridCoords.ts` establishes the single `cellToWorld` mapping shared by the grid overlay, ship placement, and (now) ship hull scale
- `HoloGrid` renders hit/miss/sunk shot markers via a second non-interactive `<Instances>` layer, stopping hover/select callbacks for cells with a recorded state
- `FleetShips` positions real `ShipPlacement[]` fleets (centered on their occupied cells, oriented per placement) instead of 04-02's fixed demo row, and supports a damage-tint `sunkShips` prop
- `GameSceneAdapter` composes the scene behind a game-facing API (`view`, `yourFleet`, `shots`, `canFire`, `onFire`, `sunkShips`), porting `TargetingBoard`'s `sunkCellsFrom` logic and `clickable` turn/re-fire guard verbatim
- `BattleScreen` renders `GameSceneAdapter` with a fleet/targeting view toggle (default targeting) driving `CameraRig`'s damped transition; `TargetingBoard.tsx` is deleted along with its dead CSS
- End-to-end verified against the real server via a two-browser headless Playwright run: room creation/join, ready-up, fleet randomize + ready, alternating live fire through the 3D grid with correct hit/miss markers, turn gating, fleet-view ship rendering, and zero console errors throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared grid-to-world coordinates; shot markers on HoloGrid; real placements + damage tint on FleetShips** - `990d93c` (feat)
2. **Fix: ship hull length/beam scaling** - `04036f3` (fix) — deviation, see below
3. **Task 2: GameSceneAdapter and BattleScreen wiring; retire TargetingBoard** - `86ca61b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `client/src/scene/grid/gridCoords.ts` — the shared `cellToWorld([col,row]) -> [x,z]` mapping
- `client/src/scene/GameSceneAdapter.tsx` — game-facing scene composition
- `client/src/scene/grid/HoloGrid.tsx` — `cellStates` prop, shot markers, hover/select gating
- `client/src/scene/ships/FleetShips.tsx` — `placements`/`sunkShips` props, cell-centered positioning
- `client/src/scene/ships/ShipHull.tsx` — `sunk` prop swaps hull/deck/superstructure to a damage tint
- `client/src/scene/ships/ShipClasses.ts` — `BASE_UNIT` now equals `gridCoords.CELL_SIZE`; carrier slimmed and carrier/battleship lengths nudged to fully fill their cells
- `client/src/dev/SceneSandbox.tsx` — updated to the new `placements`/`cellStates` props
- `client/src/screens/BattleScreen.tsx` — `GameSceneAdapter` replaces `TargetingBoard`, view toggle added
- `client/src/screens/battle.css` — `.game-scene`/`.battle-main-header`/`.view-toggle` added; dead `.board.targeting`/`.pending`/`.hit.sunk` rules removed
- `client/src/components/TargetingBoard.tsx` — deleted

## Decisions Made

- `cellToWorld` in `gridCoords.ts` is the single source of truth for grid-to-world positioning; `ShipClasses.ts`'s `BASE_UNIT` now reads it directly instead of an independent constant, so ship hull length always matches its real grid-cell footprint.
- `GameSceneAdapter` only renders `FleetShips` when `view === "fleet"`. The grid is one physical space used for two different boards depending on camera framing (your fleet vs. the enemy's waters); rendering your ships unconditionally would show them superimposed on what the targeting view presents as the enemy's grid — a discovered-during-verification correctness issue, not part of the original plan text, fixed before commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ship hull length didn't match its grid-cell footprint**
- **Found during:** Task 1 self-verification (headless Playwright screenshot of the sandbox after wiring `FleetShips` to real placements)
- **Issue:** `ShipClasses.ts`'s `BASE_UNIT` (3.2 world units per grid-cell of ship length) didn't match `gridCoords.CELL_SIZE` (4 world units per grid cell), so every ship rendered visually shorter than its actual `SHIP_LENGTHS` cell count (a carrier read as covering ~4 cells instead of 5).
- **Fix:** `BASE_UNIT` now imports and equals `gridCoords.CELL_SIZE` directly.
- **Files modified:** `client/src/scene/ships/ShipClasses.ts`
- **Verification:** Re-screenshotted the sandbox; carrier/battleship/cruiser/submarine/destroyer each visibly span exactly 5/4/3/3/2 grid cells.
- **Committed in:** `04036f3`

**2. [User-requested tuning, folded into the same fix] Carrier beam and carrier/battleship length**
- **Found during:** User review of the corrected screenshot
- **Change:** Carrier's `beamRatio` reduced (0.19 → 0.15) so its hull stays within the width of the single grid row it occupies; carrier/battleship get a small `lengthScale` (1.08/1.06) compensating for the hull shape's tapered bow/stern, which otherwise reads as falling short of fully filling the last cell.
- **Files modified:** `client/src/scene/ships/ShipClasses.ts`
- **Verification:** Re-screenshotted; carrier fits its row width, both classes' tapered ends now reach their cell boundaries.
- **Committed in:** `04036f3`

**3. [Rule 1 - Bug] Own ships visible during targeting view**
- **Found during:** Task 2's two-browser end-to-end Playwright verification (screenshot of "Enemy waters" showed the player's own fleet silhouettes sitting on the targeting grid)
- **Issue:** `GameSceneAdapter` rendered `FleetShips` unconditionally regardless of `view`, so during targeting view (aiming at the opponent's board) the player's own ships appeared superimposed on the grid meant to represent enemy waters.
- **Fix:** `FleetShips` now renders only when `view === "fleet"`.
- **Files modified:** `client/src/scene/GameSceneAdapter.tsx`
- **Verification:** Re-ran the two-browser Playwright script; targeting view now shows only the grid and shot markers, fleet view shows the real ship placements.
- **Committed in:** `86ca61b` (folded into Task 2's commit, found before that commit was made)

### Deferred Enhancements

None logged this plan.

---

**Total deviations:** 3 auto-fixed (2 bugs found via self-verification screenshots, 1 user-requested visual tuning folded into the same fix). No scope creep — all three were necessary for the scene to look and behave correctly.
**Impact on plan:** None of the deviations changed the plan's architecture (gridCoords/GameSceneAdapter/HoloGrid cellStates/FleetShips placements); they corrected implementation details surfaced by the plan's own self-verification step.

## Issues Encountered

None beyond the deviations documented above.

## Next Phase Readiness

- `cellToWorld`, `GameSceneAdapter`, and the `cellStates`/`sunkShips` prop patterns are all in place for 04-06 (post-game reveal) and 04-07 (placement) to reuse directly rather than re-deriving.
- `client/src/dev/SceneSandbox.tsx` is still present (04-07 removes it) and now exercises the same `placements`/`cellStates` props the real game uses, keeping it representative.
- No blockers. Full sunk-ship damage tint and sunk-marker rendering were verified via code + a synthetic sandbox `cellStates` map; a real full-ship-sunk scenario wasn't reached in the two-browser smoke test (would require many more turns) but exercises the identical code path as the verified hit/miss cases.

---
*Phase: 04-3d-ocean-scene*
*Completed: 2026-07-05*
