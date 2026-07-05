---
phase: 04-3d-ocean-scene
plan: 06
subsystem: ui
tags: [react-three-fiber, three, socket.io, playwright, zustand]

# Dependency graph
requires:
  - phase: 04-3d-ocean-scene
    provides: "04-05's GameSceneAdapter/HoloGrid/FleetShips/cellToWorld primitives and interactive Battle screen integration"
provides:
  - "GameSceneAdapter mode=\"reveal\" — read-only 3D board display (no hover/click/firing)"
  - "HoloGrid interactive prop to fully disable pointer interaction"
  - "Post-Game screen rendering both fleets via the 3D scene instead of 2D FleetBoard"
  - "BattleScreen's side-panel fleet reveal migrated off FleetBoard onto the same reveal adapter"
  - "FleetBoard.tsx deleted — every screen except Placement now uses the 3D scene"
affects: ["04-07-placement", "phase-5", "phase-6-performance"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["GameSceneAdapter mode prop (interactive/reveal) rather than a third bespoke board component"]

key-files:
  created: []
  modified:
    - client/src/scene/GameSceneAdapter.tsx
    - client/src/scene/grid/HoloGrid.tsx
    - client/src/screens/PostGameScreen.tsx
    - client/src/screens/BattleScreen.tsx
    - client/src/screens/battle.css
    - client/src/scene/Ocean.tsx
    - client/src/scene/camera/CameraRig.tsx
  deleted:
    - client/src/components/FleetBoard.tsx

key-decisions:
  - "GameSceneAdapter's mode prop (default \"interactive\") is the one place reveal-vs-interactive behavior branches; HoloGrid/FleetShips stay game-state-agnostic per 04-05's pattern."
  - "Reveal mode always renders the fleet regardless of camera view (a reveal board only ever shows one board), whereas interactive mode still gates ships on view === \"fleet\"."
  - "BattleScreen's side-panel reveal was migrated in the same commit as PostGameScreen — FleetBoard's only two consumers had to move together since deleting the component can't leave a dangling import."
  - "Each Post-Game reveal board mounts its own Canvas via SceneRoot (two Canvases side by side) — acceptable since the screen is static/non-time-pressured, per the plan's explicit guidance not to force a shared Canvas."

patterns-established:
  - "HoloGrid `interactive` prop: false suppresses hover/click/cursor entirely, leaving only static cellStates markers — the mechanism any future read-only board should reuse."

issues-created: [ISS-001]

# Metrics
duration: 72min
completed: 2026-07-05
---

# Phase 04-3d-ocean-scene Plan 06 Summary

**Post-Game screen now renders both fleets (yours and the revealed opponent's) in the 3D scene via a new `GameSceneAdapter` read-only reveal mode; `FleetBoard.tsx` is deleted, retiring the 2D board layer from every screen except Placement.**

## Performance

- **Duration:** 72 min
- **Started:** 2026-07-05T09:43:42+03:00
- **Completed:** 2026-07-05T10:55:20+03:00
- **Tasks:** 1 (plus one self-verified checkpoint)
- **Files modified:** 8 (1 deleted, 7 modified), 1 new (ISSUES.md)

## Accomplishments
- `GameSceneAdapter` gained `mode?: "interactive" | "reveal"` — reveal mode disables all `HoloGrid` hover/click/cursor behavior and always renders the fleet, regardless of camera view.
- `PostGameScreen` renders both fleets (`you.fleet` + `revealedOpponentFleet`) through two side-by-side reveal-mode adapters, replacing `<FleetBoard>`.
- `BattleScreen`'s always-visible "Your fleet" side panel was also migrated to the reveal adapter (FleetBoard's other consumer), since the component is now deleted entirely.
- `client/src/components/FleetBoard.tsx` deleted; its dead 2D board/cell CSS removed from `battle.css`, with the smaller reveal-board sizing rule retained and now shared by both screens.
- Two visual bugs found and fixed while verifying the smaller reveal boards: an ocean shader two-tone banding seam (removed the deep/shallow height mix, softened the fresnel rim) and an awkwardly-cropped fleet camera framing (repositioned `CameraRig`'s fleet view).

## Task Commits

Each task was committed atomically:

1. **Bug fixes found during self-verification (ocean banding, fleet camera framing)** - `c1050e7` (fix)
2. **Task 1: Read-only reveal mode; wire PostGameScreen/BattleScreen; delete FleetBoard** - `94ae216` (feat)

_No separate plan-metadata commit; this summary/STATE.md update is the closing commit for the plan._

## Files Created/Modified
- `client/src/scene/GameSceneAdapter.tsx` - added `mode` prop; reveal mode skips the view-gated ship rendering and disables `onSelectCell`.
- `client/src/scene/grid/HoloGrid.tsx` - added `interactive` prop (default true); false suppresses `useCursor`, `onPointerOver/Out/onClick` for every cell.
- `client/src/screens/PostGameScreen.tsx` - two `GameSceneAdapter mode="reveal"` instances replace `<FleetBoard>` for "Your waters" and "`{opponent}`'s waters (revealed)".
- `client/src/screens/BattleScreen.tsx` - side-panel "Your fleet" now uses `GameSceneAdapter mode="reveal"` instead of `<FleetBoard>`.
- `client/src/screens/battle.css` - removed the `.board`/`.board-row`/`.cell` 2D board rules; kept the `.battle-side .game-scene, .postgame-boards .game-scene` sizing rule.
- `client/src/components/FleetBoard.tsx` - deleted.
- `client/src/scene/Ocean.tsx` - single shallow-water base color instead of a height-based deep/shallow mix; softer fresnel exponent/intensity — fixes a visible banding seam.
- `client/src/scene/camera/CameraRig.tsx` - fleet view repositioned (`position`/`lookAt`) for better framing in the smaller reveal boards.
- `.planning/ISSUES.md` - new; logs ISS-001.

## Decisions Made
- Reveal mode always renders the fleet (no `view === "fleet"` gate) since a reveal board only ever represents one board, unlike the interactive Battle screen's shared grid standing for two boards.
- BattleScreen's side panel was migrated in the same commit as PostGameScreen (not deferred) because `FleetBoard.tsx`'s deletion cannot leave any consumer importing a deleted file.
- Two Post-Game `<Canvas>` instances (one per reveal board) rather than a shared canvas, per the plan's explicit acceptance of that tradeoff for a static screen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] BattleScreen's FleetBoard usage also needed migration**
- **Found during:** Task 1 (deleting FleetBoard.tsx)
- **Issue:** The plan's file list only named `GameSceneAdapter.tsx`, `PostGameScreen.tsx`, `FleetBoard.tsx`, `battle.css`, but `BattleScreen.tsx` also imported `FleetBoard` for its side-panel fleet display (established in 04-05). Deleting `FleetBoard.tsx` without updating this consumer would break the build.
- **Fix:** Migrated `BattleScreen`'s side panel to the same `GameSceneAdapter mode="reveal"` adapter.
- **Files modified:** client/src/screens/BattleScreen.tsx
- **Verification:** `npm run build --workspace=@steel-horizon/client` succeeds with no dangling imports.
- **Committed in:** 94ae216 (Task 1 commit)

**2. [Rule 1 - Bug] Ocean shader banding seam and fleet camera framing**
- **Found during:** Task 1 self-verification (visually inspecting the new smaller reveal boards)
- **Issue:** The ocean shader's height-based deep/shallow color mix plus fresnel darkening produced a visible two-tone seam, most obvious near the camera under the holographic grid; the fleet camera's old position/lookAt cropped the fleet awkwardly at the reveal boards' reduced size.
- **Fix:** Ocean now uses a single shallow-water base color with a softer fresnel rim; `CameraRig`'s fleet view position/lookAt repositioned further back and slightly downward.
- **Files modified:** client/src/scene/Ocean.tsx, client/src/scene/camera/CameraRig.tsx
- **Verification:** Playwright screenshot of the Post-Game reveal confirms a clean, single-tone ocean and a well-framed fleet in both reveal boards.
- **Committed in:** c1050e7 (separate fix commit, preceding the feat commit)

### Deferred Enhancements

Logged to `.planning/ISSUES.md`:
- ISS-001: BattleScreen now runs two simultaneous live R3F Canvases (interactive main panel + reveal side panel), roughly doubling per-frame render cost during live gameplay. Lower risk on the static Post-Game screen. Suggested for Phase 6 (60fps budget work).

---

**Total deviations:** 2 auto-fixed (1 missing-critical follow-on migration, 1 bug), 1 deferred.
**Impact on plan:** Both auto-fixes were necessary — the BattleScreen migration for the build to succeed at all, the visual fixes for the reveal boards to look correct. No scope creep beyond what deleting FleetBoard and reviewing its output required.

## Issues Encountered

The `checkpoint:human-verify` task was self-verified per this project's yolo config (`skip_checkpoints: true`) using this project's established pattern, adapted for this plan's non-time-pressured, no-firing scope:
- A Node script (`socket.io-client`) drove two real sessions through `createRoom` → `joinRoom` → `setReady` → `placeFleet` → repeated `fire` against the live dev server (mirroring `server/test/helpers.ts`'s `playToVictory`/fixed fleets) to a real gameover.
- A headless Playwright browser resumed one of those two sessions via `sessionStorage` (the project's documented "reconnect is snapshot-driven only" behavior) and loaded the real client, landing directly on `PostGameScreen` with the actual gameover snapshot.
- Verified: both reveal boards render (2 `.game-scene` containers, 2 canvases), ship placements and hit/miss/sunk markers visually match the fixed fleets and shot history (screenshot inspected at native and cropped/zoomed resolution), zero console/page errors, stats block populated, and the rematch flow (`Request rematch` → "Rematch requested — waiting…") works end-to-end on a fresh gameover session.

This is faster and more deterministic than driving live 3D firing through canvas raycasts (which 04-05 already exercises) since this plan's actual code changes are entirely in the read-only reveal path.

## Next Phase Readiness

Every screen except Placement (`BattleScreen`, `PostGameScreen`) now renders its board exclusively through the 3D scene; `FleetBoard.tsx` and its CSS are fully retired. 04-07 (Placement) is the last screen still on a 2D board and can proceed independently — it builds its own thin adapter over `HoloGrid`/`FleetShips` per the established pattern rather than reusing `GameSceneAdapter` directly (placement's drag/rotate interactions don't fit either existing mode).

No blockers. ISS-001 (dual-canvas cost) is deferred to Phase 6 and does not block 04-07.

---
*Phase: 04-3d-ocean-scene*
*Completed: 2026-07-05*
