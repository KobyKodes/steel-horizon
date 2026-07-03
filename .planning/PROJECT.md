# Steel Horizon

## What This Is

A production-quality, browser-based 1v1 Battleship game played online in real time. The visual bar is "hyper-realistic naval war room": a 3D ocean scene with physically-plausible water, procedurally built ship models, cinematic firing sequences, and tactile feedback — not a flat grid of divs. It's both a game friends actually play (share a link, play) and a portfolio showcase piece.

## Core Value

Two people on different machines play a complete, cheat-resistant game of Battleship inside a cinematic 3D naval scene — and both halves (bulletproof multiplayer, hyper-realistic presentation) are equally non-negotiable.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Game rules (classic Battleship, strictly enforced server-side)**

- [ ] 10×10 grid (columns A–J, rows 1–10)
- [ ] Fleet per player: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- [ ] Placement: horizontal/vertical only, no overlap, fully on board; ships MAY touch (classic rules)
- [ ] Drag-to-place, R or right-click to rotate, "randomize fleet" button
- [ ] Turns strictly alternate; shot result is hit, miss, or sunk (announce which ship); repeat shots on the same cell rejected
- [ ] Win when all 5 enemy ships are sunk
- [ ] Disconnect: 60s reconnect grace period, then opponent wins by forfeit
- [ ] Per-turn timer: 45s; timeout forfeits the turn; after 2 consecutive timeouts a random untargeted cell is fired for the AFK player; auto-forfeit after 4

**Multiplayer flow**

- [ ] Landing screen: enter display name → "Create private game" (6-character room code + shareable link) or "Join with code"
- [ ] "Quick match" queue pairing the two most recent waiting players
- [ ] Lobby: both players shown with ready indicators
- [ ] Placement phase: simultaneous, 90s timer; unplaced ships auto-placed at expiry
- [ ] Battle phase: server coin-flips who goes first, shown as a short animation
- [ ] Post-game: reveal both boards; stats (accuracy, longest hit streak, shots taken); rematch offer (both must accept, boards reset)

**Protocol & anti-cheat**

- [ ] Authoritative server: all game rules enforced server-side; client is a dumb renderer
- [ ] Every Socket.IO event defined in `/shared` with typed payloads
- [ ] Server NEVER sends opponent ship positions until game end — shot results only; assume a hostile client reading every websocket frame
- [ ] Validate every inbound event: player's turn, correct phase, cell in bounds, move legal; reject invalid input with a typed error
- [ ] Refresh-proof reconnect: server holds full state; on reconnect the client receives a complete redacted snapshot and re-renders from it

**Hyper-realistic presentation (core of the ask — invest here)**

- [ ] Ocean: animated water (waves / water shader), sun glare, subtle fog, time-of-day gradient; the grid floats as a glowing holographic overlay
- [ ] Ships: stylized-realistic low-poly-but-detailed meshes built procedurally in Three.js (hull, superstructure, turrets, radar) — NO external model downloads, fully self-contained; ships gently bob and pitch with the waves
- [ ] Firing sequence: cinematic beat — camera push-in, shell arc with smoke trail, water-column splash (miss) or explosion with fire/smoke particles and screen shake (hit); sinking ships list, take on water, slide under with bubbles and debris; each sequence under ~2.5s and skippable
- [ ] Two views: your fleet, and the targeting board (holographic radar-table aesthetic); smooth animated camera transition when switching
- [ ] HUD: naval-command aesthetic — fleet status silhouettes filling in red as ships take damage, turn timer, shot log ("B7 — HIT", "Enemy Cruiser sunk"), opponent connection status
- [ ] Audio: small self-contained sounds (fire, splash, explosion, klaxon on sunk, ambient ocean loop); mute toggle persisted in localStorage
- [ ] Feel: hover target readout; disabled/targeted cells clearly distinct; all state changes animated
- [ ] Performance: 60fps on a mid-range laptop; "reduced effects" toggle dropping particles and water quality

**Deployment**

- [ ] Live on Render free tier: single Node web service serving the built client and running Socket.IO
- [ ] Graceful cold-start/wake experience (free instances spin down when idle)
- [ ] `npm run dev` at repo root starts everything locally; README with setup steps and a short protocol overview

### Out of Scope

- Accounts / auth — v1 uses display names only; add in v2 if ever
- Persistent server / database — in-memory repository behind an interface, swappable for Redis later
- Spectators — 1v1 only
- Chat — not needed for the core loop
- Mobile touch optimization — desktop-first (don't break tablets, but don't optimize)
- AI opponent — v2 candidate, explicitly excluded from v1
- Rankings / matchmaking beyond the simple quick-match queue — v2 candidate

## Context

- **Greenfield.** Empty repo (`Steel-Horizon/`), git initialized, no existing code.
- **Solo developer + Claude.** User is visionary/product owner; Claude builds.
- **Spec-driven.** The user supplied a detailed build spec including a phased build order (deliberately: working multiplayer loop with a plain 2D board BEFORE any 3D work, so the project never ends up as a beautiful scene with broken multiplayer).
- **Spec's build order:** 1) monorepo scaffold + shared game logic with thorough unit tests (placement validation, shot resolution); 2) server rooms/matchmaking/game loop over Socket.IO, tested with headless socket clients playing a scripted game; 3) client with a PLAIN 2D board against the real server proving the full flow (lobby → placement → battle → post-game); 4) replace 2D board with the 3D scene (ocean, ships, camera system); 5) firing cinematics and particles; 6) timers, edge cases (disconnect mid-animation, double-join, spam clicks), reduced-effects mode, final QA playing a complete game in two browser windows.
- **Render free tier realities:** single instance (fits in-memory state — no horizontal scaling), spins down after idle (client needs a friendly wake/connecting state), WebSockets supported.
- **Working preference:** load matching skills before each work type (frontend-design for UI/3D work, webapp-testing for browser QA).

## Constraints

- **Tech stack**: React 18 + Vite + TypeScript; @react-three/fiber + @react-three/drei for 3D; Zustand for client state; hand-written CSS for the HUD; Node.js + Express + Socket.IO backend; Vitest for tests — user specified exactly this
- **Architecture**: Authoritative server from day one — can't be retrofitted; it's what makes online play cheat-resistant
- **Monorepo**: npm workspaces with a `/shared` package (protocol types, board model, game rules) imported by both client and server
- **Assets**: fully self-contained — procedural ship meshes, no external model/font/CDN downloads
- **Performance**: 60fps on a mid-range laptop, with a reduced-effects fallback
- **Hosting**: Render free tier, single web service — one instance, in-memory persistence only, cold starts must be handled gracefully
- **Cinematics**: firing sequences ≤ ~2.5s and skippable — spectacle must never slow the game down

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Authoritative server from phase 1 | Cheat-resistance can't be retrofitted; hostile-client assumption baked into protocol | — Pending |
| Procedural ship models (no GLTF downloads) | Keeps project self-contained, no asset licensing/availability risk | — Pending |
| Multiplayer loop with plain 2D board before any 3D | Avoids "beautiful scene, broken multiplayer" failure mode | — Pending |
| Single Render web service (client + Socket.IO together) | Simplest free-tier setup, no CORS, fits in-memory state | — Pending |
| In-memory persistence behind a repository interface | No DB needed for v1; swappable for Redis later | — Pending |
| v1 done = live on Render, not just localhost | It's for playing with friends AND showcasing — needs a public URL | — Pending |
| Both multiplayer and 3D presentation equally non-negotiable | User's explicit call; phased build order protects both | — Pending |

---
*Last updated: 2026-07-03 after initialization*
