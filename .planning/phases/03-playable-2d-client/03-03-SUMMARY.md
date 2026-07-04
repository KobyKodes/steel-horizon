---
phase: 03-playable-2d-client
plan: 03
subsystem: ui
tags: [react, socket.io-client, battleship-protocol]

# Dependency graph
requires:
  - phase: 03-playable-2d-client
    provides: snapshot-driven Zustand store, phase router, shotFeed array (03-01); placement flow producing a server-accepted fleet (03-02)
provides:
  - Battle screen — TargetingBoard (opponent waters, click-to-fire), FleetBoard (own/reveal waters), ShotLog, turn indicator, fleet-status lists
  - Post-game screen — winner banner, dual board reveal, client-computed stats (accuracy, streak), both-must-accept rematch loop
  - Protocol-level `sunkShipCells` on ShotRecord/shotResult — server reveals the exact cells of a ship the instant it sinks, replacing a same-length-run heuristic that broke on touching ships
affects: [04 3d-scene, 05 cinematics (shotFeed/shotResult already the animation-cue seam), 06 resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Board components take fleet/shots as props, never read the store directly, so FleetBoard is reused unchanged for the post-game opponent reveal"
    - "Sunk-ship visuals come from server-supplied ground truth (sunkShipCells), never client-side inference — a sunk ship's shape is safe to reveal in full the moment it dies, without touching any other ship's cells"

key-files:
  created:
    - client/src/components/TargetingBoard.tsx
    - client/src/components/FleetBoard.tsx
    - client/src/components/ShotLog.tsx
  modified:
    - client/src/screens/BattleScreen.tsx
    - client/src/screens/PostGameScreen.tsx
    - client/src/screens/battle.css
    - client/src/store.ts
    - shared/src/shots.ts
    - shared/src/protocol.ts
    - server/src/game/engine.ts
    - server/src/socket.ts

key-decisions:
  - "sunkShipCells added to the wire protocol (ShotRecord + shotResult) rather than keeping client-side heuristics — the ambiguity was structural (touching ships are legal), not a rendering bug, so it needed a protocol fix"
  - "Stats on the post-game screen are display-only, computed client-side from yourShots — never authoritative, never sent to the server"

patterns-established:
  - "Cosmetic-looking bugs that stem from the client re-deriving server-known facts should be checked for a protocol-level fix before adding more client heuristics"

# Metrics
duration: ~35min (2 auto tasks + checkpoint fix-iterate)
completed: 2026-07-04
---

# Phase 3, Plan 3: Battle & Post-Game Summary

**Playable battle and post-game screens (targeting/fleet boards, shot log, rematch) plus a protocol fix making sunk-ship highlighting exact instead of heuristic**

## Performance

- **Tasks:** 2 auto tasks + 1 human-verify checkpoint (2 rounds of fixes during checkpoint)
- **Files modified:** 12

## Accomplishments
- Full battle loop playable against the real server: click-to-fire targeting board, own fleet-damage board, live shot log, turn gating, fleet-status lists
- Post-game reveal (both true boards), client-computed stats, and a working both-must-accept rematch loop back into a clean placement phase
- Found and fixed two real bugs during human checkpoint verification (see Deviations)

## Task Commits

1. **Task 1: Battle screen — boards, firing, turn indicator, shot log** - `bf7cdc7` (feat)
2. **Task 2: Post-game screen — reveal, stats, rematch** - `9966cbc` (feat)

**Checkpoint fixes (found during human two-browser verification):**
- `ea0d8f5` (fix) — placement board CSS class collided with battle.css's `.board`, breaking the placement grid's layout (row/column header alignment)
- `deb8b20` (fix) — sunk-ship cell highlighting used a same-axis-run-length heuristic that broke whenever two sunk ships touched; replaced with a server-supplied `sunkShipCells` field

**Plan metadata:** (this commit)

## Files Created/Modified
- `client/src/components/TargetingBoard.tsx` - opponent waters, click-to-fire, sunk-cell highlighting from `sunkShipCells`
- `client/src/components/FleetBoard.tsx` - own/reveal waters, reused for post-game opponent reveal
- `client/src/components/ShotLog.tsx` - scrolling shot feed, rebuilds from snapshot after refresh
- `client/src/screens/BattleScreen.tsx` - composes boards + turn indicator + fleet-status lists
- `client/src/screens/PostGameScreen.tsx` - winner banner, board reveal, stats, rematch
- `client/src/screens/battle.css` - battle/post-game layout and cell styling
- `client/src/store.ts` - additive `fire`/`requestRematch` emit actions
- `shared/src/shots.ts` - `resolveShot`'s sunk result now includes `cells: Coordinate[]`
- `shared/src/protocol.ts` - `ShotRecord.sunkShipCells` and matching `shotResult` field
- `server/src/game/engine.ts` - populates `sunkShipCells` from the resolved placement
- `server/src/socket.ts` - forwards `sunkShipCells` on the `shotResult` cinematic cue

## Decisions Made
- `sunkShipCells` is only populated on the shot that sinks a ship (not on every hit) — the minimum wire surface needed, and consistent with "reveal only what's now permanently public"
- Kept the fallback-free approach: once the protocol carries ground truth, the old heuristic (`deriveSunkCells`) was deleted outright rather than kept as a fallback, since the server always populates the field now

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Placement grid rendered as a stacked flex column instead of a CSS grid**
- **Found during:** Human checkpoint verification (screenshot showed row-header numbers 1-10 clustered above the grid instead of down its left edge)
- **Issue:** `placement.css` and `battle.css` both defined a `.board` class with incompatible layouts (grid vs. flex column). Both stylesheets load globally; the later one in the bundle cascade won, so the placement screen was actually being laid out by battle.css's flex rules.
- **Fix:** Renamed the placement grid's outer class to `.placement-grid` (unique) in both `PlacementBoard.tsx` and `placement.css`. Also tightened the grid's `auto`-sized tracks to explicit `min(70vmin, 26rem)` to match `.cells`'s own sizing (defensive; not the root cause but the two combined fully resolved the visual).
- **Files modified:** `client/src/components/PlacementBoard.tsx`, `client/src/screens/placement.css`
- **Verification:** User re-tested both browsers and confirmed correct alignment
- **Committed in:** `653158f` (grid-template sizing, folded into a concurrent 03-02 agent's docs commit), `ea0d8f5` (class rename)

**2. [Rule 1 - Bug] Touching sunk ships only partially highlighted**
- **Found during:** Human checkpoint verification (screenshot showed an L-shaped pair of sunk ships where most cells lacked the "sunk" outline)
- **Issue:** `TargetingBoard`'s `deriveSunkCells` heuristic walked contiguous hit-runs through the sinking shot and matched them against the sunk ship's known length. Touching ships (explicitly legal per `01-03`'s placement rules) make a run extend into the neighboring ship's hits, so the run length no longer matches either ship — the code's own documented fallback then marked only the single sinking cell, not the whole ship.
- **Fix:** Added `sunkShipCells: Coordinate[]` to `ShotRecord`/`shotResult` (shared protocol), populated server-side in `engine.ts`'s `fire()` from the exact placement that was resolved (`resolveShot` already knows precisely which ship and which cells — no guessing needed). Client now renders sunk highlighting directly from this field; the old heuristic function was deleted.
- **Files modified:** `shared/src/shots.ts`, `shared/src/protocol.ts`, `server/src/game/engine.ts`, `server/src/socket.ts`, `client/src/components/TargetingBoard.tsx`, plus test updates in `shared/src/shots.test.ts`, `server/src/game/engine.test.ts`, `server/test/gameloop.integration.test.ts`
- **Verification:** Added a regression test in `shots.test.ts` for a touching-ship layout; all 50 shared + 48 server tests green; user re-tested and confirmed correct highlighting on touching sunk ships
- **Committed in:** `deb8b20`

### Deferred Enhancements

None.

---
**Total deviations:** 2 auto-fixed (both Rule 1 - bugs found during checkpoint), 0 deferred
**Impact on plan:** Both fixes were necessary for the phase's exit criterion (a correct, complete playable game) and stayed scoped to the exact defect found — no unrelated cleanup or scope creep. The sunk-cells fix reached into shared/server despite this plan nominally being client-only, because the bug was structurally a protocol gap, not a client bug; this was the smallest correct fix.

## Issues Encountered
None beyond the two bugs above, both resolved within the checkpoint loop.

## Next Phase Readiness
- Phase 3 exit criterion met: a complete game (lobby → placement → battle → post-game → rematch) is playable between two real browsers against the authoritative server, human-verified including mid-battle refresh and a full rematch loop
- No opponent fleet data leaks before gameover (wire contract unchanged; `sunkShipCells` only ever describes an already-sunk ship, never a live one)
- Phase 4 (3D Ocean Scene) can proceed — the snapshot-driven store, phase router, and now-corrected shot/sunk data model are the stable surface it builds on top of

---
*Phase: 03-playable-2d-client*
*Completed: 2026-07-04*
