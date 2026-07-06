---
phase: 04-3d-ocean-scene
plan: 07
subsystem: ui
tags: [react-three-fiber, three.js, zustand, socket.io]

# Dependency graph
requires:
  - phase: 04-3d-ocean-scene (04-01..04-06)
    provides: Ocean/SkyDome environment, CameraRig fleet/targeting damping, shared cellToWorld grid-coordinate mapping, HoloGrid's click-to-select primitive, FleetShips real-placement rendering, the GameSceneAdapter pattern for a thin game-facing wrapper over state-agnostic scene primitives
provides:
  - PlacementSceneAdapter — the placement-phase adapter over SceneRoot/FleetShips/HoloGrid using continuous drag-and-drop (dock or placed-ship lift, hover-tracked green/red ghost, R mid-drag rotate, right-click in-place rotate), mirroring the 2D PlacementBoard's interaction exactly
  - Full fleet placement (drag, drop, rotate, randomize, ready) rendered entirely in the 3D scene, wired into the real PlacementScreen against the real server
  - client/src/components/PlacementBoard.tsx and client/src/dev/SceneSandbox.tsx deleted; main.tsx's ?dev=scene branch removed — no 2D board or isolated dev harness remains anywhere in the client
  - HoloGrid onPointerDownCell(coord, button) callback for press-based consumers; amber selected highlight now gated on onSelectCell being provided
  - Overhead, vertically-centered camera framing for BOTH views (fleet and targeting), with numerically-solved lookAt values
affects: [phase-05, phase-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Continuous drag-and-drop in 3D (user decision at UAT, overriding the initially self-chosen select-then-place): pointerdown on a dock ship or a placed ship's grid cell lifts it, HoloGrid's per-cell R3F hover events feed the drag's hovered cell (no manual raycasting), a green/red instanced ghost previews legality, pointerup drops with snap-back on illegal, R rotates mid-drag, right-click rotates a placed ship in place"
    - "Draft-time legality (isLegalInDraft: bounds + no-overlap against the rest of the draft) is ported verbatim from the retired PlacementBoard.tsx into PlacementSceneAdapter.tsx rather than re-derived, keeping one legality implementation used identically pre-3D and post-3D"

key-files:
  created:
    - client/src/scene/PlacementSceneAdapter.tsx
  modified:
    - client/src/screens/PlacementScreen.tsx
    - client/src/screens/placement.css
    - client/src/screens/battle.css
    - client/src/scene/grid/HoloGrid.tsx
    - client/src/scene/camera/CameraRig.tsx
    - client/src/main.tsx
  deleted:
    - client/src/components/PlacementBoard.tsx
    - client/src/dev/SceneSandbox.tsx

key-decisions:
  - "Placement interaction is continuous drag-and-drop, decided by the USER during UAT (overriding the initial yolo self-resolution of the plan's checkpoint:decision to select-then-place). The drag reuses HoloGrid's existing per-cell R3F hover events to track the hovered cell during a drag — no per-frame manual raycasting was needed after all, which had been the main argument against continuous drag."
  - "HoloGrid's amber selected highlight only engages when onSelectCell is provided: press-based (drag) consumers use onPointerDownCell and must not strand a stale amber cell from the click that ends a drag."
  - "Screen-level max-width rules must out-specify styles.css's generic `.screen` rule (`.screen.battle-screen`, not `.battle-screen`): main.tsx imports App (and transitively every screen's CSS) BEFORE styles.css, so equal-specificity screen rules silently lose the cascade — this was the root cause of the whole battle screen rendering in a 26rem column ('everything is too small')."
  - "Both camera views are overhead and vertically centered (user feedback): targeting moved from the low water-level angle to an overhead framing like fleet view, and both views' lookAt z values are solved numerically so the grid's near/far edges project to symmetric NDC y (~±0.77)."
  - "PlacementScreen imports battle.css in addition to placement.css purely for the shared .game-scene container rule, matching the precedent PostGameScreen already set (04-06) for reusing that class across every GameSceneAdapter/PlacementSceneAdapter consumer rather than duplicating the rule per screen."

patterns-established:
  - "PlacementSceneAdapter: game-facing placement API over the same state-agnostic primitives GameSceneAdapter uses, following the same 'thin adapter, ported legality/derivation logic, no new rules taught to the primitives' shape established in 04-05/04-06."

issues-created: []

# Metrics
duration: ~110min (incl. UAT feedback round)
completed: 2026-07-06
---

# Phase 4 Plan 07: Placement 3D Integration Summary

**Fleet placement now happens entirely in the 3D scene via continuous drag-and-drop mirroring the 2D board (`PlacementSceneAdapter`), completing Phase 4's "2D board retired" goal — `PlacementBoard.tsx` and the `?dev=scene` sandbox are both deleted — plus a UAT round that enlarged/centered every scene canvas and made the targeting view overhead.**

## Performance

- **Duration:** ~110 min (~70 min plan execution + ~40 min UAT feedback round)
- **Started:** 2026-07-05 (session continued into 2026-07-06)
- **Completed:** 2026-07-06
- **Tasks:** 1 planned auto task + 1 pre-task checkpoint:decision + 1 final checkpoint:human-verify, then a 4-item user UAT feedback round
- **Files modified:** 9 (1 created, 6 modified, 2 deleted)

## Accomplishments

- Initially resolved the plan's opening `checkpoint:decision` (continuous-drag vs. select-then-place) as select-then-place per the yolo config's self-verification approach; the **user overrode this at UAT to continuous drag-and-drop**, which was then implemented mirroring the 2D `PlacementBoard` exactly: pointerdown on a dock ship or a placed ship's grid cell lifts it, `HoloGrid`'s per-cell R3F hover events feed the drag's hovered cell (no manual raycasting needed — the concern that had originally tipped the decision), a green/red instanced ghost previews legality, pointerup drops with snap-back on illegal, R rotates mid-drag, right-click rotates a placed ship in place.
- `PlacementSceneAdapter.tsx` composes `SceneRoot` (fleet view, no toggle needed) + `FleetShips` + `HoloGrid` + a ghost-cell layer behind the exact controlled contract `PlacementBoard` had (`draft`/`onChange`/`disabled`); the dock lists unplaced ships as drag sources and the dragged ship lifts off the water while in flight.
- `isLegalInDraft` (bounds + no-overlap against the rest of the draft) is ported verbatim from `PlacementBoard.tsx` — the 3D adapter re-presents the exact same legality, never re-derives it.
- `PlacementScreen.tsx` swaps in `PlacementSceneAdapter` with zero changes to draft state, `generateRandomFleet`, `validateFleetPlacement`-gated `canReady`, or the `placeFleet` emit — only the rendering/interaction layer changed.
- `PlacementBoard.tsx`, `dev/SceneSandbox.tsx`, and `main.tsx`'s `?dev=scene` branch are deleted; `placement.css` now owns only the dock/scene layout and screen chrome, with the shared `.game-scene` container rule reused from `battle.css` (matching 04-06's precedent for `PostGameScreen`).
- `HoloGrid` gained a game-agnostic `onPointerDownCell(coord, button)` callback for press-based consumers, and its amber selected highlight now only engages when `onSelectCell` is provided (so drags don't strand a stale selection).
- UAT feedback round ("everything is too small") uncovered and fixed a real cascade bug: `styles.css`'s generic `.screen { max-width: 26rem }` is bundled AFTER the screen stylesheets, so `battle.css`'s equal-specificity `.battle-screen` max-width silently lost and the whole battle screen rendered in a 26rem column. Fixed with `.screen.battle-screen` specificity, plus raised scene sizes (main battle canvas 40→56rem, side/post-game reveal boards 20→30rem, placement board 64rem) and flex bases so the panels can reach them.
- Camera views reworked per UAT: the targeting view moved from its low water-level angle to an overhead framing like the fleet view (user request: view the enemy grid from above like your own fleet), and both views' lookAt values were solved numerically so the grid projects vertically centered (symmetric NDC y ≈ ±0.77) — the previous fleet framing actually clipped the grid's near edge slightly.
- End-to-end self-verified against the real dev server after each round via two-browser headless Playwright runs using exact camera-projected canvas coordinates: full drag placement of 5 ships (including a mid-drag R rotation), right-click in-place rotation, re-dragging a placed ship, randomize + ready for the second player, server acceptance (both reached `.battle-screen`), a live fire through the new overhead targeting view, and screenshots confirming sizes/centering — zero console errors throughout, steady 60 FPS.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build 3D placement; wire PlacementScreen; retire PlacementBoard and dev sandbox** - `d8dc679` (feat)
2. **UAT fix: drag-and-drop interaction (user decision), HoloGrid onPointerDownCell** - `e782a8a` (fix)
3. **UAT fix: canvas sizes + `.screen` cascade bug + fleet camera tightening** - `9a79cbb` (fix)
4. **UAT fix: overhead targeting view; center grid in both views** - `fe088d9` (fix)

**Plan metadata:** `598ad31` + this update

## Files Created/Modified

- `client/src/scene/PlacementSceneAdapter.tsx` — new placement-phase adapter: dock drag sources, continuous drag with ghost preview, both rotation paths, ported `isLegalInDraft`
- `client/src/scene/grid/HoloGrid.tsx` — `onPointerDownCell(coord, button)` prop; selected highlight gated on `onSelectCell`
- `client/src/scene/camera/CameraRig.tsx` — overhead targeting view; both views tightened and vertically centered
- `client/src/screens/PlacementScreen.tsx` — `PlacementSceneAdapter` replaces `PlacementBoard`; drag hint text; imports `battle.css` for the shared `.game-scene` rule
- `client/src/screens/placement.css` — 2D grid rules removed; dock drag styles; larger single-board scene (64rem)
- `client/src/screens/battle.css` — `.screen.battle-screen` cascade fix; canvas sizes raised; panel flex bases
- `client/src/main.tsx` — `?dev=scene` branch and `SceneSandbox` import removed
- `client/src/components/PlacementBoard.tsx` — deleted
- `client/src/dev/SceneSandbox.tsx` — deleted (and the now-empty `client/src/dev/` directory removed)

## Decisions Made

- **Continuous drag-and-drop over select-then-place** — user decision at UAT, overriding the initial yolo self-resolution. Notably, the implementation disproved the original argument against dragging: `HoloGrid`'s existing per-cell hover events track the drag perfectly well with no manual per-frame raycasting.
- **`.screen.<screen-name>` specificity for screen-level overrides of `styles.css` globals** — screen CSS is bundled before `styles.css` (main.tsx import order), so equal-specificity overrides silently lose; this extends 03-03's "screen CSS must not depend on load order" lesson.
- **Both camera views overhead + numerically centered** — lookAt z solved so grid near/far edges project symmetrically; targeting keeps a slightly higher, flatter framing than fleet so the damped toggle still reads as a camera move.
- **`PlacementScreen` imports `battle.css` alongside `placement.css`** to reuse the shared `.game-scene` container rule rather than duplicating it — consistent with `PostGameScreen`'s existing precedent from 04-06.

## Deviations from Plan

The plan itself executed as written; a post-completion user UAT round then reshaped three aspects (all committed as `fix(04-07)` commits, listed above):

1. **Interaction model reversed by the user** — the checkpoint:decision's self-resolved select-then-place was replaced with continuous drag-and-drop at the user's request ("should be drag and drop in 3d mode just like it was in 2d mode"), which also resolved their report of being unable to rotate ships (rotation is now R-mid-drag + right-click, both verified).
2. **[Rule 1 - Bug] `.screen` cascade bug found via UAT size complaint** — the battle screen had been rendering in a 26rem column since 04-05 without anyone noticing the cause; fixed with selector specificity.
3. **Camera framing reworked** — overhead targeting view + vertically centered grid in both views, per user feedback.

## Issues Encountered

None. Setting up a scratch Playwright install (the repo has no committed Playwright dependency) required a one-time chromium browser download in the sandbox, matched to the exact `playwright` npm version installed — a mismatched cached browser revision initially failed to launch, resolved by running the local `node_modules/.bin/playwright install chromium` for that same installed version rather than a stray global/npx-resolved one.

## Next Phase Readiness

- **Phase 4 (3D Ocean Scene) is now complete.** Every screen — lobby, placement, battle (both targeting and fleet views, plus the always-visible fleet reveal panel), and post-game — renders exclusively through the 3D scene. No 2D board (`TargetingBoard`, `FleetBoard`, `PlacementBoard`) or dev-only harness (`SceneSandbox`) remains anywhere in the client.
- `PlacementSceneAdapter` establishes the same "thin game-facing adapter over state-agnostic primitives" shape as `GameSceneAdapter`, giving Phase 5/6 a consistent pattern to extend (e.g. placement-phase animations, projectile/impact effects) without teaching `HoloGrid`/`FleetShips` new game rules.
- ISS-001 (BattleScreen running two simultaneous live R3F Canvases) remains open in `.planning/ISSUES.md` for Phase 6's performance work — unaffected by this plan.
- No blockers for starting Phase 5.

---
*Phase: 04-3d-ocean-scene*
*Completed: 2026-07-06*
