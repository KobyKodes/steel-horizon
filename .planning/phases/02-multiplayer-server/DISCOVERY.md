# Phase 2 Discovery: Multiplayer Server Architecture

**Level:** 2 (standard research)
**Date:** 2026-07-03
**Confidence:** HIGH — Socket.IO v4 patterns are stable and well-documented; all recommendations verified against official docs; no LOW-confidence findings.

## Summary / Recommendation

Build the authoritative server as: **typed Socket.IO v4 on the existing Express HTTP server, single default namespace with one Socket.IO room per game room, app-level session IDs in the handshake `auth` payload (NOT socket.id, NOT built-in connection-state-recovery), and a snapshot-driven protocol where the server re-emits a full redacted `RoomSnapshot` to each player on every accepted state change.** Game state lives in in-memory stores behind small repository interfaces (swappable for Redis later, per PROJECT.md).

## Findings

### 1. Socket.IO room/namespace patterns

- **Single default namespace is sufficient.** Namespaces are for separate application concerns (e.g. admin channels); we have one concern. One Socket.IO room per game room (`socket.join(roomCode)`) gives free broadcast via `io.to(code).emit(...)`.
- **Per-player (private) sends use the individual socket** (`socket.emit`). Since snapshots are redacted per viewer, snapshots always go socket-by-socket, never room-broadcast. Room broadcast is fine for symmetric transient events (e.g. `shotResult` cinematic cues).
- **Typed events:** `new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>` applies the shared protocol maps. `SocketData` holds `{ sessionId }` so handlers never trust client-supplied identity. shared/src/protocol.ts stays pure types (01-02 decision) — server applies the generics.
- Server rooms are cheap; hold the authoritative `Room` object in our own store keyed by code — Socket.IO rooms are only a broadcast mechanism, never the source of truth.

### 2. Reconnect + session-resume strategy

- **`socket.id` is per-connection and regenerates on every reconnect/refresh — never use it as player identity.** (Official docs are explicit about this.)
- **Built-in Connection State Recovery is NOT suitable** as the primary mechanism: it is designed for brief intermittent disconnections (`maxDisconnectionDuration` must be small), is explicitly best-effort ("recovery can fail — applications still need a full resynchronization path"), does not survive page refresh (a refresh creates a brand-new client), and skipping middleware on recovery has auth caveats. Sources: socket.io/docs/v4/connection-state-recovery; networkspy.app reconnect guide; socketio/socket.io#5282 (recovery fails for long-lived connections).
- **Chosen pattern (verified standard):**
  1. Client connects with `io({ auth: { sessionId?, name? } })`.
  2. Server middleware: if `sessionId` is unknown/absent, mint one (`crypto.randomUUID()`), store in a SessionStore, and emit it to the client in a `session` event.
  3. Client persists sessionId in **`sessionStorage`** (per-tab — two tabs on one machine can be two players, which is exactly how we dev-test; localStorage would collide).
  4. On any later connect, if the sessionId maps to a live room, the server re-`join`s the socket, cancels the disconnect-grace timer, and emits a **full redacted snapshot**. Client re-renders entirely from it.
- **Disconnect grace:** on `disconnect` of a player in an active game, mark `connected: false`, notify opponent (snapshot re-emit), start a 60s timer; on expiry the opponent wins by forfeit. Grace duration must be injectable/configurable so integration tests can use ~100ms.

### 3. Redacted-snapshot state design

- **Snapshot-driven protocol:** after every accepted mutation, the server rebuilds and sends each player their own redacted `RoomSnapshot`. Battleship state is tiny (two 10×10 boards, ≤200 shots), so "always send everything the viewer may know" costs nothing and buys: refresh-proof reconnect for free (reconnect = the same snapshot path), a trivially simple Phase 3 client (Zustand store = last snapshot, matching roadmap 03-01 "store driven by server snapshots"), and no delta-sync bugs.
- **Redaction rule (anti-cheat core):** the snapshot for player P contains P's own fleet, all shots by both sides with results, opponent name/ready/connected/sunk-ship list — and **never the opponent's `FleetPlacement` until `phase === "gameover"`**, when it is revealed. Redaction is enforced in ONE function (`buildSnapshot(room, viewerId)`) so it can be pinned by tests: assert the serialized snapshot for a live game contains no opponent ship coordinates.
- Transient events (`shotResult`) ride alongside snapshots as animation cues; they carry only information already present in both players' snapshots.

### 4. In-memory repository interface shape

- Two stores, both trivial `Map` wrappers behind interfaces (PROJECT.md: "in-memory repository behind an interface, swappable for Redis later"):
  - `RoomStore`: `create(room)`, `get(code)`, `delete(code)` — keyed by 6-char room code.
  - `SessionStore`: `get(sessionId)`, `set(sessionId, {name, roomCode})`, `delete(sessionId)`.
- Render free tier = single instance, so in-memory is safe (already a PROJECT decision). Keep methods synchronous-shaped but narrow so an async Redis impl is a mechanical swap later (or make them `Promise`-returning now — implementer's call; interface narrowness is what matters).
- **Room codes:** 6 chars from an unambiguous alphabet (A–Z minus I/O, digits 2–9 → 32 symbols ≈ 1.07e9 codes); regenerate on collision against the store.
- **Matchmaking queue:** a plain FIFO array of waiting sessions; on second entrant, pop both, create a room exactly as if created+joined by code. Guard against the same session queueing twice.

## Stack additions (Phase 2)

| Package | Where | Why |
|---------|-------|-----|
| socket.io@^4 | server dependency | WebSocket server |
| socket.io-client@^4 | server devDependency | headless integration-test clients |
| vitest@^2 | server devDependency | server unit + integration tests (matches shared) |

Vite dev proxy already forwards `/socket.io` with `ws: true` (01-01) — no client-side changes needed this phase.

## Open Questions

None blocking. One deferred choice: sync vs async repository method signatures (see §4) — either satisfies the constraint; decide at implementation.

## Sources

- https://socket.io/docs/v4/connection-state-recovery — recovery is for intermittent disconnects, best-effort, sensible `maxDisconnectionDuration` required
- https://networkspy.app/blog/socketio-reconnect-connection-state-recovery-guide — recovery can fail after long disconnects/deploys; apps need a full resync path
- https://github.com/socketio/socket.io/issues/5282 — recovery failures on long-lived connections
- https://socket.io/docs/v4/server-options/ — typed server generics, middleware/auth handshake
