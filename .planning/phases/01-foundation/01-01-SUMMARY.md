---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [npm-workspaces, typescript, express, tsx, vite, react, concurrently, monorepo]

# Dependency graph
requires: []
provides:
  - npm-workspaces monorepo (shared, server, client) with root `npm run dev` entry point
  - "@steel-horizon/shared package consumed as raw TS source by both client and server (no dev build step)"
  - Express server shell on :3001 with GET /health proving cross-package wiring
  - Vite React client shell on :5173 with /health and /socket.io proxied to :3001
affects: [01-foundation plan 02, 02-multiplayer, all later phases]

# Tech tracking
tech-stack:
  added: [express@4, tsx@4, vite@5, react@18, react-dom@18, "@vitejs/plugin-react", concurrently@9, typescript@5.5]
  patterns: [source-level shared package exports, pure ESM workspace, single-origin dev via Vite proxy]

key-files:
  created:
    - package.json
    - tsconfig.base.json
    - shared/src/index.ts
    - server/src/index.ts
    - client/src/App.tsx
    - client/vite.config.ts
  modified: []

key-decisions:
  - "Pure ESM everywhere: type=module in all three packages; server/shared use NodeNext, client uses Bundler resolution"
  - "Shared package exports raw TS source (main/types/exports -> src/index.ts); tsx and Vite compile on the fly, no watch-build orchestration"
  - "Vite proxy for /health and /socket.io (ws: true) so client and server share an origin in dev, matching single-service production shape"

patterns-established:
  - "Cross-package imports: import { X } from '@steel-horizon/shared' works identically in client and server"
  - "Per-package tsconfig extends root tsconfig.base.json (strict, ES2022, noEmit)"
  - "Root scripts orchestrate workspaces via npm run <script> -w <pkg>"

issues-created: []

# Metrics
duration: 10min
completed: 2026-07-03
---

# Phase 1 Plan 01: Monorepo Scaffold Summary

**npm-workspaces monorepo with @steel-horizon/shared consumed as raw TS source by an Express (tsx) server and a Vite React client, all started by one root `npm run dev`**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-03T15:41:58Z
- **Completed:** 2026-07-03T15:51:55Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- Root workspace (shared, server, client) with strict shared tsconfig base; `npm install` clean, typecheck passes in all three packages
- Server GET /health returns `{"status":"ok","gridSize":10}` where GRID_SIZE comes from @steel-horizon/shared — cross-package wiring proven server-side
- Client renders "Steel Horizon" + GRID_SIZE from shared; Vite resolves the workspace package directly to `shared/src/index.ts` (verified in served module output)
- `npm run dev` at root starts both processes via concurrently; `curl localhost:5173/health` proxies through Vite to the server and returns gridSize 10

## Task Commits

Each task was committed atomically:

1. **Task 1: Root workspace + shared package skeleton** - `c22ebb5` (feat)
2. **Task 2: Express server shell importing shared** - `d24a438` (feat)
3. **Task 3: Vite React client shell + root dev script** - `271761a` (feat)

## Files Created/Modified
- `package.json` - Workspace root, engines node >=20, root `dev` script (concurrently)
- `tsconfig.base.json` - Strict ES2022 base config all packages extend
- `.gitignore` - node_modules, dist, .env, logs
- `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts` - Source-exporting shared package with temporary `GRID_SIZE = 10`
- `server/package.json`, `server/tsconfig.json`, `server/src/index.ts` - Express /health shell, tsx watch dev script, PORT || 3001
- `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx` - Vite React shell with proxy config

## Decisions Made
- **Module strategy: pure ESM.** All three packages set `"type": "module"`. Server and shared tsconfigs use `module`/`moduleResolution: NodeNext`; client uses `ESNext`/`Bundler` (Vite standard). Imports are extensionless TS — tsx and Vite both accept this, avoiding the mixed ESM/CJS workspace footgun.
- Shared package points main/types/exports at `src/index.ts` (raw source), so there is no build step or watch orchestration in dev.
- Vite proxy includes `/socket.io` with `ws: true` now, so Phase 2's Socket.IO needs no proxy changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node to server devDependencies**
- **Found during:** Task 2 (Express server shell)
- **Issue:** server/tsconfig.json sets `"types": ["node"]` (needed for `process.env`), but the plan's dependency list omitted @types/node, so `tsc --noEmit` would fail
- **Fix:** Added `@types/node@^20.14.0` to server devDependencies
- **Files modified:** server/package.json, package-lock.json
- **Verification:** `npx tsc --noEmit -p server` passes
- **Committed in:** d24a438 (Task 2 commit)

### Deferred Enhancements

None.

---

**Total deviations:** 1 auto-fixed (blocking), 0 deferred
**Impact on plan:** Trivial dependency addition required for typechecking. No scope creep.

## Issues Encountered
None.

## Next Phase Readiness
- Monorepo backbone ready: plan 01-02 can move GRID_SIZE into `shared/src/board.ts` and start real protocol/rules modules
- Socket.IO (Phase 2) slots in server-side with the client proxy already configured
- No blockers

---
*Phase: 01-foundation*
*Completed: 2026-07-03*
