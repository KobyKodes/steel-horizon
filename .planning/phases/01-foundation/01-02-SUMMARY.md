---
phase: 01-foundation
plan: 02
subsystem: game-core
tags: [vitest, typescript, socket.io-types, battleship-rules, shared-package]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: npm-workspaces monorepo with source-level @steel-horizon/shared consumed by client and server
provides:
  - Board/coordinate primitives (GRID_SIZE, Coordinate, Orientation, inBounds, coordToLabel/labelToCoord, coordsEqual) — tested
  - Fleet definitions (ShipClassId, SHIP_LENGTHS, FLEET, ShipPlacement/FleetPlacement, cellsForPlacement, TOTAL_SHIP_CELLS=17) — tested
  - Typed Socket.IO protocol v0 (ClientToServerEvents/ServerToClientEvents, ErrorCode/GamePhase/ShotOutcome) with zero runtime deps
  - Vitest operational in shared (npm test -w shared)
  - Empty placement.ts / shots.ts placeholders reserving file ownership for plans 01-03 / 01-04
affects: [01-foundation plan 03, 01-foundation plan 04, 02-multiplayer, all later phases]

# Tech tracking
tech-stack:
  added: [vitest@2]
  patterns: [intra-shared relative imports use .js specifiers (NodeNext), pure-type protocol module without socket.io import, pure barrel index.ts]

key-files:
  created:
    - shared/src/board.ts
    - shared/src/board.test.ts
    - shared/src/fleet.ts
    - shared/src/fleet.test.ts
    - shared/src/protocol.ts
    - shared/src/placement.ts
    - shared/src/shots.ts
  modified:
    - shared/package.json
    - shared/src/index.ts

key-decisions:
  - "Relative imports inside shared use .js specifiers (NodeNext requirement); cross-package imports stay bare (@steel-horizon/shared). tsc, tsx, Vite, and Vitest all resolve .js -> .ts from TS importers"
  - "Coordinates are 0-based {col,row} internally; classic notation (A-J, 1-10) exists only at the label boundary via coordToLabel/labelToCoord"
  - "protocol.ts is pure types (no socket.io import) so shared keeps zero runtime dependencies; contract explicitly marked v0, to evolve in Phase 2 planning"
  - "coordToLabel throws RangeError on out-of-bounds; labelToCoord returns null on invalid input (parse = fallible, format = programmer error)"

patterns-established:
  - "Vitest with zero config: src/*.test.ts colocated with modules, npm test -w shared"
  - "Placeholder modules (export {} + owner comment) reserve files so parallel TDD plans never collide"
  - "Barrel index.ts is pure re-exports; all real code lives in named modules"

issues-created: []

# Metrics
duration: 6min
completed: 2026-07-03
---

# Phase 1 Plan 02: Shared Game Core Summary

**Tested board/coordinate and fleet-geometry modules plus a dependency-free typed Socket.IO protocol (v0), with Vitest wired into shared and placeholder modules staged for the 01-03/01-04 TDD plans**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-03T15:54:32Z
- **Completed:** 2026-07-03T15:59:49Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- board.ts: GRID_SIZE (moved from index.ts), Coordinate/Orientation types, inBounds, coordToLabel/labelToCoord round-tripping classic notation (A1–J10, case-insensitive parse, null on garbage), coordsEqual — 21 tests
- fleet.ts: ShipClassId union, SHIP_LENGTHS, canonical FLEET, ShipPlacement/FleetPlacement, cellsForPlacement geometry expansion, TOTAL_SHIP_CELLS derived as 17 — 5 tests
- protocol.ts: typed event maps for all 6 client→server and 7 server→client events plus ErrorCode/GamePhase/ShotOutcome unions, zero runtime deps
- Vitest running in shared (26 tests passing); index.ts now a pure barrel; placement.ts/shots.ts placeholders let 01-03 and 01-04 run in parallel without shared-file conflicts
- Verified end-to-end: tsc passes in all three packages, `npm run dev` + `/health` via Vite proxy still returns gridSize 10 through the barrel

## Task Commits

Each task was committed atomically:

1. **Task 1: Vitest setup + board/coordinate primitives** - `abc67eb` (feat)
2. **Task 2: Fleet definitions and placement geometry types** - `7e8cf9d` (feat)
3. **Task 3: Typed protocol events + barrel with TDD placeholders** - `92067bd` (feat)

## Files Created/Modified
- `shared/src/board.ts` - Grid constants, coordinate types, bounds check, label conversion
- `shared/src/board.test.ts` - Round-trip, invalid-label, and bounds-edge tests
- `shared/src/fleet.ts` - Ship classes, lengths, fleet composition, placement geometry
- `shared/src/fleet.test.ts` - cellsForPlacement and TOTAL_SHIP_CELLS tests
- `shared/src/protocol.ts` - v0 typed Socket.IO event maps + ErrorCode union (pure types)
- `shared/src/placement.ts` / `shared/src/shots.ts` - `export {}` placeholders owned by 01-03 / 01-04
- `shared/src/index.ts` - Pure barrel re-exporting all five modules
- `shared/package.json` - vitest devDependency, test/test:watch scripts

## Decisions Made
- **Intra-shared relative imports use `.js` extensions.** NodeNext resolution rejects extensionless relative imports; `.js` specifiers are the canonical NodeNext form and resolve to `.ts` sources in tsc, tsx, Vite, and Vitest alike. Cross-package imports remain bare package names — this refines (not reverses) 01-01's "extensionless TS" decision.
- coordToLabel throws on out-of-bounds (programmer error) while labelToCoord returns null (untrusted input parsing) — matches how server validation will consume them.
- protocol.ts marked as v0 contract in module comment; Phase 2 planning is expected to evolve it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relative imports needed explicit .js extensions under NodeNext**
- **Found during:** Task 1 (board primitives)
- **Issue:** `tsc --noEmit -p shared` failed with TS2835 on `from "./board"` — NodeNext requires explicit file extensions for relative ESM imports
- **Fix:** Used `./board.js`-style specifiers for all relative imports inside shared
- **Files modified:** shared/src/board.test.ts, shared/src/fleet.ts, shared/src/fleet.test.ts, shared/src/protocol.ts, shared/src/index.ts
- **Verification:** tsc passes in shared/server/client; Vitest and Vite dev both resolve correctly (26 tests pass, /health returns gridSize 10)
- **Committed in:** abc67eb (Task 1 commit)

**2. [Rule 3 - Blocking] noUncheckedIndexedAccess on regex match groups**
- **Found during:** Task 1 (labelToCoord)
- **Issue:** Strict base config flags `match[1]`/`match[2]` as possibly undefined
- **Fix:** Explicit undefined guards folded into the null-return path
- **Files modified:** shared/src/board.ts
- **Verification:** tsc passes; invalid-label tests still pass
- **Committed in:** abc67eb (Task 1 commit)

### Deferred Enhancements

None.

---

**Total deviations:** 2 auto-fixed (both blocking typecheck), 0 deferred
**Impact on plan:** Mechanical strict-mode/ESM compliance only. No scope creep.

## Issues Encountered
None.

## Next Phase Readiness
- Plans 01-03 (placement validation) and 01-04 (shot resolution) can start RED immediately: Vitest is wired, their placeholder modules exist, and board/fleet primitives they build on are tested
- Phase 2 can apply ClientToServerEvents/ServerToClientEvents to Socket.IO generics on both ends; contract is v0 and expected to be refined during Phase 2 planning
- shared still has zero runtime dependencies — keep it that way

---
*Phase: 01-foundation*
*Completed: 2026-07-03*
