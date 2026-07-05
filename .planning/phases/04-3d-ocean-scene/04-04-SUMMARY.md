---
phase: 04-3d-ocean-scene
plan: 04
subsystem: ui
tags: [react-three-fiber, three, camera, damp]

requires:
  - phase: 04-3d-ocean-scene (04-01, 04-02, 04-03)
    provides: SceneRoot/Canvas root with Ocean+SkyDome, FleetShips procedural ships, HoloGrid holographic overlay
provides:
  - CameraRig component with named fleetView/targetingView configs, damped position + lookAt transitions driven by a `view` prop
  - SceneRoot now requires an external `view` prop instead of a hardcoded static camera
affects: [04-05 (Battle screen wires `view="targeting"` through GameSceneAdapter), 04-06 (post-game reveal), 04-07 (placement, likely also targeting-style view)]

tech-stack:
  added: []
  patterns: ["THREE.MathUtils.damp per-axis for two-state camera transitions instead of an animation library", "Camera framing owned entirely by a dedicated rig component driven by external state, not hardcoded on the Canvas"]

key-files:
  created: [client/src/scene/camera/CameraRig.tsx]
  modified: [client/src/scene/SceneRoot.tsx, client/src/dev/SceneSandbox.tsx]

key-decisions:
  - "Damp-based transition (THREE.MathUtils.damp, per 04-RESEARCH.md Pattern 3) chosen over adding GSAP/Theatre.js — a two-state camera switch doesn't justify a new animation-library dependency."
  - "CameraRig snaps to the initial view on its first frame rather than damping in from R3F's arbitrary default camera position, avoiding a visible junk transition on mount."
  - "SceneRoot's `view` prop is now required (not defaulted) so every caller — sandbox today, real screens in 04-05/06/07 — must make an explicit camera-view choice rather than silently inheriting a stale default."

patterns-established:
  - "Two-state (or few-state) camera/UI transitions use per-axis THREE.MathUtils.damp against named config objects rather than pulling in an animation library."

issues-created: []

duration: ~35min
completed: 2026-07-05
---

# Phase 4 Plan 4: Camera Rig Summary

**`CameraRig` damps the R3F camera between named `fleetView`/`targetingView` configs via `THREE.MathUtils.damp` — no GSAP/Theatre.js — verified frame-rate independent under 6x CPU throttling in headless Playwright.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-05T14:10:00Z
- **Completed:** 2026-07-05T14:45:00Z
- **Tasks:** 1 auto task + 1 human-verify checkpoint (self-verified per yolo config)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Built `client/src/scene/camera/CameraRig.tsx`: a `view: "fleet" | "targeting"` prop drives per-frame damping of both camera position and a separate `lookAt` target `Vector3` toward one of two named view configs, converging over roughly half a second regardless of frame rate
- `fleetView` frames the 5-ship row from 04-02 (wide, high angle); `targetingView` reuses the scene's prior static default framing, centered closely over the 04-03 `HoloGrid`
- `SceneRoot` now requires and forwards a `view` prop to `<CameraRig>` instead of hardcoding a static `camera` position + `onCreated` lookAt
- `SceneSandbox` gained a view-toggle button (`view: fleet/targeting (click to toggle)`) driving local `view` state through to `SceneRoot`, for both manual and automated verification

## Task Commits

Each task was committed atomically:

1. **Task 1: CameraRig with damp-based fleet-view/targeting-view transitions** - `2b401e0` (feat)

_Checkpoint (human-verify) was self-verified via headless Playwright per project config (yolo mode, self-verification substituting for interactive approval) rather than producing an additional commit._

## Files Created/Modified
- `client/src/scene/camera/CameraRig.tsx` - New: named view configs, per-axis `THREE.MathUtils.damp` transition of camera position + lookAt target, snap-to-initial-view on first frame
- `client/src/scene/SceneRoot.tsx` - Takes a required `view: CameraView` prop, mounts `<CameraRig view={view} />`, dropped the old hardcoded static camera/`onCreated` lookAt
- `client/src/dev/SceneSandbox.tsx` - Added `view` state + toggle button, passed through to `<SceneRoot view={view}>`

## Decisions Made
- Damp-based transition (per 04-RESEARCH.md Pattern 3) over GSAP/Theatre.js — no new dependency needed for a two-state camera switch.
- CameraRig snaps directly to the initial view on its first `useFrame` tick rather than damping in from R3F's arbitrary default camera transform, so there's no visible "flying in from nowhere" on mount.
- `SceneRoot`'s `view` prop is required, not defaulted, so future integration points (04-05/06/07) can't silently fall back to a stale implicit camera.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Local dev environment already had a client Vite server and standalone server process running from a prior session on non-default ports; verification used the existing server process and a freshly started client-only Vite instance rather than the full `npm run dev` (which hit `EADDRINUSE` on the already-running server). This is an environment quirk, not a code issue — no code or config change was needed.

## Next Phase Readiness
- `CameraRig` is fully decoupled from game state — driven purely by the `view` prop — so 04-05 (Battle screen integration) can wire it to real phase/UI state (e.g. `view={hasSelectedTarget ? "targeting" : "fleet"}` or similar) without any further changes to `CameraRig` itself.
- `SceneRoot`'s `view` prop being required means 04-05/06/07 must each explicitly decide what view their screen wants — this is intentional friction against silently reusing whatever the sandbox happened to default to.
- No blockers. Phase 4's remaining three plans (04-05, 04-06, 04-07) handle wiring the ocean/ships/grid/camera stack into the real Battle, Post-Game, and Placement screens respectively, retiring the corresponding 2D components one at a time.

---
*Phase: 04-3d-ocean-scene*
*Completed: 2026-07-05*
