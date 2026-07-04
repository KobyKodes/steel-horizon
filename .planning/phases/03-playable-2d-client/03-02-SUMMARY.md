---
phase: 03-playable-2d-client
plan: 02
subsystem: ui
tags: [react, pointer-events, drag-and-drop, shared-validation]

# Dependency graph
requires:
  - phase: 03-playable-2d-client
    plan: 01
    provides: socket singleton, snapshot-driven store, phase router, screen seams
  - phase: 01-foundation
    provides: "shared/src/{board,fleet,placement}.ts — validateFleetPlacement, generateRandomFleet, cellsForPlacement, coordToLabel"
provides:
  - Controlled PlacementBoard component (10x10 grid + dock, pointer-based drag/rotate, legality ghosting) reusable by later phases
  - PlacementScreen fleet-draft flow (hand-place, randomize, clear, ready-up, locked waiting state) wired to the real placeFleet emit
  - Additive store action placeFleet (socket emit only, no other store.ts changes)
affects: [03-03 battle screen (parallel, no overlap), 04 3d-scene (may replace 2D board visuals but keeps the draft/validation contract)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pointer-event drag (pointerdown/pointermove/pointerup on window) chosen over HTML5 DnD for cross-browser reliability; single drag mechanism, no dual-path complexity"
    - "Draft-time legality mirrors shared validateFleetPlacement's bounds/overlap checks per-ship during authoring; full validateFleetPlacement runs once at Ready-time on the complete fleet"
    - "Draft fleet is local component state only; the wire boundary is the single placeFleet emit — snapshot.you.fleet is the only source of truth once submitted"

key-files:
  created:
    - client/src/components/PlacementBoard.tsx
  modified:
    - client/src/screens/PlacementScreen.tsx
    - client/src/screens/placement.css
    - client/src/store.ts

key-decisions:
  - "No setReady(true) after placeFleet: the server's setReady handler is lobby-only (WRONG_PHASE in placement) — placement readiness IS having an accepted fleet; the engine flips lobby->battle itself once both fleets land"
  - "Draft-time per-ship legality (bounds + collision against other placed ships) computed inline in PlacementBoard rather than calling validateFleetPlacement on every hover, since that function expects fleet composition to already be exactly 5 ships — full validation only runs once, at Ready-time, on the complete draft"
  - "Illegal drops (overlap or out-of-bounds) leave the draft untouched — no onChange call — so the ship visually snaps back to its prior position with zero extra state"

patterns-established:
  - "Controlled board components take (draft, onChange) and own no fleet state — enables randomize/clear/reset to be simple draft replacements at the screen level"
  - "Screen-level draft -> single terminal emit -> snapshot-locked render is the template later screens (e.g. any future draft-then-submit UI) should follow"

issues-created: []

# Metrics
duration: ~35min
completed: 2026-07-04
---

# Phase 3 Plan 02: Fleet Placement UI Summary

**Full drag-to-place fleet placement UI — 10x10 board with pointer-based drag/rotate and live legality ghosting, randomize/clear/ready-up flow that submits to the real server, and a refresh-proof locked/waiting state driven entirely by the snapshot**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `PlacementBoard` (`client/src/components/PlacementBoard.tsx`): controlled 10x10 grid with column/row headers via `coordToLabel`, a dock of the 5 unplaced ship classes, pointer-based drag (dock-to-board and board-to-board), R-to-rotate mid-drag, right-click-to-rotate a placed ship, green/red ghost preview computed from the dragged ship's cells against shared bounds/overlap rules, and a brief red flash on illegal rotation attempts
- `PlacementScreen` rewritten: owns the local draft (`Map<ShipClassId, ShipPlacement>`), composes `PlacementBoard`, and adds Randomize (`generateRandomFleet()`), Clear, and Ready controls — Ready is disabled until all 5 ships are placed and `validateFleetPlacement` passes on the full draft
- Ready submits the draft via a new additive `placeFleet` store action (`socket.emit("placeFleet", { fleet })`); once the server accepts (`snapshot.you.fleet !== null`) the board renders locked/read-only straight from the snapshot and shows "Waiting for opponent…" / opponent-ready status
- `INVALID_PLACEMENT` rejection (hostile-input path) surfaces in the existing error-banner pattern with the board left unlocked for correction
- Verified end-to-end with a real two-browser-context Playwright run against the live dev servers (Vite + the Socket.IO server): 14/14 checks green, covering hand-placement, randomize, rejected overlapping and out-of-bounds drops, mid-placement refresh, ready-up, transition to the battle screen for both players, and a post-submission refresh restoring the locked state without landing back on the name-entry screen

## Task Commits

- `9c18c45` — feat(03-02): placement board with pointer-drag, rotation, and legality ghosting
- `bb6f495` — feat(03-02): placement screen with randomize, clear, ready-up, and locked waiting state

## Files Changed

- `client/src/components/PlacementBoard.tsx` (new) — controlled board + dock, pointer drag/rotate, ghost legality preview
- `client/src/screens/PlacementScreen.tsx` — draft state, randomize/clear/ready controls, submission + locked/waiting render, error banner
- `client/src/screens/placement.css` — board/dock/cell/ghost/dock-ship/controls styling
- `client/src/store.ts` — additive `placeFleet` action (single emit, no other changes)

## Decisions Made

- No client-side `setReady(true)` call after `placeFleet` — the server's `setReady` is lobby-phase-only and would return `WRONG_PHASE` in placement; the engine already flips lobby->battle itself once both players' fleets are accepted, so placement "ready" is fully represented by `snapshot.you.fleet !== null`
- Draft-time legality is computed as a lightweight per-ship bounds+collision check (mirroring, not calling, `validateFleetPlacement`) because that function asserts exact 5-ship composition and would reject every intermediate drafting state; the shared function is still the single source of truth at Ready-time, run once against the complete draft
- One drag mechanism only (pointer events), per the plan's constraint against layering HTML5 DnD and pointer events

## Deviations from Plan

- The plan's task description mentioned calling `setReady(true)` after `placeFleet`; this was intentionally omitted because the server contract makes it a no-op-or-error in the placement phase (see Decisions above). The done-criteria ("ready is impossible with an invalid or incomplete fleet") is met via the Ready button's enablement gate instead.

## Issues Encountered

None blocking. Verified manually via a real two-tab Playwright script (not part of the repo — scratchpad-only) rather than a committed test file, matching this plan's "manual two-tab" verification style (no automated UI test suite exists in this repo yet).

## Next Phase Readiness

- `npm run typecheck` / `npm run build` green in `@steel-horizon/client`; all 48 server tests remain green (no server files touched)
- Placement is fully playable end-to-end against the real server; 03-03 (battle screen) was executed in parallel with no file overlap
- Ready for Phase 3 to proceed to remaining plans / phase closeout

---
*Phase: 03-playable-2d-client*
*Completed: 2026-07-04*
