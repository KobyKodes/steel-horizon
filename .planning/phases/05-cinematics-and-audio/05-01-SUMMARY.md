---
phase: 05-cinematics-and-audio
plan: 01
subsystem: 3d-scene
tags: [three, react-three-fiber, camera, math-utils-damp]

# Dependency graph
requires:
  - phase: 04-3d-ocean-scene
    provides: CameraRig's damped fleet/targeting view-switching pattern (04-04/04-07), which this plan extends rather than replaces
provides:
  - CameraRig accepts an optional shellFocus (position/lookAt) to damp toward a live, per-frame-updating target instead of a named view
  - triggerCameraShake(intensity) — module-level, decaying, position-only camera shake applied after lookAt()
affects: [05-03 (firing sequence wires shellFocus + triggerCameraShake into the real Battle screen)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Camera chase-target as a per-frame prop override (shellFocus), not a named CameraView, since a static VIEWS entry can't represent a moving position"
    - "Module-level mutable intensity + exported trigger function for a cross-cutting camera effect, avoiding ref-forwarding through SceneRoot"

key-files:
  created: []
  modified:
    - client/src/scene/camera/CameraRig.tsx

key-decisions:
  - "shellFocus is a per-frame override prop, not a third CameraView literal — VIEWS stays a Record of exactly fleet/targeting"
  - "Shake is hand-rolled inside CameraRig's own useFrame (position offset only, applied after lookAt), not drei's CameraShake — confirmed incompatible in 05-RESEARCH.md because CameraShake overwrites camera.rotation from a stale snapshot while CameraRig recomputes rotation via lookAt() every frame"
  - "Shake state is a plain module-level mutable variable + triggerCameraShake(intensity) export, not a ref/imperative handle — keeps CameraRig callable exactly as SceneRoot already calls it (<CameraRig view={view} />), no prop-drilling a ref through SceneRoot/GameSceneAdapter for this plan"
  - "Overlapping shake triggers take the max intensity, not additive stacking, to avoid runaway amplification from rapid repeated impacts"
  - "Shake offsets X/Y only, never Z or camera.rotation directly — avoids clipping through the water plane and avoids fighting lookAt's rotation ownership"

patterns-established:
  - "Cinematics-phase camera effects extend CameraRig's single useFrame loop rather than mounting sibling R3F components that also touch camera.position/rotation"

issues-created: []

# Metrics
duration: ~45min
completed: 2026-07-06
---

# Phase 5 Plan 1: Camera Primitives Summary

**CameraRig extended with a live shell-follow focus override and a hand-rolled, decaying screen-shake position offset, with zero behavioral change to existing fleet/targeting damped transitions.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-06T09:00:00Z (approx)
- **Completed:** 2026-07-06T09:47:10Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `CameraRig` accepts an optional `shellFocus?: ViewConfig | null` prop; when set, the camera damps position/lookAt toward it every frame instead of the named view's static config — always damps, never snaps, even on the first frame it appears
- Added `triggerCameraShake(intensity: number)`, a module-level exported function that decays a shared shake intensity via the same `MathUtils.damp` pattern already used for view transitions
- Shake applies a small random X/Y-only additive offset to `camera.position` *after* `camera.lookAt()` each frame — never touches `camera.rotation` directly, avoiding the exact incompatibility 05-RESEARCH.md identified with drei's `<CameraShake>`
- Verified via a standalone numeric simulation of the shake math (not the full R3F render): shake fully decays to intensity 0 in ~3.5s with up to ~0.55 world-unit single-axis offset, settling back to within ~0.0005 units of the true target — no permanent drift
- Confirmed zero behavioral change to existing callers: `SceneRoot.tsx` is the only place `<CameraRig>` is mounted, and it renders `<CameraRig view={view} />` with no `shellFocus` — so `shellFocus ?? VIEWS[view]` resolves identically to the pre-existing code path, and shake intensity starts and stays at 0 since nothing calls `triggerCameraShake` yet

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a dynamic shell-follow focus to CameraRig** - `2b512a7` (feat)
2. **Task 2: Add hand-rolled screen shake applied after lookAt** - `2f876a0` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `client/src/scene/camera/CameraRig.tsx` - Added `shellFocus` prop (damped per-frame chase target) and `triggerCameraShake`/module-level decaying shake offset applied after `lookAt()`

## Decisions Made
- See `key-decisions` in frontmatter — summarized: shellFocus stays a per-frame prop override (not a new named view); shake is hand-rolled inside `CameraRig`'s existing `useFrame` as a position-only offset (not drei's `CameraShake`); shake state is a plain module-level variable + exported trigger function (not a forwarded ref) to avoid touching `SceneRoot`'s props in this plan; overlapping triggers take max intensity, not additive stacking.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The local dev server (`npm run dev`, ports 5173/3001) was already running from a prior session when this plan started; a duplicate `npm run dev` invocation collided on port 3001, and cleanup accidentally killed the original running instance via an overly broad `pkill -f concurrently`. Restarted cleanly on the standard ports with no lasting effect — noted here only as a process-hygiene note, not a code issue.
- No local Playwright installation existed in the repo (unlike prior phases' STATE.md notes referencing headless Playwright runs, which appear to have used an ad hoc/global install). Installed a temporary Playwright + Chromium in the scratchpad directory to run a smoke check (page loads, zero console errors) rather than in the project itself, keeping the repo's dependency tree untouched.

## Next Phase Readiness
- `CameraRig` is ready for 05-02 (particle burst) and especially 05-03 (firing sequence), which will compute a shell's live world position each frame and pass it as `shellFocus`, then call `triggerCameraShake` on impact
- No blockers. The manual "temporarily call triggerCameraShake from a dev console" verification described in the plan was performed as an equivalent standalone simulation of the exact math instead (full interactive dev-console access to a running R3F app wasn't practical in this environment); the math confirms the intended decay/no-drift behavior precisely, but a future plan (05-03) will exercise it visually for the first time as part of the real firing sequence and should double check the shake reads well at actual camera scale/FOV in-game.

---
*Phase: 05-cinematics-and-audio*
*Completed: 2026-07-06*
