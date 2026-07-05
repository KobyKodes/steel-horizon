# Roadmap: Steel Horizon

## Overview

Build a cheat-resistant online 1v1 Battleship game inside a cinematic 3D naval scene, in that order of risk: first the shared rules engine and authoritative Socket.IO server, proven with a plain 2D client playing complete games end-to-end — then replace the board with the hyper-realistic 3D ocean, ships, and firing cinematics, harden the edge cases, and ship it live on Render. The multiplayer loop is never allowed to break while the presentation layer grows on top of it.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Monorepo scaffold + shared game rules engine with thorough unit tests (completed 2026-07-03)
- [x] **Phase 2: Multiplayer Server** - Authoritative Socket.IO server: rooms, matchmaking, full game loop, reconnect (completed 2026-07-04)
- [x] **Phase 3: Playable 2D Client** - Complete flow (lobby → placement → battle → post-game) on a plain 2D board (completed 2026-07-04)
- [ ] **Phase 4: 3D Ocean Scene** - Animated water, procedural ships, holographic grid, camera system
- [ ] **Phase 5: Cinematics & Audio** - Firing sequences, particles, sinking animations, HUD polish, sound
- [ ] **Phase 6: Resilience & Edge Cases** - Turn timers, disconnect handling, reduced-effects mode, final QA
- [ ] **Phase 7: Deployment** - Live on Render free tier with graceful cold-start and README

## Phase Details

### Phase 1: Foundation
**Goal**: npm-workspaces monorepo (client/server/shared) with the complete Battleship rules engine in `/shared` — board model, placement validation, shot resolution, win detection — fully unit-tested with Vitest.
**Depends on**: Nothing (first phase)
**Research**: Unlikely (established stack setup, pure game logic)
**Plans**: 4 plans

Plans:
- [x] 01-01: Monorepo scaffold — workspaces, TypeScript configs, Vite client shell, Express server shell, shared package wiring, `npm run dev`
- [x] 01-02: Shared foundation — board/coordinate primitives, fleet definitions, typed protocol events, Vitest setup
- [x] 01-03: Placement validation (TDD) — fleet legality rules + random fleet generator
- [x] 01-04: Shot resolution & win detection (TDD) — hit/miss/sunk, repeat-shot rejection, fleet-destroyed check

### Phase 2: Multiplayer Server
**Goal**: Authoritative server running complete games over Socket.IO — room creation with 6-char codes, quick-match queue, lobby ready-up, simultaneous placement, alternating turns with full validation, redacted state snapshots for refresh-proof reconnect — proven by headless socket clients playing scripted games.
**Depends on**: Phase 1
**Research**: Likely (real-time architecture decisions)
**Research topics**: Socket.IO room/namespace patterns, reconnect + session-resume strategy (socket identity across refreshes), redacted-snapshot state design, in-memory repository interface shape
**Plans**: 3 plans

Plans:
- [x] 02-01: Rooms & matchmaking — create/join by code, quick-match queue, lobby with ready indicators, double-join rejection (completed 2026-07-04)
- [x] 02-02: Game loop — placement phase, coin-flip first turn, shot handling with server-side validation, sunk/win resolution, post-game reveal + rematch (completed 2026-07-04)
- [x] 02-03: Reconnect & headless verification — redacted snapshot on reconnect, 60s grace/forfeit, scripted headless-client games as integration tests (completed 2026-07-04)

### Phase 3: Playable 2D Client
**Goal**: Two people in different browsers play a complete game against the real server on a plain 2D board — landing screen, lobby, drag-to-place with rotate/randomize, battle with shot log, post-game stats and rematch. Proves the entire multiplayer flow before any 3D work.
**Depends on**: Phase 2
**Research**: Unlikely (React + Zustand internal patterns, protocol already defined in /shared)
**Plans**: 3 plans

Plans:
- [x] 03-01: App shell & connection — landing screen, name entry, create/join/quick-match, Zustand store driven by server snapshots, lobby (completed 2026-07-04)
- [x] 03-02: Placement UI — 2D grid, drag-to-place, R/right-click rotate, randomize button, ready-up (completed 2026-07-04)
- [x] 03-03: Battle & post-game — targeting board, shot results, turn indicator, shot log, board reveal, stats, rematch flow (completed 2026-07-04)

### Phase 4: 3D Ocean Scene
**Goal**: The 2D board replaced by the cinematic scene — animated ocean with sun glare and fog, procedurally built ship meshes bobbing on the waves, glowing holographic grid overlay, smooth camera transitions between fleet view and targeting view — while the proven multiplayer flow keeps working unchanged.
**Depends on**: Phase 3
**Research**: Likely (specialized 3D techniques)
**Research topics**: R3F water/ocean shader approaches (Drei helpers vs custom GLSL), procedural ship mesh construction in Three.js, wave-synced buoyancy, camera rig transitions, 60fps performance budgeting
**Plans**: 7 plans (expanded from initial 4-plan estimate during 04-RESEARCH.md/planning — integration into real screens split out per-screen to keep each plan focused)

Plans:
- [x] 04-01: Ocean environment — water shader, sky/sun/fog, time-of-day gradient, render loop and performance baseline (completed 2026-07-04)
- [x] 04-02: Procedural ships — hull/superstructure/turret/radar meshes for all 5 classes, wave bob and pitch (completed 2026-07-05)
- [x] 04-03: Holographic grid & interaction — glowing grid overlay, hover readout, cell targeting, placement in 3D (completed 2026-07-05)
- [x] 04-04: Camera system — fleet view / targeting view rig with damp-based animated transitions, isolated in the dev sandbox (completed 2026-07-05)
- [ ] 04-05: Battle screen integration — wire ocean/ships/grid/camera into the real Battle screen via a `GameSceneAdapter`, retiring the 2D `TargetingBoard`
- [ ] 04-06: Post-game integration — read-only reveal mode on `GameSceneAdapter`, retiring the 2D `FleetBoard`
- [ ] 04-07: Placement integration — 3D placement interaction on the holographic grid, retiring the 2D `PlacementBoard` and the dev sandbox; completes "2D board retired" across every screen

### Phase 5: Cinematics & Audio
**Goal**: Every shot is a cinematic beat — camera push-in, shell arc with smoke trail, splash or explosion with screen shake, listing/sinking ships with bubbles and debris, each ≤2.5s and skippable — plus the naval-command HUD (fleet silhouettes, shot log, timers) and self-contained audio with persisted mute.
**Depends on**: Phase 4
**Research**: Likely (particle and sequencing techniques)
**Research topics**: R3F particle systems (fire/smoke/water column), shell-arc animation with camera choreography, interruptible/skippable animation sequencing, lightweight self-contained audio (WebAudio-generated vs tiny embedded samples)
**Plans**: 3 plans

Plans:
- [ ] 05-01: Firing sequence — camera push-in, shell arc + smoke trail, splash/explosion particles, screen shake, skippable ≤2.5s timeline
- [ ] 05-02: Sinking & HUD — list/flood/slide-under with bubbles and debris, fleet-status silhouettes, shot log, connection status
- [ ] 05-03: Audio & feel — fire/splash/explosion/klaxon/ambient loop, persisted mute toggle, hover/disabled-state polish, animated state changes

### Phase 6: Resilience & Edge Cases
**Goal**: The game survives hostile and unlucky conditions — 45s turn timer with AFK escalation, 90s placement timer with auto-place, disconnect mid-animation, double-join, spam clicks — plus the reduced-effects toggle holding 60fps, verified by full games in two browser windows.
**Depends on**: Phase 5
**Research**: Unlikely (hardening internal systems against defined edge cases)
**Plans**: 2 plans

Plans:
- [ ] 06-01: Timers & AFK — 45s turn timer with random-fire/auto-forfeit escalation, 90s placement auto-place, server-driven timer sync
- [ ] 06-02: Edge cases & performance — disconnect mid-animation, double-join, input spam, reduced-effects mode, full 2-browser QA pass

### Phase 7: Deployment
**Goal**: Steel Horizon live on a public Render URL — single Node web service serving the built client and Socket.IO, friendly cold-start/wake experience, README with setup and protocol overview. v1 is done.
**Depends on**: Phase 6
**Research**: Likely (first deployment)
**Research topics**: Render free-tier web service config (build command, health checks, WebSocket support), cold-start detection/UX patterns, serving Vite static build from Express
**Plans**: 2 plans

Plans:
- [ ] 07-01: Production build & Render deploy — single-service build pipeline, static serving, live URL, WebSocket verification
- [ ] 07-02: Cold-start UX & README — wake/connecting screen, setup docs, protocol overview, final live QA

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-07-03 |
| 2. Multiplayer Server | 3/3 | Complete | 2026-07-04 |
| 3. Playable 2D Client | 3/3 | Complete | 2026-07-04 |
| 4. 3D Ocean Scene | 4/7 | In progress | - |
| 5. Cinematics & Audio | 0/3 | Not started | - |
| 6. Resilience & Edge Cases | 0/2 | Not started | - |
| 7. Deployment | 0/2 | Not started | - |
