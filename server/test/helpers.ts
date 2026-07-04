// Shared integration harness for the headless verification suites —
// extracted from the 02-01/02-02 tests and extended for 02-03: server
// factory with injectable { graceMs, rng }, typed socket.io clients, event
// waiters with timeouts, legal fleet fixtures, and the snapshot-driven
// playToVictory loop. playToVictory decides who fires purely from the
// latest snapshots, which doubles as proof that a snapshot alone is enough
// to drive a client — exactly what the Phase 3 2D client will do.

import { io as clientIo, type Socket as ClientSocket } from "socket.io-client";
import {
  GRID_SIZE,
  type ClientToServerEvents,
  type Coordinate,
  type FleetPlacement,
  type HandshakeAuth,
  type RoomSnapshot,
  type ServerToClientEvents,
} from "@steel-horizon/shared";
import { createServer, type ServerHandles } from "../src/index.js";
import type { SocketServerDeps } from "../src/socket.js";

export type TestClient = ClientSocket<
  ServerToClientEvents,
  ClientToServerEvents
>;

export const EVENT_TIMEOUT_MS = 2000;

/** Alice's fleet: rows 0–4, horizontal from col 0 (17 cells). */
export const FLEET_A: FleetPlacement = [
  { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 0, row: 1 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 0, row: 2 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 0, row: 3 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 0, row: 4 }, orientation: "horizontal" },
];

/** Bob's fleet: rows 5–9, horizontal from col 5 (17 cells). */
export const FLEET_B: FleetPlacement = [
  { ship: "carrier", origin: { col: 5, row: 5 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 5, row: 6 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 5, row: 7 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 5, row: 8 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 5, row: 9 }, orientation: "horizontal" },
];

/** All 100 board cells in row-major order — the scripted firing plan. */
export const ALL_CELLS: Coordinate[] = Array.from(
  { length: GRID_SIZE * GRID_SIZE },
  (_, i) => ({ col: i % GRID_SIZE, row: Math.floor(i / GRID_SIZE) }),
);

function cellKey(cell: Coordinate): string {
  return `${cell.col},${cell.row}`;
}

/** Resolve with the next `event` payload, or reject after a timeout. */
export function waitFor<E extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: E,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for "${String(event)}"`));
    }, timeoutMs);
    socket.once(event as never, ((payload: never) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}

/** Resolve with the client-side disconnect reason. */
export function waitForDisconnect(
  socket: TestClient,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timed out waiting for "disconnect"'));
    }, timeoutMs);
    socket.once("disconnect", (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `predicate` until true or the deadline passes. */
export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitUntil timed out");
    await sleep(5);
  }
}

export interface TestServer {
  baseUrl: string;
  handles: ServerHandles;
  /** Open a socket WITHOUT awaiting — lets callers register waiters first. */
  open(auth: HandshakeAuth): TestClient;
  /** Open a socket and await its (possibly resumed) session id. */
  connect(
    auth: HandshakeAuth,
  ): Promise<{ socket: TestClient; sessionId: string }>;
  close(): Promise<void>;
}

/** Boot the real server on an ephemeral port with injectable deps. */
export async function startTestServer(
  deps: SocketServerDeps = {},
): Promise<TestServer> {
  const handles = createServer(deps);
  await new Promise<void>((resolve) => handles.httpServer.listen(0, resolve));
  const address = handles.httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an ephemeral TCP port");
  }
  const baseUrl = `http://localhost:${address.port}`;
  const sockets: TestClient[] = [];

  function open(auth: HandshakeAuth): TestClient {
    const socket: TestClient = clientIo(baseUrl, {
      auth,
      transports: ["websocket"],
    });
    sockets.push(socket);
    return socket;
  }

  async function connect(auth: HandshakeAuth) {
    const socket = open(auth);
    const { sessionId } = await waitFor(socket, "session");
    return { socket, sessionId };
  }

  async function close(): Promise<void> {
    for (const socket of sockets) socket.disconnect();
    handles.io.close();
    await new Promise<void>((resolve) => {
      handles.httpServer.close(() => resolve());
    });
  }

  return { baseUrl, handles, open, connect, close };
}

export interface BattleSetup {
  a: TestClient;
  b: TestClient;
  aSession: string;
  bSession: string;
  code: string;
  /** Both clients' first battle-phase snapshots. */
  snapA: RoomSnapshot;
  snapB: RoomSnapshot;
}

/** Emit from one client and await both clients' next roomState snapshots. */
async function emitAndSnapshot(
  a: TestClient,
  b: TestClient,
  act: () => void,
): Promise<{ snapA: RoomSnapshot; snapB: RoomSnapshot }> {
  const pa = waitFor(a, "roomState");
  const pb = waitFor(b, "roomState");
  act();
  const [ra, rb] = await Promise.all([pa, pb]);
  return { snapA: ra.snapshot, snapB: rb.snapshot };
}

/**
 * Drive two fresh clients through create → join → ready → place with the
 * fixed fleets, returning them at the top of the battle phase.
 */
export async function startBattle(
  server: TestServer,
  nameA = "Alice",
  nameB = "Bob",
): Promise<BattleSetup> {
  const { socket: a, sessionId: aSession } = await server.connect({
    name: nameA,
  });
  const { socket: b, sessionId: bSession } = await server.connect({
    name: nameB,
  });

  const created = waitFor(a, "roomState");
  a.emit("createRoom", { name: nameA });
  const code = (await created).snapshot.code;

  await emitAndSnapshot(a, b, () => b.emit("joinRoom", { name: nameB, code }));
  await emitAndSnapshot(a, b, () => a.emit("setReady", { ready: true }));
  await emitAndSnapshot(a, b, () => b.emit("setReady", { ready: true }));
  await emitAndSnapshot(a, b, () => a.emit("placeFleet", { fleet: FLEET_A }));
  const { snapA, snapB } = await emitAndSnapshot(a, b, () =>
    b.emit("placeFleet", { fleet: FLEET_B }),
  );

  if (snapA.phase !== "battle" || snapB.phase !== "battle") {
    throw new Error("startBattle did not reach the battle phase");
  }
  return { a, b, aSession, bSession, code, snapA, snapB };
}

/**
 * Snapshot-driven game loop: whichever client's latest snapshot says
 * `currentTurn: "you"` fires the next unfired cell from the row-major
 * enumeration, until both snapshots carry a winner. Works regardless of
 * the coin flip because turn ownership is read from the wire, not assumed.
 */
export async function playToVictory(
  a: TestClient,
  b: TestClient,
  snapA: RoomSnapshot,
  snapB: RoomSnapshot,
): Promise<{ snapA: RoomSnapshot; snapB: RoomSnapshot }> {
  for (let shots = 0; shots < ALL_CELLS.length * 2; shots++) {
    if (snapA.winner !== null && snapB.winner !== null) {
      return { snapA, snapB };
    }
    const [shooter, shooterSnap] =
      snapA.currentTurn === "you"
        ? ([a, snapA] as const)
        : ([b, snapB] as const);
    if (shooterSnap.currentTurn !== "you") {
      throw new Error("no client holds the turn and nobody has won");
    }
    const fired = new Set(shooterSnap.yourShots.map((s) => cellKey(s.target)));
    const target = ALL_CELLS.find((cell) => !fired.has(cellKey(cell)));
    if (target === undefined) {
      throw new Error("board exhausted without a winner");
    }
    ({ snapA, snapB } = await emitAndSnapshot(a, b, () =>
      shooter.emit("fire", { target }),
    ));
  }
  throw new Error("game did not finish within 200 shots");
}
