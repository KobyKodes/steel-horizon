# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Two people on different machines play a complete, cheat-resistant game of Battleship inside a cinematic 3D naval scene — and both halves (bulletproof multiplayer, hyper-realistic presentation) are equally non-negotiable.
**Current focus:** Phase 2 — Multiplayer Server

## Current Position

Phase: 2 of 7 (Multiplayer Server)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-07-04 — Completed 02-01-PLAN.md (rooms & matchmaking: typed Socket.IO server, sessions, quick-match, lobby; 16 server tests green)

Progress: ██▓░░░░░░░ ~24%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 10 min
- Total execution time: ~0.8 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 22 min | 6 min |
| 02-multiplayer-server | 1 | 28 min | 28 min |

**Recent Trend:**
- Last 5 plans: 01-01 (10 min), 01-02 (6 min), 01-03 (3 min), 01-04 (3 min), 02-01 (28 min)
- Trend: server plans are larger than shared-core plans (infra + integration tests)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Pure ESM workspace (01-01):** `"type": "module"` in all packages; server/shared use NodeNext resolution, client uses Bundler.
- **Source-level shared package (01-01):** @steel-horizon/shared exports raw `src/index.ts` — no build step in dev; later phases must not add a dist/build requirement.
- **Single-origin dev (01-01):** Vite proxies `/health` and `/socket.io` (ws enabled) to :3001 — confirmed sufficient in 02-01, no client proxy changes needed.
- **Intra-shared imports use .js specifiers (01-02);** server relative imports do the same (NodeNext). Cross-package imports stay bare (`@steel-horizon/shared`).
- **Coordinates 0-based internally (01-02);** classic notation only at the label boundary.
- **Touching ships are legal (01-03);** random fleets via rejection sampling (01-03).
- **Validation results are discriminated unions (01-03):** first-failure reason; server and client consume the same reason.
- **Shot rules are pure and stateless (01-04):** resolveShot/isFleetDestroyed take (fleet, shots, target); previousShots excludes the shot being resolved.
- **Protocol v1 replaces v0 outright (02-01):** GamePhase/LobbyPlayer and v0 S2C events deleted; snapshot-driven contract (`session`/`roomState` + redacted RoomSnapshot). RoomSnapshot's shape makes pre-gameover opponent-fleet leakage impossible (fleet only in `revealedOpponentFleet`).
- **App-level sessions via handshake auth (02-01):** server-minted UUID sessionIds, never socket.id; socket.data.sessionId is the only trusted identity; stores (SessionStore/RoomStore) are Map wrappers behind narrow interfaces, Redis-swappable.
- **Per-viewer snapshot sends only (02-01):** snapshots are viewer-specific; never room-broadcast. buildLobbySnapshot is the single redaction point — 02-02 extends it into the full game snapshot.
- **createServer/start factory with main-module guard (02-01):** tests import the server without binding a port; `npm run dev` (tsx watch) behavior unchanged. Integration tests bind port 0 and await events with timeouts, never sleeps.
- **Queued player creating/joining dequeues silently (02-01):** createRoom/joinRoom remove the session from the quick-match queue instead of erroring.

### Deferred Issues

None yet.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-07-04
Stopped at: Completed 02-01-PLAN.md (SUMMARY created) — ready for 02-02 (game loop)
Resume file: None
