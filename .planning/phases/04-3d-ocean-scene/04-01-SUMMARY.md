---
phase: 04-3d-ocean-scene
plan: 01
subsystem: 3d-scene
tags: [react-three-fiber, three.js, shaders, gerstner-waves]

# Dependency graph
requires:
  - phase: 03-playable-2d-client
    provides: proven multiplayer flow (lobby/placement/battle/postgame) that this plan must leave untouched
provides:
  - Pinned R3F stack (three@0.185.1, @react-three/fiber@8.9.2, @react-three/drei@9.122.0) compatible with the React 18.3 client
  - Single source of truth for wave math (client/src/scene/waves.ts) — gerstnerHeight() and shared WaveParams constants that later plans (ship bob/pitch) must read from, not re-derive
  - Animated Gerstner-wave ocean shader (Ocean.tsx), sky/sun/fog (SkyDome.tsx), and a SceneRoot Canvas wrapper with dev FPS/draw-call stats
  - Isolated `/?dev=scene` dev sandbox route (SceneSandbox.tsx) for visual verification, wired via a query-param branch in main.tsx that leaves the real app entry point unaffected
affects: [04-02 (ship bob/pitch sampling waves.ts), 04-03..04-05 (scene composition inside SceneRoot), 04-06 (removes SceneSandbox once scene is wired into real screens)]

# Tech tracking
tech-stack:
  added: [three@0.185.1, "@react-three/fiber@8.9.2", "@react-three/drei@9.122.0"]
  patterns:
    - "Wave math lives in one pure module (waves.ts); Ocean's vertex shader and any future ship-bob code must read the same WaveParams constants, never a re-derived approximation"
    - "Shader uniform time is mutated directly in useFrame (uniforms.uTime.value = ...), never routed through React state, to avoid a re-render every frame"
    - "Dev-only instrumentation (Stats/PerformanceMonitor) is gated on import.meta.env.DEV and lives behind a query-param sandbox route, never inline in the production App tree"

key-files:
  created:
    - client/src/scene/waves.ts
    - client/src/scene/Ocean.tsx
    - client/src/scene/SkyDome.tsx
    - client/src/scene/SceneRoot.tsx
    - client/src/dev/SceneSandbox.tsx
  modified:
    - client/package.json
    - package-lock.json
    - client/src/main.tsx
    - client/src/vite-env.d.ts

key-decisions:
  - "Exact pinned versions (three 0.185.1 / fiber 8.9.2 / drei 9.122.0) used instead of latest npm tags — fiber 9.x/drei 10.x require React 19, which would conflict with the Phase 1 React 18.3 pin"
  - "Stylized holographic teal/blue Fresnel-rim shader chosen over three's reflection-based Water.js addon — cheaper and a better aesthetic fit per 04-RESEARCH.md"
  - "SceneSandbox reached via a `?dev=scene` query-param branch in main.tsx, the only change to the existing entry point, so the real app's routes are provably unaffected"

patterns-established:
  - "New rendering subsystems get an isolated dev sandbox route (query-param gated) for visual verification before being wired into the real screens, kept until a later cleanup plan removes it"

# Metrics
duration: ~30min (2 auto tasks + human-verify checkpoint, approved first pass)
completed: 2026-07-04
---

# Phase 4, Plan 1: 3D Ocean Scene Foundation Summary

**React Three Fiber foundation: pinned dependencies, an animated Gerstner-wave ocean shader with sky/fog, and an isolated `/?dev=scene` dev sandbox — the shared foundation every later Phase 4 plan builds on**

## Performance

- **Tasks:** 2 auto tasks + 1 human-verify checkpoint (approved on first pass, no fix-iterate needed)
- **Files modified:** 9

## Accomplishments
- Installed and verified the exact pinned R3F stack (three 0.185.1 / fiber 8.9.2 / drei 9.122.0), confirmed compatible with the existing React 18.3 client with zero new type errors
- Built `waves.ts` as the single source of truth for Gerstner wave math, `Ocean.tsx` (subdivided plane + custom vertex/fragment shader with Fresnel rim), `SkyDome.tsx` (drei `<Sky>` + fog + lighting), and `SceneRoot.tsx` (Canvas + dev Stats/PerformanceMonitor)
- Wired an isolated `/?dev=scene` sandbox route via a single query-param branch in `main.tsx`, leaving the real multiplayer app untouched
- Human two-browser-style visual checkpoint confirmed: animated waves, naval time-of-day sky/sun/fog, stable FPS, and `/` (no query param) rendering the normal landing screen exactly as before

## Task Commits

1. **Task 1: Install pinned R3F dependencies** - `7b7c4de` (feat)
2. **Task 2: Build wave module, ocean shader, sky/fog, SceneRoot, dev sandbox** - `68cb934` (feat)
3. **Checkpoint: human visual verification of `/?dev=scene`** - approved, no fixes required

## Files Created/Modified
- `client/src/scene/waves.ts` - `WaveParams` type, shared wave constants, pure `gerstnerHeight()` function
- `client/src/scene/Ocean.tsx` - subdivided plane mesh + custom ShaderMaterial (Gerstner vertex displacement, Fresnel-rim fragment shader), uTime mutated in `useFrame`
- `client/src/scene/SkyDome.tsx` - drei `<Sky>`, `<fog>`, ambient + directional lighting
- `client/src/scene/SceneRoot.tsx` - `<Canvas>` composing Ocean/SkyDome + dev-only `<PerformanceMonitor>`/`<Stats>`
- `client/src/dev/SceneSandbox.tsx` - standalone full-viewport page rendering `<SceneRoot />`
- `client/src/main.tsx` - `?dev=scene` query-param branch to SceneSandbox; otherwise unchanged App entry
- `client/package.json`, `package-lock.json` - pinned R3F dependency versions
- `client/src/vite-env.d.ts` - supporting type declarations for the new scene modules

## Deviations from Plan
None — plan executed as written; checkpoint approved on first pass with no fixes needed.
