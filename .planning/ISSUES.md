# Project Issues Log

Enhancements discovered during execution. Not critical - address in future phases.

## Open Enhancements

### ISS-001: BattleScreen now runs two simultaneous live R3F Canvases

- **Discovered:** Phase 4 Task 06-1 (2026-07-05)
- **Type:** Performance
- **Description:** BattleScreen's "Enemy waters"/"Your fleet" main panel (interactive `GameSceneAdapter`) and its "Your fleet" side panel (read-only reveal `GameSceneAdapter`, replacing the deleted `FleetBoard`) each mount their own `<Canvas>` via `SceneRoot`. Both run a continuous `frameloop="always"` render loop (Ocean shader animation, ship wave-bob) at the same time during live gameplay, roughly doubling per-frame GPU/CPU cost versus the single-canvas Battle screen 04-05 shipped. The Post-Game reveal screen's two side-by-side canvases are lower-risk since that screen is static/non-time-pressured (per 04-06's plan text); BattleScreen's second canvas runs continuously throughout an entire live battle.
- **Impact:** Low today (5-ship scenes are cheap; PerformanceMonitor already downgrades DPR under load) but worth measuring before Phase 6's 60fps budget work, and before Phase 5 adds particle effects that will run in the main canvas.
- **Effort:** Medium (would need either a shared-Canvas multi-viewport approach, a frameloop="demand" mode for the read-only side panel with manual invalidate-on-shot-change, or reverting the side panel to a lightweight 2D display)
- **Suggested phase:** 6 (Resilience & Edge Cases — the phase already scoped to hold 60fps)

## Closed Enhancements

[Moved here when addressed]
