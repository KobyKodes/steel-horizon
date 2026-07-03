---
phase: 01-foundation
plan: 03
subsystem: game-core
tags: [typescript, vitest, tdd, battleship, placement-validation, rejection-sampling]

# Dependency graph
requires:
  - phase: 01-02
    provides: board/coordinate primitives (inBounds, GRID_SIZE), fleet definitions (FLEET, SHIP_LENGTHS, cellsForPlacement), Vitest setup, placement.ts placeholder
provides:
  - validateFleetPlacement — server anti-cheat gate for the placement phase (composition/bounds/overlap, first failure wins)
  - generateRandomFleet — always-legal random layout for randomize button and 90s-timeout auto-placer
  - PlacementValidation discriminated union type
affects: [02-multiplayer server placement validation, 03-client drag-to-place feedback, 06-timeout auto-placement]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD RED/GREEN atomic commits, rejection sampling for constrained random generation, discriminated-union validation results]

key-files:
  created: [shared/src/placement.test.ts]
  modified: [shared/src/placement.ts]

key-decisions:
  - "Validation order is composition → bounds → overlap, returning the first failure only"
  - "Touching ships are legal (classic rules) — pinned by a dedicated test to block a future no-touch rule"
  - "generateRandomFleet uses longest-first rejection sampling, no backtracking (cannot deadlock on 10x10 with touching allowed)"

patterns-established:
  - "Validation results as discriminated unions ({valid: true} | {valid: false; reason}) rather than booleans or throws"
  - "Cell occupancy tracked via Set of 'col,row' string keys"

issues-created: []

# Metrics
duration: 3min
completed: 2026-07-03
---

# Phase 1 Plan 03: Fleet Placement Validation Summary

**TDD-built validateFleetPlacement (composition/bounds/overlap gate) and generateRandomFleet (longest-first rejection sampling), 11 tests green, exported via @steel-horizon/shared barrel**

## Performance

- **Duration:** ~3 min (RED → GREEN; session interrupted before bookkeeping)
- **Started:** 2026-07-03T16:02:37Z
- **Completed:** 2026-07-03T16:05:00Z (code) / bookkeeping finalized 2026-07-03T19:05Z
- **Tasks:** 1 TDD feature (RED + GREEN; no refactor needed)
- **Files modified:** 2

## Accomplishments

- **RED:** Wrote `shared/src/placement.test.ts` with 11 tests: known-good fleet valid; side-by-side touching valid (guards against a future no-touch rule); horizontal carrier at G1 and vertical destroyer at J10 → OUT_OF_BOUNDS; off-board origin (negative and ≥10) → OUT_OF_BOUNDS; shared cell → OVERLAP; missing class, duplicate class (two destroyers, 5 total), and empty array → WRONG_FLEET_COMPOSITION; plus generateRandomFleet property tests (200 iterations all valid; 20 calls yield ≥2 distinct layouts). Confirmed all 11 failed against the `export {}` placeholder before implementing.
- **GREEN:** Implemented `validateFleetPlacement` checking composition against FLEET (not hardcoded strings), then bounds, then overlap via a Set of "col,row" keys — built entirely on `cellsForPlacement` + `inBounds`, no local cell expansion. Implemented `generateRandomFleet` placing ships longest-first with rejection sampling. All 11 tests pass; barrel import from `@steel-horizon/shared` verified with tsx.
- **REFACTOR:** Not needed — implementation was already minimal and reused existing helpers; no third commit.

## Task Commits

TDD feature committed atomically per stage:

1. **RED: failing placement tests** - `f93036c` (test)
2. **GREEN: validation + random generation** - `6dc1238` (feat)

**Plan metadata:** see final docs commit for this plan.

## Files Created/Modified

- `shared/src/placement.test.ts` - 11 tests pinning placement legality rules and random-fleet properties
- `shared/src/placement.ts` - `PlacementValidation` type, `validateFleetPlacement`, `generateRandomFleet` (replaced 01-02 placeholder)

## Decisions Made

- **First-failure validation order (composition → bounds → overlap):** deterministic single reason keeps the Phase 2 server rejection path and Phase 3 UI messaging simple.
- **Touching allowed, test-pinned:** classic rules permit adjacent ships; a dedicated test prevents anyone adding a no-touch rule without consciously breaking it.
- **Rejection sampling without backtracking:** with touching allowed, the classic fleet cannot deadlock on a 10x10 board, so a plain retry loop per ship (longest-first) suffices.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- During GREEN verification, `npm test -w shared` and workspace-wide `tsc --noEmit` showed failures in `shots.test.ts` — those belonged to plan 01-04's concurrent RED phase (file owned by the parallel agent), not this plan. Verified this plan's suite green in isolation and typecheck clean for placement files. The full suite (49/49) passed once 01-04's GREEN landed.
- Session limit interrupted execution after the GREEN commit; bookkeeping (SUMMARY/STATE) completed in a follow-up pass. No code impact.

## Next Phase Readiness

- Placement legality engine ready for Phase 2 server-side anti-cheat and Phase 3 client placement UX.
- With 01-04 (shots/win detection) also complete, the shared game core is fully tested; Phase 1 foundation plans 01-01 through 01-04 are done.

---
*Phase: 01-foundation*
*Completed: 2026-07-03*
