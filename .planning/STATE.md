# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Two people on different machines play a complete, cheat-resistant game of Battleship inside a cinematic 3D naval scene — and both halves (bulletproof multiplayer, hyper-realistic presentation) are equally non-negotiable.
**Current focus:** Phase 4 — 3D Ocean Scene (in progress, plan 6 of 7 complete)

## Current Position

Phase: 4 of 7 (3D Ocean Scene) — In progress
Plan: 6 of 7 in current phase — Complete
Status: Plan 04-06 complete; ready to execute 04-07 (Placement — final Phase 4 plan)
Last activity: 2026-07-05 — Completed 04-06-PLAN.md (Post-Game 3D reveal: `GameSceneAdapter` gained a `mode?: "interactive" | "reveal"` prop — reveal mode disables all `HoloGrid` hover/click via a new `interactive` prop and always renders the fleet regardless of camera view; `PostGameScreen` now shows both fleets via two reveal-mode adapters instead of the deleted `FleetBoard.tsx`; `BattleScreen`'s side-panel fleet reveal was migrated to the same adapter since FleetBoard's other consumer couldn't be left dangling. Every screen except Placement now renders its board via the 3D scene). Checkpoint self-verified per yolo config: a Node socket.io-client script drove two real sessions through create/join/ready/place/fire to a real gameover against the live dev server (mirroring server/test/helpers.ts's playToVictory), then headless Playwright resumed one session via sessionStorage to render the actual Post-Game screen — both reveal boards showed correct hit/miss/sunk markers matching the real shot history, zero console errors, rematch flow intact. Two bugs found and fixed during self-verification: an ocean shader two-tone banding seam (removed the deep/shallow height mix) and an awkwardly-cropped fleet camera framing in the smaller reveal boards (CameraRig's fleet view repositioned). Logged ISS-001 (BattleScreen now runs two simultaneous live R3F Canvases) to ISSUES.md for Phase 6.

Progress: ███████░░░ ~67% (16/24 plans complete across all phases; Phase 4 tracked at 7 plans total per 04-07-PLAN.md already on disk)

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: ~32 min
- Total execution time: ~8.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 4 | 22 min | 6 min |
| 02-multiplayer-server | 3 | 67 min | 22 min |
| 03-playable-2d-client | 3 | ~98 min | ~33 min |
| 04-3d-ocean-scene | 6 | ~337 min | ~56 min |

**Recent Trend:**
- Last 5 plans: 04-02 (~95 min incl. 2 checkpoint fix iterations), 04-03 (~50 min, checkpoint approved first pass), 04-04 (~35 min, checkpoint self-verified first pass), 04-05 (~55 min, checkpoint self-verified with 2 in-flight bug fixes found via screenshots/live playtest), 04-06 (~72 min, checkpoint self-verified via a scripted socket.io playthrough + Playwright session resume, with 2 in-flight visual bug fixes found)
- Trend: integration-heavy plans run ~25-55 min; 3D visual work runs longer when rendering bugs surface, but self-verifying with headless Playwright screenshots (and, for 04-05/04-06, a full live-server playtest) before the human checkpoint catches those bugs earlier and keeps the checkpoint itself a fast approval rather than a fix-iteration loop. 04-06 also established a faster self-verification path for read-only/reveal-only plans: a scripted socket.io-client playthrough to gameover plus a single Playwright session resume, instead of driving live 3D firing through canvas raycasts.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Pure ESM workspace (01-01):** `"type": "module"` in all packages; server/shared use NodeNext resolution, client uses Bundler.
- **Source-level shared package (01-01):** @steel-horizon/shared exports raw `src/index.ts` — no build step in dev; later phases must not add a dist/build requirement.
- **Single-origin dev (01-01):** Vite proxies `/health` and `/socket.io` (ws enabled) to :3001 — confirmed sufficient in 02-01, no client proxy changes needed.
- **Intra-shared imports use .js specifiers (01-02);** server relative imports do the same (NodeNext). Cross-package imports stay bare (`@steel-horizon/shared`).
- **Coordinates 0-based internally (01-02);** classic notation only at the label boundary.
- **Touching ships are legal (01-03);** random fleets via rejection sampling (01-03).
- **Validation results are discriminated unions (01-03):** first-failure reason; server and client consume the same reason.
- **Shot rules are pure and stateless (01-04):** resolveShot/isFleetDestroyed take (fleet, shots, target); previousShots excludes the shot being resolved.
- **Protocol v1 replaces v0 outright (02-01):** GamePhase/LobbyPlayer and v0 S2C events deleted; snapshot-driven contract (`session`/`roomState` + redacted RoomSnapshot). RoomSnapshot's shape makes pre-gameover opponent-fleet leakage impossible (fleet only in `revealedOpponentFleet`).
- **App-level sessions via handshake auth (02-01):** server-minted UUID sessionIds, never socket.id; socket.data.sessionId is the only trusted identity; stores (SessionStore/RoomStore) are Map wrappers behind narrow interfaces, Redis-swappable.
- **Per-viewer snapshot sends only (02-01):** snapshots are viewer-specific; never room-broadcast. buildLobbySnapshot is the single redaction point — 02-02 extends it into the full game snapshot.
- **createServer/start factory with main-module guard (02-01):** tests import the server without binding a port; `npm run dev` (tsx watch) behavior unchanged. Integration tests bind port 0 and await events with timeouts, never sleeps.
- **Queued player creating/joining dequeues silently (02-01):** createRoom/joinRoom remove the session from the quick-match queue instead of erroring.
- **Engine is a pure state machine with injected rng (02-02):** server/src/game/engine.ts has no socket.io/timers/I/O; transitions return `{ok:true,...}|{ok:false,code}` with state untouched on rejection; forfeit() already implemented for 02-03's grace timer.
- **buildSnapshot is the only board-state serialization path (02-02):** server/src/snapshot.ts; room.phase mirrors game.phase via syncRoomPhase after each accepted mutation.
- **shotResult.shooter is the display name, never the sessionId (02-02):** session ids are resume credentials and must not reach the opponent.
- **Rematch acceptance resets ready flags (02-02):** post-rematch snapshots read as a clean placement phase.
- **Last-connect-wins on same-session double connect (02-03):** socketsBySession is re-pointed BEFORE the old socket is dropped, so superseded sockets skip ALL disconnect side effects (including matchmaking removal) — this is what makes refresh safe.
- **Grace timers keyed room+player, cleared on reconnect, unref()'d (02-03):** graceMs precedence is factory override > RECONNECT_GRACE_MS env > 60s default; expiry forfeits live games via the engine or frees a lobby seat.
- **Room deletion gated on fully-abandoned (02-03):** every seat disconnected AND no grace timer pending; gameover rooms linger for rematch until abandoned; deleted rooms unlink their sessions so codes free up.
- **Reconnect is snapshot-driven only (02-03):** a new socket offering a known sessionId is restored from one buildSnapshot in any phase; server/test/helpers.ts playToVictory proves snapshots alone can drive a client (the Phase 3 template).
- **Client socket auth is callback-form (03-01):** socket.io re-reads sessionStorage per reconnect attempt, so a mid-session sessionId mint is offered automatically; sessionId lives in sessionStorage only (per-tab identity).
- **Store listeners registered once at module init (03-01):** never inside React effects (StrictMode-safe); store module auto-connects on load when sessionStorage holds a name, making refresh restore zero-click.
- **snapshot.phase IS the client routing (03-01):** App.tsx switches on the snapshot; no router library, no client-side transitions; Placement/Battle/PostGame stubs exclusively owned by 03-02/03-03.
- **Draft fleet state is local-only until one terminal emit (03-02):** PlacementBoard is a controlled component (draft + onChange, zero owned fleet state); PlacementScreen owns the draft and the only wire traffic is a single `placeFleet` emit — snapshot.you.fleet is the sole post-submission source of truth (refresh-proof).
- **No client setReady(true) after placeFleet (03-02):** server's setReady is lobby-phase-only (WRONG_PHASE elsewhere); placement "ready" is fully represented by an accepted fleet, and the engine flips lobby->battle itself once both fleets land.
- **Draft-time legality is a lightweight inline bounds+collision check, not a validateFleetPlacement call (03-02):** that shared function asserts exact 5-ship composition and would reject every intermediate drafting state; it still runs once, as the single source of truth, at Ready-time against the complete draft.
- **Single drag mechanism: pointer events only (03-02):** pointerdown/pointermove/pointerup on window, no HTML5 DnD — avoids cross-browser DnD fiddliness per the plan's constraint.
- **CSS class names must be unique across screen stylesheets (03-03):** placement.css and battle.css both defined `.board` with incompatible layouts (grid vs flex); the later-loaded stylesheet won the cascade and silently broke the other screen. All screen-level container classes should be prefixed/scoped (e.g. `.placement-grid`) rather than generic names like `.board`.
- **Sunk-ship cells are server-supplied, not client-inferred (03-03):** `ShotRecord`/`shotResult` now carry `sunkShipCells: Coordinate[]` populated by the engine from the exact placement that was resolved. A sunk ship's shape is permanently public the instant it dies and never exposes any other ship (touching or not), so this is safe to reveal in full — replaces a same-axis-run-length heuristic that broke whenever two sunk ships touched.
- **Pinned R3F stack, not latest (04-01):** three@0.185.1 / @react-three/fiber@8.9.2 / @react-three/drei@9.122.0 — fiber 9.x/drei 10.x require React 19, conflicting with the Phase 1 React 18.3 pin.
- **Single source of truth for wave math (04-01):** `client/src/scene/waves.ts` exports `WaveParams` + `gerstnerHeight()`; Ocean's shader and 04-02's ship bob/pitch must both read these exact constants, never re-derive an approximation.
- **Stylized shader ocean, not reflection-based Water.js (04-01):** holographic teal/blue Fresnel-rim shader chosen over three's mirror-reflection Water addon for cost and aesthetic fit.
- **Shader time driven by useFrame mutation, not React state (04-01):** `uniforms.uTime.value` is set directly inside `useFrame`; routing animation time through React state would force a re-render every frame.
- **New scene work gets an isolated `?dev=scene` sandbox route (04-01):** `main.tsx` branches to `SceneSandbox` only on that query param; the real app entry point is otherwise untouched. Plan 04-06 removes the sandbox once the scene is wired into the real screens.
- **One parameterized procedural builder per asset family (04-02):** `<ShipModel shipClass=...>` covers all 5 classes from a `ShipClassSpec` table (relative multipliers off shared `SHIP_LENGTHS`); geometries/materials memoized on the class key, never rebuilt per frame.
- **Shared frame clock for everything that must agree with the water (04-02):** Ocean's `uTime` and FleetShips' `gerstnerHeight` sampling both read `clock.elapsedTime` — Ocean accumulating its own delta desynced water from ships by the pre-first-frame gap. Any future wake/splash/projectile animation must use the same clock and `waves.ts` constants.
- **Explicit waterline constants, not ad-hoc nudges (04-02):** `KEEL_DEPTH` (40% of draft below waterline) and `DECK_LINE` (1.1 drafts above) in ShipHull.tsx encode ExtrudeGeometry's real y-span (bevel extends past both extrude faces; extrude depth maps to +Y after rotateX). Deck furniture is placed flush with the real deck line.
- **Wave steepness is tuned against ship scale (04-02):** summed crest amplitude must stay below the smallest hull's freeboard or trough-riding ships vanish behind neighboring crests; the two shortest classes carry proportionally higher draft ratios for the same reason.
- **Pitch/roll via finite-difference wave sampling (04-02):** ship attitude comes from sampling `gerstnerHeight` at small offsets along local length/beam axes — no independent sine approximation, no drift from the surface.
- **HoloGrid is a pure, game-state-agnostic primitive (04-03):** `client/src/scene/grid/HoloGrid.tsx` only emits `Coordinate` via `onHoverCell`/`onSelectCell`; it has no knowledge of fleets/shots/turns. 04-05 and 04-06 add a `cellStates` prop for shot markers rather than teaching it game rules.
- **drei `<Instances>`/`<Instance>` for any repeated identical geometry (04-03):** one draw call for all 100 grid cells; per-instance R3F pointer events (`onPointerOver`/`onPointerOut`/`onClick`) handle hover/click natively, no manual `THREE.Raycaster`.
- **Explicit `renderOrder` for transparent content stacked above another transparent surface (04-03):** three does not guarantee transparent-object draw order by scene depth. The Ocean plane (`alpha 0.95`) could draw after HoloGrid's additive-blended cells and multiply their glow by 0.05, washing out all cell states. HoloGrid sets `renderOrder={1}` so it always composites after the ocean. Any future overlay above the water (wake trails, projectile effects) must do the same.
- **Amber reserved exclusively for the grid's "selected" cell state (04-03):** the one deliberate warm-color departure from the scene's all-teal palette, so a locked target reads unmistakably; future grid-based UI (targeting, placement) should keep this color meaning consistent rather than introducing new accent colors.
- **Camera transitions use per-axis `THREE.MathUtils.damp`, not GSAP/Theatre.js (04-04):** `client/src/scene/camera/CameraRig.tsx` damps both camera position and a separate `lookAt` target `Vector3` toward named `fleetView`/`targetingView` configs every frame, using elapsed delta time so convergence speed is frame-rate independent (confirmed via 6x CPU-throttled headless verification). `SceneRoot`'s `view` prop is now required (no default), forcing every future screen integration (04-05/06/07) to explicitly choose a camera view rather than inheriting a stale implicit default.
- **`cellToWorld` in `client/src/scene/grid/gridCoords.ts` is the one grid-to-world coordinate mapping (04-05):** every 3D component that positions content by grid coordinate — `HoloGrid`'s cells, `FleetShips`' placements, and `ShipClasses.ts`'s `BASE_UNIT` (world units per grid-cell of ship length, now equal to `CELL_SIZE`) — reads this instead of approximating its own math. 04-06/04-07 must do the same.
- **`GameSceneAdapter` is the game-facing wrapper over the state-agnostic scene primitives (04-05):** `client/src/scene/GameSceneAdapter.tsx` converts `ShotRecord[]` into `HoloGrid`'s `cellStates` map (porting `TargetingBoard`'s old `sunkCellsFrom` logic verbatim) and gates `onFire` on turn + no-existing-shot, mirroring the old `clickable` guard. `HoloGrid`/`FleetShips` themselves stay game-state-agnostic; 04-06 (post-game) and 04-07 (placement) build their own adapters over the same primitives rather than teaching the primitives new game rules.
- **Ships render only in fleet view (04-05):** `GameSceneAdapter` renders `FleetShips` only when `view === "fleet"` — the grid is one shared physical space used for two different boards (your fleet vs. the enemy's waters) depending on camera framing, so rendering your own ships unconditionally showed them superimposed on the targeting view's grid (caught via live two-browser Playwright verification, fixed before the plan's final commit).
- **`GameSceneAdapter`'s `mode` prop is the branch point for read-only display (04-06):** `mode?: "interactive" | "reveal"` (default interactive); reveal mode always renders the fleet (no `view === "fleet"` gate, since a reveal board only ever shows one board) and passes `HoloGrid`'s new `interactive={false}` to suppress all hover/click/cursor behavior, leaving only the static `cellStates` markers. Any future read-only board reuses this rather than a new adapter.
- **Deleting a shared component requires migrating every consumer in the same commit (04-06):** `FleetBoard.tsx` had two consumers (`PostGameScreen` and `BattleScreen`'s side panel); both were migrated to `GameSceneAdapter mode="reveal"` together even though the plan's file list only named `PostGameScreen.tsx`, since deleting the file with a dangling import elsewhere would break the build.
- **Two independent Canvases for side-by-side reveal boards, not one shared Canvas (04-06):** `PostGameScreen`'s two `GameSceneAdapter` instances each mount their own `SceneRoot`/`Canvas`. Acceptable for a static, non-time-pressured screen; ISS-001 flags that `BattleScreen`'s equivalent (interactive main canvas + reveal side canvas, both running continuously during live play) is a real per-frame cost worth measuring in Phase 6.
- **Fast self-verification path for read-only/non-firing plans (04-06):** rather than driving live 3D firing through canvas raycasts, a Node `socket.io-client` script plays a full game to gameover against the live dev server (mirroring `server/test/helpers.ts`'s `playToVictory`/fixed fleets), then a single headless Playwright browser resumes one session via `sessionStorage` to render the real screen. Reuse this pattern for any future plan whose diff is confined to a read-only/reveal view.

### Deferred Issues

- **ISS-001 (open):** BattleScreen runs two simultaneous live R3F Canvases (interactive main panel + read-only reveal side panel), each with its own continuous `frameloop="always"` render loop — roughly doubles per-frame GPU/CPU cost during live gameplay versus the single-canvas 04-05 baseline. Low risk today; flagged for Phase 6's 60fps budget work. See `.planning/ISSUES.md`.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-07-05
Stopped at: Completed 04-06-PLAN.md (SUMMARY created) — Phase 4 plan 6 of 7 complete, ready to execute 04-07 (Placement, final Phase 4 plan)
Resume file: None
