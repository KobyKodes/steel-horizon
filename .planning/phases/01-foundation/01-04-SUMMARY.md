---
phase: 01-foundation
plan: 04
subsystem: game-core
tags: [typescript, vitest, tdd, battleship-rules]

# Dependency graph
requires:
  - phase: 01-foundation (plan 01-02)
    provides: board/coordinate primitives, fleet definitions with cellsForPlacement, protocol ErrorCode/ShotOutcome types, Vitest wiring, shots.ts placeholder
provides:
  - resolveShot — server-authoritative shot resolution (miss/hit/sunk with ship id, OUT_OF_BOUNDS and CELL_ALREADY_SHOT rejection)
  - isFleetDestroyed — win detection over full shot history (all 17 cells, duplicate-tolerant)
  - ShotResolution discriminated-union result type
affects: [02-multiplayer (server fire handler), client battle UI]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure stateless rule functions over fleet + shot history, discriminated-union ok/error results reusing protocol ErrorCode]

key-files:
  created: [shared/src/shots.test.ts]
  modified: [shared/src/shots.ts]

key-decisions:
  - "Result type named ShotResolution, not ShotOutcome — protocol.ts already exports ShotOutcome and the barrel star-exports both modules; a duplicate name would break @steel-horizon/shared exports"
  - "previousShots is the history BEFORE the resolved shot; caller appends target after resolution (documented by a dedicated contract test)"
  - "No fleet validation in shots.ts — assumes valid fleet; validation is 01-03's placement module and runs at placement time"

patterns-established:
  - "Rule functions stay pure and stateless: (fleet, shots, input) → result; server composes game state in Phase 2"
  - "Error arms reuse protocol ErrorCode via Extract<> instead of redefining string literals"

issues-created: []

# Metrics
duration: 3min
completed: 2026-07-03
---

# Phase 1 Plan 04: Shot Resolution and Win Detection Summary

**TDD-built resolveShot (miss/hit/sunk with ship id, repeat/bounds rejection) and isFleetDestroyed win detection, exported from @steel-horizon/shared**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-03T16:03:10Z
- **Completed:** 2026-07-03T16:06:00Z
- **Tasks:** 1 TDD feature (RED + GREEN)
- **Files modified:** 2

## RED

Wrote `shared/src/shots.test.ts` (12 tests) against the not-yet-implemented module:

- resolveShot: open-water miss; hit naming the ship; completing shot reports sunk (never hit); destroyer two-cell sink after one prior hit; repeat of prior hit and prior miss both rejected with CELL_ALREADY_SHOT; col 10 and row -1 rejected with OUT_OF_BOUNDS; contract test that the target is not in previousShots when resolving (same fresh target resolves identically twice)
- isFleetDestroyed: all 17 cells with interleaved misses → true; 16 of 17 → false; empty history → false; duplicates + extra misses still → true

Confirmed failing: 12/12 failed (`resolveShot`/`isFleetDestroyed` not exported from the placeholder). Committed as RED.

## GREEN

Replaced the `export {}` placeholder in `shared/src/shots.ts`:

- `resolveShot(fleet, previousShots, target): ShotResolution` — bounds check via `inBounds`, repeat check via `coordsEqual` against previousShots, then finds the ship whose `cellsForPlacement` cells contain the target; reports sunk iff every other cell of that ship is already in previousShots
- `isFleetDestroyed(fleet, shots): boolean` — Set of `"col,row"` keys for O(1) lookup; every cell of every placement must appear
- `ShotResolution` — four-arm discriminated union; error arm is `Extract<ErrorCode, "OUT_OF_BOUNDS" | "CELL_ALREADY_SHOT">`

All 12 tests green; `npx tsc --noEmit -p shared` clean; both functions verified importable from `@steel-horizon/shared` at runtime via tsx.

## REFACTOR

None needed — implementation is small, pure, and fully reuses board/fleet helpers. No refactor commit.

## Task Commits

1. **RED: failing shot/win tests** - `f79aacc` (test)
2. **GREEN: shot resolution + win detection** - `7695933` (feat)

**Plan metadata:** see `docs(01-04)` commit

## Files Created/Modified

- `shared/src/shots.test.ts` - 12 Vitest cases covering shot resolution, error codes, caller-appends contract, and win detection
- `shared/src/shots.ts` - resolveShot, isFleetDestroyed, ShotResolution type (replaced placeholder)

## Decisions Made

- **ShotResolution instead of ShotOutcome:** the plan named the union `ShotOutcome`, but protocol.ts already exports `ShotOutcome = "hit" | "miss" | "sunk"` and index.ts star-exports both modules; reusing the name would create an ambiguous barrel export. The `result` field reuses protocol's ShotOutcome values, so wire mapping stays 1:1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule - Blocking] Renamed result type to avoid barrel export collision**
- **Found during:** Test design (RED)
- **Issue:** Plan specified `ShotOutcome` as the union name; protocol.ts already exports that identifier and `index.ts` uses `export *` for both modules, which would make the name ambiguous/dropped in the package export surface
- **Fix:** Named the union `ShotResolution`; kept `result` values identical to protocol's `ShotOutcome`
- **Files modified:** shared/src/shots.ts, shared/src/shots.test.ts
- **Verification:** tsc clean; runtime import of both functions from `@steel-horizon/shared` succeeds
- **Committed in:** f79aacc / 7695933

---

**Total deviations:** 1 auto-fixed (blocking). No scope creep.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 2's server fire handler can call resolveShot + isFleetDestroyed directly; outcomes map 1:1 onto the `shotResult` / `gameOver` protocol events
- Pairs with 01-03's placement validation (executed in parallel) to complete the shared rules core

---
*Phase: 01-foundation*
*Completed: 2026-07-03*
