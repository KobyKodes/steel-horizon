# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Two people on different machines play a complete, cheat-resistant game of Battleship inside a cinematic 3D naval scene — and both halves (bulletproof multiplayer, hyper-realistic presentation) are equally non-negotiable.
**Current focus:** Phase 2 — Multiplayer Server

## Current Position

Phase: 2 of 7 (Multiplayer Server)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-07-04 — Completed 02-03-PLAN.md (refresh-proof reconnect, grace forfeit, room cleanup; headless full-game + reconnect suites; 48 server tests green)

Progress: ███░░░░░░░ ~33%

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 13 min
- Total execution time: ~1.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 22 min | 6 min |
| 02-multiplayer-server | 3 | 67 min | 22 min |

**Recent Trend:**
- Last 5 plans: 01-03 (3 min), 01-04 (3 min), 02-01 (28 min), 02-02 (14 min), 02-03 (25 min)
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
- **Engine is a pure state machine with injected rng (02-02):** server/src/game/engine.ts has no socket.io/timers/I/O; transitions return `{ok:true,...}|{ok:false,code}` with state untouched on rejection; forfeit() already implemented for 02-03's grace timer.
- **buildSnapshot is the only board-state serialization path (02-02):** server/src/snapshot.ts; room.phase mirrors game.phase via syncRoomPhase after each accepted mutation.
- **shotResult.shooter is the display name, never the sessionId (02-02):** session ids are resume credentials and must not reach the opponent.
- **Rematch acceptance resets ready flags (02-02):** post-rematch snapshots read as a clean placement phase.
- **Last-connect-wins on same-session double connect (02-03):** socketsBySession is re-pointed BEFORE the old socket is dropped, so superseded sockets skip ALL disconnect side effects (including matchmaking removal) — this is what makes refresh safe.
- **Grace timers keyed room+player, cleared on reconnect, unref()'d (02-03):** graceMs precedence is factory override > RECONNECT_GRACE_MS env > 60s default; expiry forfeits live games via the engine or frees a lobby seat.
- **Room deletion gated on fully-abandoned (02-03):** every seat disconnected AND no grace timer pending; gameover rooms linger for rematch until abandoned; deleted rooms unlink their sessions so codes free up.
- **Reconnect is snapshot-driven only (02-03):** a new socket offering a known sessionId is restored from one buildSnapshot in any phase; server/test/helpers.ts playToVictory proves snapshots alone can drive a client (the Phase 3 template).

### Deferred Issues

None yet.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-07-04
Stopped at: Completed 02-03-PLAN.md (SUMMARY created) — Phase 2 complete, ready to plan Phase 3 (Playable 2D Client)
Resume file: None
