---
phase: 05-cinematics-and-audio
plan: 02
subsystem: 3d-scene-vfx
tags: [three, r3f, particles, points, buffergeometry, additive-blending]

# Dependency graph
requires:
  - phase: 04-3d-ocean-scene
    provides: waves.ts single source of truth for wave math (gerstnerHeight), ShipModel's per-class memoization pattern
  - phase: 05-cinematics-and-audio (05-01)
    provides: CameraRig shell-follow/shake groundwork this plan's presets will be triggered alongside
provides:
  - "ParticleBurst component with splash/explosion/debris presets"
  - "Settled layered-realism aesthetic direction for all future gritty VFX in this phase"
affects: [05-03 firing sequence, 05-04 sinking sequence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preset config table as the shared/memoized part of a per-instance-stateful component (mirrors ShipModel's per-class memoization, 04-02)"
    - "Particle systems sample wave height via gerstnerHeight() at spawn rather than hand-rolling an approximation (waves.ts remains the single source of truth)"

key-files:
  created: [client/src/scene/effects/ParticleBurst.tsx]
  modified: []

key-decisions:
  - "Layered realism (checkpoint:decision Task 1, USER override of the plan's framing): explosions/smoke/debris render in gritty, realistic naval-war-film colors (warm orange fire, gray-black debris/smoke); the holographic teal/amber grid/HUD stays a separate overlay layer rendered above/independent of these effects. The tension is resolved by depth (\"tactical HUD over real combat\"), not by tinting effects teal."

patterns-established:
  - "Any future particle/VFX preset in this phase (05-03, 05-04) should follow ParticleBurst's preset-table pattern rather than one-off Points components, and must stay within the layered-realism palette (no teal-tinted combat effects)."

issues-created: []

# Metrics
duration: 45min
completed: 2026-07-06
---

# Phase 5 Plan 2: Particle Burst Summary

**One `ParticleBurst` component (Points + BufferGeometry, useFrame-integrated) covering splash/explosion/debris, with the gritty-vs-holographic aesthetic tension resolved as "layered realism" — realistic warm/gray combat VFX under a still-teal HUD, not a teal-tinted compromise.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-06T09:08:00Z
- **Completed:** 2026-07-06T09:53:00Z
- **Tasks:** 2
- **Files modified:** 1 created

## Accomplishments
- Resolved the phase's opening aesthetic-tension checkpoint via explicit USER decision (layered realism), settling the color/material direction for every future particle effect in this phase
- Built `ParticleBurst`, a single reusable component serving all three effect types (splash/explosion/debris) needed by 05-03 (firing) and 05-04 (sinking) — no new VFX dependency
- Verified all three presets visually animate/fade correctly and `onComplete` fires exactly once per burst, via a temporary (uncommitted) Playwright-driven Canvas mount

## Task Commits

1. **Task 1: Resolve gritty-naval-war-film vs. holographic-teal aesthetic tension** - decision only, no commit (USER selected "layered" via checkpoint:decision)
2. **Task 2: Build the reusable ParticleBurst component** - `b09cb06` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `client/src/scene/effects/ParticleBurst.tsx` - `Points`-based burst component; `BurstPreset = "splash" | "explosion" | "debris"`; per-preset config table (count, lifetime, color, size, gravity, blending, speed range, spread shape); integrates velocity/gravity/fade in `useFrame`; splash samples `gerstnerHeight()` at spawn for live wave-surface Y; calls `onComplete` once per burst

## Decisions Made

**Layered realism (checkpoint:decision Task 1, USER override):** The plan's Task 1 checkpoint presented two options (`layered` vs `unified-teal`). The user selected `layered`: explosions/smoke/debris render in realistic, gritty naval-war-film colors (`#ff7a1a` warm orange fire for explosion, `#2b2622` dark gray-black for debris) rather than being tinted toward the scene's holographic teal/amber palette established in Phase 4. The existing holographic grid/HUD (`HoloGrid`, 04-03) remains a separate stylized overlay layer rendered above/independent of these particle effects — resolving the tension by depth ("tactical HUD over real combat") rather than by color compromise. Splash (`#dce9ec`, pale foam-white) was called out in the plan as looking the same under either resolution, since real water spray doesn't read as sci-fi regardless of palette choice — implemented as such.

This decision is now the binding color/material direction for 05-03 (shell impact) and 05-04 (sinking), which must not introduce teal-tinted combat VFX.

## Deviations from Plan

None - plan executed exactly as written. The plan's `<verify>` step called for "a temporary manual mount in an existing dev context (e.g., render inside SceneRoot)" — the actual verification used a bare close-up `Canvas` instead of `SceneRoot`, because `SceneRoot`'s `CameraRig` only exposes the `fleet`/`targeting` views (both framed 48-56 world units up for full-grid overview), which rendered the bursts as a few nearly invisible pixels. A bare Canvas with a close camera was necessary to actually see preset colors/shapes, consistent with the verify step's intent (visual confirmation) even though the literal SceneRoot suggestion wasn't usable. Both the temporary harness file and the `main.tsx` dev-route edit used for verification were deleted/reverted before the final commit, per the plan's file list (`client/src/scene/effects/ParticleBurst.tsx` only).

## Issues Encountered

Playwright wasn't preinstalled in this repo (no `@playwright/test` dependency, unlike what prior phase STATE.md notes describe using). Installed `playwright@1.48.0` ad hoc into the scratchpad directory and downloaded Chromium there to run the one-off visual verification; nothing was added to the project's own dependencies.

## Next Phase Readiness
- `ParticleBurst` is ready for 05-03 (shell impact: needs `splash` at wave surface, `explosion` at impact point) and 05-04 (sinking: likely `debris`, possibly a new preset if smoke/bubbles need different physics — reuse this component's pattern rather than building a parallel one)
- No blockers. The layered-realism decision is now settled and should be treated as binding for all remaining Phase 5 VFX work.

---
*Phase: 05-cinematics-and-audio*
*Completed: 2026-07-06*
