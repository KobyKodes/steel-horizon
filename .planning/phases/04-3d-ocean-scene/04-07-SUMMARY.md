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
  - PlacementSceneAdapter — the placement-phase adapter over SceneRoot/FleetShips/HoloGrid using a select-ship-then-click-cell interaction model
  - Full fleet placement (select, place, rotate, randomize, ready) rendered entirely in the 3D scene, wired into the real PlacementScreen against the real server
  - client/src/components/PlacementBoard.tsx and client/src/dev/SceneSandbox.tsx deleted; main.tsx's ?dev=scene branch removed — no 2D board or isolated dev harness remains anywhere in the client
affects: [phase-05, phase-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "select-then-place interaction model (checkpoint decision): a dock UI picks the 'active' ship, a HoloGrid cell click places it at the current orientation, a Rotate control/R-key flips orientation for either an unplaced (pending) or already-placed (in-place, legality-gated) active ship — reuses HoloGrid's existing click-to-select plumbing instead of adding continuous-drag raycasting machinery"
    - "Draft-time legality (isLegalInDraft: bounds + no-overlap against the rest of the draft) is ported verbatim from the retired PlacementBoard.tsx into PlacementSceneAdapter.tsx rather than re-derived, keeping one legality implementation used identically pre-3D and post-3D"

key-files:
  created:
    - client/src/scene/PlacementSceneAdapter.tsx
  modified:
    - client/src/screens/PlacementScreen.tsx
    - client/src/screens/placement.css
    - client/src/main.tsx
  deleted:
    - client/src/components/PlacementBoard.tsx
    - client/src/dev/SceneSandbox.tsx

key-decisions:
  - "Checkpoint decision resolved as select-then-place (not continuous 3D drag): reuses HoloGrid's existing R3F click-to-select interaction almost as-is, avoids per-frame raycasting against the grid plane during a drag, and keeps rotate-while-positioning simple (a button/R-key flip rather than a mid-drag gesture) — the plan's own analysis favored this for robustness and accessibility, and no interaction requirement in PROJECT.md called for drag-and-drop specifically."
  - "PlacementScreen imports battle.css in addition to placement.css purely for the shared .game-scene container rule, matching the precedent PostGameScreen already set (04-06) for reusing that class across every GameSceneAdapter/PlacementSceneAdapter consumer rather than duplicating the rule per screen."

patterns-established:
  - "PlacementSceneAdapter: game-facing placement API over the same state-agnostic primitives GameSceneAdapter uses, following the same 'thin adapter, ported legality/derivation logic, no new rules taught to the primitives' shape established in 04-05/04-06."

issues-created: []

# Metrics
duration: ~70min
completed: 2026-07-06
---

# Phase 4 Plan 07: Placement 3D Integration Summary

**Fleet placement now happens entirely in the 3D scene via a select-ship-then-click-cell interaction (`PlacementSceneAdapter`), completing Phase 4's "2D board retired" goal — `PlacementBoard.tsx` and the `?dev=scene` sandbox are both deleted.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-07-05 (session continued into 2026-07-06)
- **Completed:** 2026-07-06
- **Tasks:** 1 planned auto task + 1 pre-task checkpoint:decision + 1 final checkpoint:human-verify (both self-verified per yolo config)
- **Files modified:** 6 (1 created, 3 modified, 2 deleted)

## Accomplishments

- Resolved the plan's opening `checkpoint:decision` (continuous-drag vs. select-then-place) as **select-then-place**, self-decided per the yolo config's self-verification approach: it reuses `HoloGrid`'s existing click-to-select plumbing from 04-03/04-05 instead of adding per-frame raycasting/drag machinery, and keeps rotation a simple, robust control rather than a mid-drag 3D gesture.
- `PlacementSceneAdapter.tsx` composes `SceneRoot` (fleet view, no toggle needed) + `FleetShips` + `HoloGrid` behind the exact controlled contract `PlacementBoard` had (`draft`/`onChange`/`disabled`): a dock lists all 5 ships with placed/unplaced + orientation status, clicking a dock entry makes it "active," clicking a grid cell places the active ship, and a Rotate control (plus an R-key shortcut) flips orientation — for an unplaced ship it flips the pending orientation used on the next placement click, for an already-placed ship it rotates in place gated by the same legality check.
- `isLegalInDraft` (bounds + no-overlap against the rest of the draft) is ported verbatim from `PlacementBoard.tsx` — the 3D adapter re-presents the exact same legality, never re-derives it.
- `PlacementScreen.tsx` swaps in `PlacementSceneAdapter` with zero changes to draft state, `generateRandomFleet`, `validateFleetPlacement`-gated `canReady`, or the `placeFleet` emit — only the rendering/interaction layer changed.
- `PlacementBoard.tsx`, `dev/SceneSandbox.tsx`, and `main.tsx`'s `?dev=scene` branch are deleted. `placement.css`'s 2D drag/grid rules (ghost previews, lifting, pointer-drag cursor states) are removed; the file now owns only the dock/scene layout and screen chrome, with the shared `.game-scene` container rule reused from `battle.css` (matching 04-06's precedent for `PostGameScreen`).
- End-to-end self-verified against the real dev server: a two-browser headless Playwright run created a room, readied up into placement, manually selected+placed+rotated a full 5-ship fleet for one player (verified via projecting each grid cell's exact camera-space screen position from the real `CameraRig` fleet-view config and clicking the live canvas), used "Randomize fleet" for the other player, confirmed both `Ready` submissions were accepted by the server (both reached `.battle-screen`), and fired one live shot through the targeting-view canvas as a regression check on 04-05's targeting interaction — zero console errors, screenshots confirm all 5 ships rendered at their correct, non-overlapping grid positions (including the rotated cruiser) with the dock UI correctly reflecting placed/orientation state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build select-then-place 3D interaction; wire PlacementScreen; retire PlacementBoard and dev sandbox** - `d8dc679` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `client/src/scene/PlacementSceneAdapter.tsx` — new placement-phase adapter: dock UI, select-then-place interaction, rotate control, ported `isLegalInDraft`
- `client/src/screens/PlacementScreen.tsx` — `PlacementSceneAdapter` replaces `PlacementBoard`; hint text updated for the new interaction; now also imports `battle.css` for the shared `.game-scene` rule
- `client/src/screens/placement.css` — 2D drag/grid rules removed; dock restyled for button-based select-then-place (active/placed states, flash-illegal), scene/dock flex layout added
- `client/src/main.tsx` — `?dev=scene` branch and `SceneSandbox` import removed
- `client/src/components/PlacementBoard.tsx` — deleted
- `client/src/dev/SceneSandbox.tsx` — deleted (and the now-empty `client/src/dev/` directory removed)

## Decisions Made

- **select-then-place over continuous-drag** for the 3D placement interaction (see `key-decisions` above) — chosen for robustness/accessibility and to reuse existing `HoloGrid` click-to-select plumbing rather than building new per-frame raycasting/drag machinery.
- **`PlacementScreen` imports `battle.css` alongside `placement.css`** to reuse the shared `.game-scene` container rule rather than duplicating it — consistent with `PostGameScreen`'s existing precedent from 04-06.

## Deviations from Plan

None — plan executed exactly as written. The plan's own checkpoint:decision was resolved via self-verification (per this project's yolo config) rather than blocking on a human; the option chosen (select-then-place) and the reasoning were already laid out in the plan's own `<options>` text.

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
