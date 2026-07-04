---
phase: 02-multiplayer-server
plan: 02
subsystem: api
tags: [socket.io, game-engine, state-machine, vitest, anti-cheat, typescript]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: pure rule functions (validateFleetPlacement, resolveShot, isFleetDestroyed), 0-based coordinates, discriminated-union validation pattern
  - phase: 02-multiplayer-server (02-01)
    provides: typed Socket.IO server, sessions, rooms, lobby handlers, RoomSnapshot wire contract, integration-test harness
provides:
  - Pure engine state machine (server/src/game/engine.ts) enforcing every game rule with typed rejections and zero state change on failure
  - Injectable rng for deterministic coin flips (threaded SocketServerDeps → createServer for tests and 02-03 scripted games)
  - forfeit() transition ready for 02-03's disconnect grace timer
  - buildSnapshot (server/src/snapshot.ts) — the single redaction point covering all phases lobby → gameover
  - placeFleet/fire/requestRematch socket handlers with hostile-payload structural guards
  - Battle-flow integration test with a hard wire-level redaction assertion
affects: [02-03 reconnect/forfeit/full-game verification, 03-01 client store, 04 placement UI, 05 battle UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - engine transitions return `{ ok: true, ... } | { ok: false, code }`; state untouched on rejection (extends 01-03/01-04 pattern to stateful transitions)
    - room.phase mirrors game.phase via syncRoomPhase after every accepted engine mutation
    - structural shape guards sanitize hostile payloads before engine delegation; engine owns the real rules

key-files:
  created:
    - server/src/game/engine.ts
    - server/src/game/engine.test.ts
    - server/src/snapshot.ts
    - server/test/gameloop.integration.test.ts
  modified:
    - server/src/socket.ts
    - server/src/rooms.ts
    - server/src/index.ts

key-decisions:
  - "shotResult.shooter carries the display name, never the sessionId — session ids are resume credentials and must not cross to the opponent"
  - "Game is created at the both-ready lobby flip; the coin flip happens later when the second fleet lands"
  - "Rematch acceptance resets ready flags so post-rematch snapshots read as a clean placement phase"
  - "Engine rejects non-participants with NOT_IN_ROOM before any phase check (defense in depth beyond the socket layer)"

patterns-established:
  - "buildSnapshot is the ONLY serialization path for board state; no other code may put a fleet or shot list on the wire"
  - "Engine is pure (no socket.io/timers/I/O) with injected rng; server composes room state around it"

issues-created: []

# Metrics
duration: 14min
completed: 2026-07-04
---

# Phase 2 Plan 02: Authoritative Game Loop Summary

**Pure unit-tested engine (placement → coin-flip battle → win/forfeit → rematch) wired into the socket layer behind a single per-viewer redaction point, with an integration test asserting opponent placements never hit the wire before gameover**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-04T05:58:20Z
- **Completed:** 2026-07-04T06:12:30Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Pure engine state machine composing the shared rule functions: simultaneous placement with idempotent re-place, rng coin-flip on the second fleet, strict turn alternation (no extra turn on hit), win on the 17th hit, both-must-accept rematch producing a fresh game, and forfeit ready for 02-03 — 24 unit tests pin every transition and rejection path, including deep-equal state-untouched-on-rejection
- buildSnapshot in server/src/snapshot.ts replaces 02-01's buildLobbySnapshot as the single anti-cheat choke point: viewer's own fleet, viewer-relative turn/winner, sunkShips derived only from the viewer's proven hits, opponent fleet only in `revealedOpponentFleet` at gameover
- placeFleet/fire/requestRematch handlers delegate to the engine after structural guards on hostile payloads; every rejection is a typed errorEvent to the offender only, with no snapshot and no state change
- Battle-flow integration test over real sockets: placement rejection + re-place, deterministic first turn, miss/hit/sunk with shotResult broadcasts, NOT_YOUR_TURN and CELL_ALREADY_SHOT, and a sweep of every shooter-received snapshot asserting no un-hit opponent ship coordinate ever appeared on the wire
- Full suite green: 41 server tests (24 engine unit + 13 store/queue unit + 4 integration) and shared still 49/49; tsc clean in both packages

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure game engine state machine (test-first)** - `afdd591` (feat)
2. **Task 2: Snapshot redaction and game-loop socket handlers** - `b5cc5e6` (feat)
3. **Task 3: Battle-flow integration test with redaction assertion** - `22668d4` (test)

## Files Created/Modified

- `server/src/game/engine.ts` - Pure state machine: createGame/placeFleet/fire/requestRematch/forfeit with injected rng
- `server/src/game/engine.test.ts` - 24 unit tests covering all transitions, rejections, and a full scripted game to the 17th hit
- `server/src/snapshot.ts` - buildSnapshot, the single per-viewer redaction point for all phases
- `server/src/socket.ts` - Game handlers, structural payload guards, engine wiring, shotResult broadcast, rng dep
- `server/src/rooms.ts` - Room.game typed as the engine's Game (was `unknown`)
- `server/src/index.ts` - createServer(deps) passes SocketServerDeps through so tests inject the rng
- `server/test/gameloop.integration.test.ts` - Battle flow + wire-level redaction sweep over real sockets

## Decisions Made

- **shotResult.shooter is the display name, never the sessionId:** the protocol types shooter as `string`; broadcasting the shooter's sessionId to the room would hand the opponent a session-resume credential. Names are information both sides already have
- **Game created at the both-ready flip, coin flip deferred to second fleet:** matches the engine's placement-phase contract; room.phase then mirrors game.phase via syncRoomPhase after every accepted mutation
- **Rematch acceptance resets both players' ready flags:** post-rematch snapshots read as a clean placement phase for the Phase 3 client
- **Engine checks participant membership (NOT_IN_ROOM) before phase checks:** defense in depth — the socket layer already resolves rooms by session, but the engine stays safe standalone

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] createServer could not inject the rng required by the integration test**

- **Found during:** Task 2 (wiring) / needed by Task 3
- **Issue:** `createServer()` took no arguments, so the plan's "room's rng overridden" integration test had no way to force a deterministic coin flip
- **Fix:** `createServer(deps: SocketServerDeps = {})` passes deps (including `rng`) through to createSocketServer; `server/src/index.ts` was not in the plan's files_modified list
- **Files modified:** server/src/index.ts
- **Verification:** gameloop integration test forces `rng: () => 0` and asserts the creator fires first; `npm run dev` path unchanged
- **Committed in:** b5cc5e6 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Structural guards on hostile placeFleet/fire payloads**

- **Found during:** Task 2 (socket handlers)
- **Issue:** shared `validateFleetPlacement`/`resolveShot` assume structurally sound input; a hostile payload like `{ fleet: [null] }` or `{ target: "x" }` would throw inside the handler and crash-loop the socket
- **Fix:** `isFleetShaped`/`isCoordinateShaped` guards reject malformed payloads with INVALID_PLACEMENT/OUT_OF_BOUNDS before engine delegation
- **Files modified:** server/src/socket.ts
- **Verification:** tsc clean; engine keeps ownership of the real rules (guards check shape only)
- **Committed in:** b5cc5e6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical), 0 deferred
**Impact on plan:** Both necessary for testability and hostile-input safety. No scope creep.

## Issues Encountered

- Execution resumed over an interrupted prior attempt: `server/src/game/engine.ts` + `engine.test.ts` existed untracked and complete on session start. Verified against the plan spec (pure module, injected rng, all rejection paths), ran the suite (green) and typecheck (clean), then committed as Task 1 rather than rewriting

## Next Phase Readiness

- 02-03 (reconnect & resilience) has everything it needs: `forfeit()` is implemented and unit-tested for the grace-timer path; the injectable rng supports scripted full-game verification; snapshots already cover reconnect resync by construction (buildSnapshot covers every phase)
- Deliberately NOT covered here (02-03 scope): full game to win over sockets, disconnect grace timers, session re-join re-emitting snapshots
- Phase 3 client can be driven entirely by `roomState` snapshots + `shotResult` cues; no other board-state events exist

---
*Phase: 02-multiplayer-server*
*Completed: 2026-07-04*
