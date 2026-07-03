# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Two people on different machines play a complete, cheat-resistant game of Battleship inside a cinematic 3D naval scene — and both halves (bulletproof multiplayer, hyper-realistic presentation) are equally non-negotiable.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 7 (Foundation)
Plan: 01-03 complete (01-04 code landed in parallel; its docs commit pending)
Status: In progress — parallel TDD wave (01-03/01-04) finishing
Last activity: 2026-07-03 — Plan 01-03 executed (fleet placement validation + random fleet generation, TDD, 11 tests)

Progress: ▓░░░░░░░░░ ~12%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 6 min
- Total execution time: ~0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 19 min | 6 min |

**Recent Trend:**
- Last 5 plans: 01-01 (10 min), 01-02 (6 min), 01-03 (3 min)
- Trend: speeding up (shared-core plans are small and well-scoped)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Pure ESM workspace (01-01):** `"type": "module"` in all packages; server/shared use NodeNext resolution, client uses Bundler. Keep imports extensionless TS.
- **Source-level shared package (01-01):** @steel-horizon/shared exports raw `src/index.ts` — no build step in dev; tsx and Vite compile on the fly. Later phases must not add a dist/build requirement to shared without revisiting this.
- **Single-origin dev (01-01):** Vite proxies `/health` and `/socket.io` (ws enabled) to :3001. Phase 2 Socket.IO needs no client proxy changes.
- **Intra-shared imports use .js specifiers (01-02):** NodeNext rejects extensionless relative imports; `./board.js` resolves to `board.ts` in tsc/tsx/Vite/Vitest. Cross-package imports stay bare (`@steel-horizon/shared`). Refines 01-01's "extensionless TS" decision.
- **Coordinates 0-based internally (01-02):** `Coordinate = {col, row}`; classic notation (A–J, 1–10) only at the label boundary via coordToLabel/labelToCoord. labelToCoord returns null on bad input; coordToLabel throws.
- **Protocol is pure types, v0 (01-02):** protocol.ts defines Socket.IO event maps without importing socket.io — shared keeps zero runtime deps. Contract explicitly expected to evolve in Phase 2 planning.
- **Placeholder file ownership (01-02):** placement.ts (plan 01-03) and shots.ts (plan 01-04) exist as `export {}` stubs so both TDD plans run in parallel without touching shared files.
- **Validation results are discriminated unions (01-03):** `PlacementValidation = {valid: true} | {valid: false; reason}` with checks ordered composition → bounds → overlap, returning the first failure. Server (Phase 2) and client UX (Phase 3) consume the same single reason.
- **Touching ships are legal (01-03):** classic rules; pinned by a dedicated test so a no-touch rule can't sneak in later.
- **Random fleets via rejection sampling (01-03):** generateRandomFleet places longest-first with plain retry, no backtracking — cannot deadlock on 10x10 with touching allowed.

### Deferred Issues

None yet.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-07-03
Stopped at: Plan 01-03 complete (SUMMARY created); 01-04 code merged, awaiting its docs commit to close Phase 1's TDD wave
Resume file: None
