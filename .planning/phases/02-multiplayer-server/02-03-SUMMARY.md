---
phase: 02-multiplayer-server
plan: 03
subsystem: api
tags: [socket.io, reconnect, session-resume, grace-timer, forfeit, vitest, integration-tests]

# Dependency graph
requires:
  - phase: 02-multiplayer-server (02-01)
    provides: app-level sessions via handshake auth, socketsBySession map, room/session stores, integration-test patterns
  - phase: 02-multiplayer-server (02-02)
    provides: engine forfeit(), injectable rng threaded through createServer, buildSnapshot covering every phase
provides:
  - Refresh-proof session-resume reconnect — a brand-new socket with a known sessionId resumes any phase from one buildSnapshot
  - Disconnect grace (default 60s, injectable graceMs) ending in engine forfeit for live games or seat-freeing for lobbies
  - Last-connect-wins takeover on same-session double connect
  - Abandoned-room cleanup (rooms deleted, sessions unlinked, codes freed)
  - server/test/helpers.ts — the canonical integration harness (startTestServer, startBattle, playToVictory) Phase 3 tests can reuse
  - Headless full-game verification: scripted games to victory, rematch, reconnect, hostile-input hardening (Phase 2 exit criterion)
affects: [03-01 client store (reconnect handling), 03-03 battle/post-game, 06 polish/deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "grace timers keyed room+player in a Map; ALWAYS cleared on reconnect (stale timer would forfeit a live player); unref()'d so they never hold the process open"
    - "reconnect is snapshot-driven only: no phase-special resume code, sendRoomState(room) restores both sides"
    - "playToVictory drives clients purely from snapshots — the template for how the Phase 3 client consumes the protocol"

key-files:
  created:
    - server/src/config.ts
    - server/test/helpers.ts
    - server/test/fullgame.integration.test.ts
    - server/test/reconnect.integration.test.ts
  modified:
    - server/src/socket.ts

key-decisions:
  - "Last-connect-wins on same-session double connect: map re-pointed BEFORE dropping the old socket so its disconnect handler observes the swap and leaves session state alone"
  - "Superseded sockets skip ALL disconnect side effects (including matchmaking removal) — the session lives on through the new socket"
  - "Room deletion requires every seat disconnected AND no grace timer pending; gameover rooms linger for rematch until fully abandoned"
  - "graceMs precedence: factory override > RECONNECT_GRACE_MS env > 60s default"

patterns-established:
  - "Integration tests import the harness from server/test/helpers.ts instead of redefining waitFor/connect per file"

issues-created: []

# Metrics
duration: 25min (active; session interrupted by a limit mid-plan and resumed)
completed: 2026-07-04
---

# Phase 2 Plan 03: Reconnect & Headless Verification Summary

**Session-resume reconnect with per-player grace timers ending in engine forfeit, last-connect-wins refresh handling, and abandoned-room cleanup — proven by headless socket clients playing complete games to victory, rematching, reconnecting mid-battle, and surviving hostile-input barrages**

## Performance

- **Duration:** ~25 min active (wall clock spanned a session-limit interruption)
- **Started:** 2026-07-04T06:33:23Z
- **Completed:** 2026-07-04T10:14:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Refresh-proof reconnect: a brand-new socket authenticating with a known sessionId rejoins its room, cancels the grace timer, and is fully restored from ONE buildSnapshot — verified to deep-equal the pre-disconnect snapshot (modulo connected flags) with zero placement leakage, in any phase
- Disconnect grace: opponent's snapshot flips `opponent.connected` (that IS the notification), a per-room+player timer starts; expiry forfeits live games via the engine's forfeit() (winner "you"/winReason "forfeit" for the survivor) or frees a lobby seat; timers are cleared on reconnect (stale-timer guard pinned by test) and unref()'d
- Last-connect-wins: a second socket with the same sessionId takes over the session; the old socket is server-dropped and its disconnect handler makes no state changes
- Room lifecycle: rooms fully abandoned past grace are deleted and their sessions unlinked so codes free up and the store doesn't leak
- Phase 2 exit criterion met: `playToVictory` drives two headless clients purely from snapshots through an 84-shot game to the 17th hit, with correct viewer-relative winner mapping and post-game `revealedOpponentFleet` on both sides; rematch resets into a live clean game; a 20-emit duplicate-fire burst yields exactly one accepted shot and 19 typed rejections with consistent state after
- Suite: 48 server tests (7 files) green and deterministic across 4 consecutive runs; shared still 49/49; tsc clean in both packages; server boot smoke returns `/health` 200

## Task Commits

Each task was committed atomically:

1. **Task 1: Session-resume reconnect, disconnect grace, and forfeit** - `805a67c` (feat)
2. **Task 2: Headless scripted full-game and reconnect verification suite** - `ab0b078` (test)

## Files Created/Modified

- `server/src/config.ts` - RECONNECT_GRACE_MS (60s) + resolveGraceMs (override > env > default)
- `server/src/socket.ts` - graceMs dep, grace-timer map, onGraceExpired (forfeit/lobby-free), maybeDeleteRoom, last-connect-wins takeover, session-resume on connection, rewritten disconnect handler
- `server/test/helpers.ts` - Shared harness: startTestServer({graceMs,rng}), open/connect, waitFor/waitForDisconnect/waitUntil, fleet fixtures, ALL_CELLS, startBattle, playToVictory
- `server/test/fullgame.integration.test.ts` - Full game to victory + reveal, rematch liveness, hostile-input hardening
- `server/test/reconnect.integration.test.ts` - Mid-battle resume deep-equality, grace forfeit, stale-timer guard, double-connect takeover (200ms grace)

## Decisions Made

- **Map re-pointed before dropping the old socket:** `socketsBySession.set` happens before `previous.disconnect(true)` so the superseded socket's disconnect handler sees it is no longer current and returns without touching session state — this is what makes refresh (new socket connects before old one's disconnect fires) safe
- **Superseded sockets also skip matchmaking removal:** a refresh mid-queue keeps the player queued through the new socket
- **Grace timers unref()'d:** pending 60s timers never hold the test process (or a shutdown) open; the listening server keeps the loop alive in production
- **Room deletion gated on "no pending grace timer":** a disconnected player inside grace still owns their seat; deletion only fires when every seat is disconnected and un-graced

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Execution was interrupted mid-plan by a session limit (after Task 1's commit and helpers.ts creation); resumed by reconciling git state (`git status` + log) — no rework needed
- The planned `npm run dev` manual smoke was replaced by an equivalent scripted smoke (createServer → listen → GET /health → 200) because backgrounding/pkill of a watch process was denied by the environment; the code path exercised is identical to `start()`

## Next Phase Readiness

- Phase 2 is complete: the server runs full games headlessly with redaction, rematch, reconnect, grace forfeit, and hostile-input safety all pinned by tests
- Phase 3's 2D client can be built exactly like `playToVictory` behaves: consume `roomState` snapshots (plus `shotResult` cues), persist the sessionId, and reconnect by re-offering it in handshake auth — nothing else is needed to survive refresh
- server/test/helpers.ts is the reusable harness for any future server-touching integration tests

---
*Phase: 02-multiplayer-server*
*Completed: 2026-07-04*
