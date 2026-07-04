---
phase: 03-playable-2d-client
plan: 01
subsystem: ui
tags: [react, zustand, socket.io-client, vite, sessionstorage]

# Dependency graph
requires:
  - phase: 02-multiplayer-server
    provides: snapshot-driven protocol v1 (session/roomState/shotResult/errorEvent), session-resume handshake auth, refresh-proof reconnect
provides:
  - Typed socket.io-client singleton with callback-form handshake auth (sessionStorage sessionId/name)
  - Snapshot-driven Zustand store (single source of truth; listeners registered once at module init)
  - Phase router in App.tsx (snapshot.phase IS the routing) with persistent status bar
  - Landing screen (name entry, create/join/quick-match, ?code= prefill, error banners)
  - Lobby screen (ready indicators, ready toggle, shareable link with copy)
  - Trivial placement/battle/postgame stub screens as seams for 03-02/03-03
affects: [03-02 placement UI, 03-03 battle and post-game, 04 3d-scene]

# Tech tracking
tech-stack:
  added: [socket.io-client@^4.8, zustand@^5.0]
  patterns:
    - "Store listeners registered once at module init, never in React effects (StrictMode-safe)"
    - "Screens render purely from the RoomSnapshot; no client-derived game state"
    - "Auto-reconnect on page load when sessionStorage holds an identity"

key-files:
  created:
    - client/src/socket.ts
    - client/src/store.ts
    - client/src/styles.css
    - client/src/screens/LandingScreen.tsx
    - client/src/screens/LobbyScreen.tsx
    - client/src/screens/PlacementScreen.tsx
    - client/src/screens/BattleScreen.tsx
    - client/src/screens/PostGameScreen.tsx
  modified:
    - client/src/App.tsx
    - client/src/main.tsx
    - client/package.json

key-decisions:
  - "Auth is callback-form so socket.io re-reads sessionStorage on every reconnect attempt (mid-session sessionId mint picked up automatically)"
  - "Store module auto-connects on load if sessionStorage has a name — refresh restores screen with zero user action"
  - "Store actions connect-then-emit; socket.io buffers the emit until the connection completes"
  - "shotFeed lives in the store now (registered once) even though 03-03 renders it; wiped on entry to placement"

patterns-established:
  - "Phase routing: snapshot === null -> Landing; otherwise switch on snapshot.phase — no router library, no client transitions"
  - "Stub screens are exclusively owned by 03-02/03-03 and get replaced wholesale"

issues-created: []

# Metrics
duration: 28min
completed: 2026-07-04
---

# Phase 3 Plan 01: App Shell & Connection Summary

**React client wired to the real server: typed socket singleton with session-resume auth, snapshot-driven Zustand store, landing/lobby screens, and phase-based routing — verified by a 17-check headless two-browser Playwright flow**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-04T10:38:23Z
- **Completed:** 2026-07-04T11:06:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Two browsers can enter names, create/join a room (by code, shareable `?code=` link, or quick match), see each other in the lobby, ready up, and land on the placement stub — all driven by server snapshots
- Refresh-proof at every step: sessionStorage sessionId + auto-connect on load restores the exact screen from the server's reconnect snapshot with no user action
- Two tabs of one browser act as two independent players (per-tab sessionStorage isolation)
- Headless verification: 17/17 Playwright checks across three isolated browser contexts (create, prefilled join, ready sync, mid-lobby refresh, phase transition to placement, ROOM_NOT_FOUND banner, quick-match pairing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Socket connection layer and snapshot-driven Zustand store** - `207420b` (feat)
2. **Task 2: Landing screen — name entry, create / join / quick match** - `5b5399d` (feat)
3. **Task 3: Phase router, lobby screen, and stub screens** - `203954c` (feat)

## Files Created/Modified

- `client/src/socket.ts` - Typed socket singleton, callback-form handshake auth, connect(name) helper
- `client/src/store.ts` - Zustand store: snapshot/connection/lastError/shotFeed + emit actions; listeners at module init; refresh auto-connect
- `client/src/App.tsx` - Phase router + persistent status bar (room code, name, disconnect warnings)
- `client/src/screens/LandingScreen.tsx` - Name entry, three entry paths, ?code= prefill, dismissible error banner
- `client/src/screens/LobbyScreen.tsx` - Ready indicators/toggle, waiting state, shareable link with copy
- `client/src/screens/{Placement,Battle,PostGame}Screen.tsx` - Trivial stubs owned by 03-02/03-03
- `client/src/styles.css` - Dark utilitarian baseline (global + landing/lobby/status-bar)
- `client/src/main.tsx` - Imports styles.css
- `client/package.json` - socket.io-client, zustand, typecheck/build scripts

## Decisions Made

- Callback-form auth over static auth object: socket.io re-evaluates it per reconnect attempt, so the sessionId minted mid-session is offered on the next reconnect without rebuilding the socket
- Store module auto-connects at init when sessionStorage holds a name — this is what makes a mid-lobby refresh land back in the lobby with zero clicks
- Room-code alphabet duplicated as a client constant (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) for input filtering; server remains the validator of record

## Deviations from Plan

None - plan executed exactly as written. (The refresh auto-connect in store.ts is the mechanism required by the plan's "refresh-proof at every step" done-criteria.)

## Issues Encountered

None. Verification scripts needed ESM (`.mts`) + absolute-URL imports to run from the scratchpad outside the workspace — no impact on shipped code.

## Next Phase Readiness

- Store and phase-router seams ready: 03-02 (PlacementScreen) and 03-03 (BattleScreen/PostGameScreen + shotFeed already in store) can execute in parallel
- `npm run typecheck` / `npm run build` green in client; 48 server tests untouched and green

---
*Phase: 03-playable-2d-client*
*Completed: 2026-07-04*
