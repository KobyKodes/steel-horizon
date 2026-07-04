---
phase: 02-multiplayer-server
plan: 01
subsystem: api
tags: [socket.io, websocket, typescript, vitest, express, sessions, matchmaking]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: monorepo scaffold, Express server shell, protocol v0 types, Vite proxy for /socket.io
provides:
  - Protocol v1 in shared (RoomPhase, ShotRecord, redacted RoomSnapshot, HandshakeAuth, session/roomState events)
  - Typed Socket.IO server attached to the Express HTTP server via createServer/start factory
  - App-level sessions (server-minted UUIDs via handshake auth) behind SessionStore interface
  - RoomStore + generateRoomCode (6-char unambiguous alphabet) behind interface
  - MatchmakingQueue (FIFO quick-match pairing, pure module)
  - Lobby handlers: createRoom/joinRoom/quickMatch/setReady with per-viewer snapshot sends
affects: [02-02 game loop, 02-03 reconnect, 03-01 client connection/store]

# Tech tracking
tech-stack:
  added: [socket.io@^4 (server dep), socket.io-client@^4 (server devDep), vitest@^2 (server devDep)]
  patterns:
    - snapshot-driven protocol (per-viewer redacted RoomSnapshot after every accepted mutation)
    - handshake-auth session middleware (socket.data.sessionId is the only trusted identity)
    - Map-backed stores behind narrow interfaces (Redis-swappable)
    - hostile-input validation with typed errorEvent and no state change on rejection

key-files:
  created:
    - server/src/socket.ts
    - server/src/session.ts
    - server/src/rooms.ts
    - server/src/matchmaking.ts
    - server/vitest.config.ts
    - server/src/rooms.test.ts
    - server/src/matchmaking.test.ts
    - server/test/lobby.integration.test.ts
  modified:
    - shared/src/protocol.ts
    - server/src/index.ts
    - server/package.json
    - server/tsconfig.json

key-decisions:
  - "Protocol v0's GamePhase/LobbyPlayer/roomCreated/lobbyState/gamePhase/yourTurn/gameOver removed outright — shared had no other consumers, so v1 replaces rather than deprecates"
  - "createRoom/joinRoom silently remove the session from the quick-match queue rather than rejecting, so a queued player can still create/join directly"
  - "setReady coerces ready via `=== true` instead of a new error code — hostile non-boolean payloads read as false"
  - "index.ts main-module guard (import.meta.url vs argv[1]) lets tests import createServer without binding a port while `npm run dev` behavior stays identical"

patterns-established:
  - "Per-viewer sends only: snapshots are viewer-specific; never room-broadcast a snapshot"
  - "buildLobbySnapshot is the single redaction point; 02-02 extends it into the full buildSnapshot"
  - "Integration tests await specific events with timeouts, never fixed sleeps"

issues-created: []

# Metrics
duration: 28min
completed: 2026-07-04
---

# Phase 2 Plan 01: Rooms & Matchmaking Summary

**Typed Socket.IO v4 server with UUID handshake sessions, 6-char room codes, FIFO quick-match, and lobby ready-up — proven end-to-end by headless socket.io-client integration tests**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-04T03:52:11Z
- **Completed:** 2026-07-04T04:20:44Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Protocol v1 in shared: snapshot-driven contract (`session`/`roomState`) with the redacted `RoomSnapshot` whose type shape makes pre-gameover opponent-fleet leakage impossible; `requestRematch` contract landed early so 02-02 changes nothing on the wire
- Socket.IO attached to the existing Express server behind a `createServer()`/`start()` factory; `/health` and single-origin dev proxy unchanged
- Player identity is a server-minted UUID in handshake auth (never socket.id), stored in an interface-backed SessionStore
- Rooms (6-char unambiguous codes), FIFO matchmaking, and lobby ready-up flipping phase to "placement", all validated against hostile input with typed errors
- 16 server tests (13 unit + 3 integration) green; the integration suite drives the real server over real sockets: create, join with viewer-relative snapshots, ROOM_FULL/ALREADY_JOINED/INVALID_NAME rejections, ready-up phase flip, quick-match pairing

## Task Commits

Each task was committed atomically:

1. **Task 1: Protocol v1 and Socket.IO server infrastructure with sessions** - `5af5ac6` (feat)
2. **Task 2: Room registry, matchmaking queue, and lobby handlers** - `300f7de` (feat)
3. **Task 3: Unit tests and lobby integration test** - `0dd310d` (test)

## Files Created/Modified

- `shared/src/protocol.ts` - v1 wire contract: RoomPhase, ShotRecord, RoomSnapshot, HandshakeAuth, snapshot-driven event maps
- `server/src/socket.ts` - createSocketServer: session middleware, lobby handlers, buildLobbySnapshot, per-viewer sends
- `server/src/session.ts` - SessionData/SessionStore + InMemorySessionStore
- `server/src/rooms.ts` - Room/RoomPlayer types, RoomStore + InMemoryRoomStore, generateRoomCode
- `server/src/matchmaking.ts` - MatchmakingQueue (pure FIFO pairing)
- `server/src/index.ts` - refactored to createServer/start factory with main-module guard
- `server/vitest.config.ts` - node environment, includes src/ and test/ suites
- `server/package.json` - socket.io dep; socket.io-client + vitest devDeps; test script
- `server/tsconfig.json` - include extended to test/ and vitest.config.ts
- `server/src/rooms.test.ts`, `server/src/matchmaking.test.ts` - 13 unit tests
- `server/test/lobby.integration.test.ts` - 3 integration tests against the real server on an ephemeral port

## Decisions Made

- **Replace, don't deprecate, protocol v0:** GamePhase, LobbyPlayer, and the v0 S2C events (roomCreated/lobbyState/gamePhase/yourTurn/gameOver) were deleted — shared had no other consumers, so v1 is clean
- **Queued player creating/joining a room dequeues silently:** createRoom/joinRoom call `matchmaking.remove()` before proceeding instead of erroring, avoiding a stuck "queued but roomed" state
- **setReady validates via `=== true` coercion:** non-boolean hostile payloads read as `false` rather than minting a new error code
- **Main-module guard in index.ts:** `import.meta.url === pathToFileURL(process.argv[1]).href` lets tests import the factory without side effects; verified `tsx watch` still boots and listens

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] server/tsconfig.json did not typecheck the test/ directory**

- **Found during:** Task 3 (integration test)
- **Issue:** `include: ["src"]` meant `npx tsc --noEmit -p server` silently skipped server/test/, so the integration test had no type safety
- **Fix:** Extended include to `["src", "test", "vitest.config.ts"]`
- **Files modified:** server/tsconfig.json
- **Verification:** `npx tsc --noEmit -p server` now covers all 3 test files and passes
- **Committed in:** 0dd310d (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical), 0 deferred
**Impact on plan:** Type coverage fix only. No scope creep.

## Issues Encountered

None

## Next Phase Readiness

- Session/room infrastructure ready for 02-02: the `game: unknown | null` slot on Room awaits the engine; `placeFleet`/`fire`/`requestRematch` are already in the wire contract
- `buildLobbySnapshot` is the single redaction point 02-02 must extend into the full game snapshot (shots, turns, winner, gameover reveal)
- Reconnect (02-03) hooks exist: sessions survive socket death, handshake auth resumes a known sessionId; disconnect currently only dequeues from matchmaking — grace timers and room re-join are 02-03 scope

---
*Phase: 02-multiplayer-server*
*Completed: 2026-07-04*
