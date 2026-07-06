---
phase: 05-cinematics-and-audio
plan: 03
subsystem: ui
tags: [r3f, three, drei, camera, particles, cinematics, battleship]

# Dependency graph
requires:
  - phase: 05-01
    provides: CameraRig shellFocus prop + triggerCameraShake, both previously unconsumed
  - phase: 05-02
    provides: ParticleBurst component (splash/explosion/debris presets)
provides:
  - ShellProjectile (client/src/scene/effects/ShellProjectile.tsx): eased parabolic-arc shell mesh + drei Trail smoke, exports easeInOutQuad/parabolicPosition for reuse
  - GameSceneAdapter firing-sequence state machine (flight -> impact -> settled), wired into the real Battle screen
  - CameraRig's ViewConfig type now exported; SceneRoot forwards an optional shellFocus prop through to CameraRig
affects: [05-04, 05-05, 05-06, phase-6-perf-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-frame React-state camera-focus tracker (ShellFocusTracker) as a Canvas-child helper component, reusing exported easing/parabola math rather than duplicating it"
    - "Sequencing state (settledCount/pendingShot/sequenceStage) lives entirely inside GameSceneAdapter, never threaded into BattleScreen"

key-files:
  created:
    - client/src/scene/effects/ShellProjectile.tsx
  modified:
    - client/src/scene/GameSceneAdapter.tsx
    - client/src/scene/SceneRoot.tsx
    - client/src/scene/camera/CameraRig.tsx

key-decisions:
  - "CameraRig's previously-unexported ViewConfig interface is now exported, and SceneRoot gained a new optional shellFocus prop forwarding straight to CameraRig — both necessary for GameSceneAdapter to reach 05-01's shellFocus mechanism from outside the Canvas boundary; not in the plan's stated files_modified list but unavoidable to wire the feature end-to-end."
  - "ShellProjectile's prop contract stayed exactly as specified in the plan (start/end/durationSeconds/arcHeight/onImpact only, no onFrameUpdate callback). Camera-follow instead uses a separate ShellFocusTracker component (defined in GameSceneAdapter.tsx) that reuses ShellProjectile's exported easeInOutQuad/parabolicPosition helpers to independently recompute the same position every frame — avoids expanding ShellProjectile's API while still keeping the math single-sourced."
  - "Fixed shell launch point ([0, GRID_ALTITUDE+3, 24]) regardless of which ship fired, per the plan's explicit allowance (the firing ship's real world position isn't tracked by this adapter)."
  - "Firing sequence timing: 0.9s shell flight + up to 0.8s explosion burst (worst case) ≈ 1.7s total, comfortably under ROADMAP.md's 2.5s cap."
  - "Skip is wired two ways: Escape/Space via a window keydown listener, and click/tap anywhere on the .game-scene wrapper's onPointerDown — both call the same settleSequence(), scoped to interactive mode with an active pendingShot only."
  - "onSelectCell now also blocks while pendingShot is set, preventing a double-fire at the still-unmarked target cell mid-cinematic (an edge case not explicitly called out in the plan but caught during implementation)."

patterns-established:
  - "A per-frame camera-focus tracker component pattern for any future moving camera target: don't expand the moving object's own component API, add a small sibling Canvas-child component that recomputes the same shared math and pushes it up via a setState callback."

issues-created: []

# Metrics
duration: ~70min
completed: 2026-07-06
---

# Phase 5, Plan 3: Full Firing Cinematic Summary

**Firing a shot in the real Battle screen now plays a complete shell-arc + camera-follow + impact-burst + shake cinematic before the hit/miss marker appears, gated by a `flight -> impact -> settled` state machine inside `GameSceneAdapter`.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-06
- **Completed:** 2026-07-06
- **Tasks:** 2 automated tasks complete; 1 checkpoint:human-verify task reached and awaiting user verification (plan not yet fully closed)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `ShellProjectile` (new): a shell mesh flies start->end along an eased (not linear) parabolic arc over a caller-supplied duration, dragging a fading drei `<Trail>` smoke trail, firing `onImpact` exactly once at flight completion. Exports its easing/parabola math for reuse.
- `GameSceneAdapter` now sequences every newly-arrived shot: withholds it from the grid's `cellStatesFrom` input while a `ShellProjectile` flies from a fixed launch point to the target cell; a `ShellFocusTracker` feeds `CameraRig`'s `shellFocus` every frame so the camera visibly follows the shell; on impact, `triggerCameraShake` fires (scaled bigger for hit/sunk, smaller for miss) alongside a `ParticleBurst` (`"explosion"` for hit/sunk, `"splash"` for miss); the shot only joins the grid's settled/visible list once the burst's `onComplete` fires.
- Skip mechanism: Escape/Space or a click/tap anywhere on the scene immediately resolves the pending shot, cancelling the shell/burst/camera-follow without waiting.
- Historical shots present at component mount (initial load, reconnect) are pre-settled and never animate; reveal-mode boards (post-game, the battle screen's own fleet side-panel) never sequence at all.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build ShellProjectile (parabolic arc + smoke trail)** - `cc29bdc` (feat)
2. **Task 2: Wire the full firing sequence into GameSceneAdapter and BattleScreen** - `63a161d` (feat)

_Task 2's commit also includes the necessary CameraRig.tsx (export ViewConfig) and SceneRoot.tsx (forward shellFocus) changes — see Deviations below._

**Plan metadata:** pending — plan not yet closed (see Next Phase Readiness / checkpoint status)

## Files Created/Modified
- `client/src/scene/effects/ShellProjectile.tsx` - New: eased parabolic shell arc + drei Trail smoke trail; exports `easeInOutQuad`/`parabolicPosition`.
- `client/src/scene/GameSceneAdapter.tsx` - New firing-sequence state machine (`settledCount`/`pendingShot`/`sequenceStage`/`impactPosition`/`shellFocus`), `ShellFocusTracker` helper component, skip handlers (keydown + onPointerDown), impact handler wiring `triggerCameraShake` + `ParticleBurst`.
- `client/src/scene/SceneRoot.tsx` - Added optional `shellFocus` prop, forwarded to `CameraRig`.
- `client/src/scene/camera/CameraRig.tsx` - Exported the previously-internal `ViewConfig` interface (no behavior change).

`client/src/screens/BattleScreen.tsx` was read but not modified — confirmed no structural change was needed, per the plan's own fallback guidance ("if unnecessary after implementation, leave that file untouched").

## Decisions Made
See `key-decisions` in frontmatter above — the notable one is the ViewConfig-export / SceneRoot shellFocus-forwarding change, which the plan's `files_modified` header didn't list but was structurally required to reach 05-01's `shellFocus` mechanism from `GameSceneAdapter` (which sits outside the `<Canvas>` boundary in the React tree).

## Deviations from Plan

### Auto-fixed Issues

**1. [Necessary wiring not listed in plan's file list] CameraRig.tsx / SceneRoot.tsx touched**
- **Found during:** Task 2 (wiring the firing sequence)
- **Issue:** The plan's `files_modified` frontmatter only listed `ShellProjectile.tsx`, `GameSceneAdapter.tsx`, `BattleScreen.tsx` — but `GameSceneAdapter` renders `<SceneRoot>` as a black box; there was no existing path for it to pass a per-frame `shellFocus` value down into `CameraRig`, and `CameraRig`'s `ViewConfig` type (the exact shape `shellFocus` needs) wasn't exported.
- **Fix:** Exported `ViewConfig` from `CameraRig.tsx` (pure `export` keyword addition, zero behavior change); added an optional `shellFocus` prop to `SceneRoot` that forwards directly to `CameraRig`.
- **Files modified:** `client/src/scene/camera/CameraRig.tsx`, `client/src/scene/SceneRoot.tsx`
- **Verification:** `npx tsc --noEmit` passes; live playtest (below) confirms the camera visibly follows the shell and impact point.
- **Committed in:** `63a161d` (part of Task 2's commit)

### Deferred Enhancements

None.

---

**Total deviations:** 1 auto-fixed (necessary wiring outside the plan's stated file list), 0 deferred.
**Impact on plan:** Required for the feature to function at all (05-01's shellFocus prop was otherwise unreachable from outside the Canvas). No scope creep — no other behavior was added.

## Issues Encountered

- **Headless Playwright session-resume flakiness (self-verification only, not a product bug):** repeatedly resuming a `sessionId`/`name` pair via `sessionStorage` + reload intermittently landed back on the name-entry screen instead of the battle screen (roughly 1-in-2 to 1-in-3 attempts), even immediately after a fresh `startBattle`-style socket.io setup script completed. Root cause not fully isolated (grace-timer/reconnect race in a scripted, rapid-fire test harness, likely specific to how quickly the setup script's sockets disconnect after the server's `roomState` acknowledgment) — retrying the identical script with a fresh session consistently succeeded. Does not appear to be a regression from this plan's changes (the store's resume-on-mount logic and its 02-03/03-01 decisions were untouched); logging here for visibility rather than as ISS since it never blocked verification, only required a retry.
- No console errors observed in any of the four self-verification runs (miss, hit, skip, reconnect-no-replay).

## Self-Verification Performed (pre-checkpoint)

Since this plan's final task is a `checkpoint:human-verify` requiring the user's own eyes on the live cinematic, the two automated tasks were self-verified first via a live two-socket playtest against the real dev server (mirroring the 04-06/04-07/05-02 pattern), before presenting the checkpoint:

1. **`npx tsc --noEmit`** (client workspace) — passes with zero errors after both tasks.
2. **Live miss shot:** scripted two-client `socket.io-client` setup (create room, join, ready, place both fixed fleets) reached battle phase; a headless Playwright session resumed the shooter's real session via `sessionStorage`; fired at an empty cell via an exact camera-projected canvas click (mirroring 04-07's verified-projection click pattern). Screenshots confirmed: shell + fading trail visible mid-flight, camera visibly pushed in/following, a white/pale splash burst at impact, the grid cell staying unmarked throughout flight, and a gray "miss" marker only appearing once settled. Turn correctly passed to the opponent afterward. Zero console errors.
3. **Live hit shot:** same setup, fired at a cell occupied by the opponent's carrier. Screenshots confirmed a larger/brighter explosion burst (vs. the miss's splash) and a red "hit" marker appearing only post-settlement. Turn passed correctly.
4. **Skip:** fired, then immediately pressed Escape. A screenshot taken ~150ms later already showed the resolved miss marker with the camera still in its wide overview (never even started following the shell) — confirming skip resolves instantly without waiting for the cinematic.
5. **Reconnect/mount, no replay:** a shot was fired via the socket script *before* any client ever observed it (fully historical by the time Playwright resumed that session). Three screenshots taken at mount, +0.5s, and +2s were pixel-identical (a static marker, no shell, no trail, no burst) — confirming historical shots never trigger the animation.

All temporary verification scripts (Node socket.io-client setup scripts, a Node three.js camera-projection helper, Playwright automation scripts) were written to the scratchpad/temp locations and deleted before this summary was written; `git status` is clean of any test-harness residue.

## Next Phase Readiness

Both automated tasks (`ShellProjectile`, full `GameSceneAdapter` wiring) are complete, committed, and self-verified via a live playtest exercising miss, hit, skip, and reconnect-no-replay paths. **This plan is not yet closed**: its final task is `checkpoint:human-verify`, requiring the user to personally play a live two-browser game and confirm the cinematic feels right. See the checkpoint returned alongside this summary for exact verification steps. Once approved (or after any requested fixes), 05-04 (ship-sinking cinematic) can build on this plan's `ParticleBurst`/`triggerCameraShake`/sequencing patterns.

---
*Phase: 05-cinematics-and-audio*
*Completed: 2026-07-06 (pending checkpoint approval)*
