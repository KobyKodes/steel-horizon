// Battle flow proven over real sockets: placement (including rejection and
// re-place), deterministic coin flip via injected rng, miss/hit/sunk with
// turn alternation, out-of-turn and repeat-cell rejections — and the
// anti-cheat pin: NO snapshot the shooter receives before gameover contains
// any un-hit opponent ship coordinate or a revealed fleet.
//
// Deliberately does NOT play a full game to a win — that is 02-03's
// headless full-game verification.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as clientIo, type Socket as ClientSocket } from "socket.io-client";
import {
  cellsForPlacement,
  coordsEqual,
  type ClientToServerEvents,
  type Coordinate,
  type FleetPlacement,
  type RoomSnapshot,
  type ServerToClientEvents,
} from "@steel-horizon/shared";
import { createServer, type ServerHandles } from "../src/index.js";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const EVENT_TIMEOUT_MS = 2000;

/** Alice's fleet: rows 0–4, horizontal from col 0. */
const FLEET_ALICE: FleetPlacement = [
  { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 0, row: 1 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 0, row: 2 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 0, row: 3 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 0, row: 4 }, orientation: "horizontal" },
];

/** Bob's fleet: rows 5–9, horizontal from col 5. Destroyer at (5,9)–(6,9). */
const FLEET_BOB: FleetPlacement = [
  { ship: "carrier", origin: { col: 5, row: 5 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 5, row: 6 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 5, row: 7 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 5, row: 8 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 5, row: 9 }, orientation: "horizontal" },
];

/** Illegal: destroyer overlaps the carrier's origin cell. */
const OVERLAPPING_FLEET: FleetPlacement = [
  ...FLEET_BOB.slice(0, 4),
  { ship: "destroyer", origin: { col: 5, row: 5 }, orientation: "vertical" },
];

let handles: ServerHandles;
let baseUrl: string;
const clients: TestClient[] = [];

/** Resolve with the next `event` payload, or reject after a timeout. */
function waitFor<E extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for "${String(event)}"`));
    }, EVENT_TIMEOUT_MS);
    socket.once(event as never, ((payload: never) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}

/** Connect a fresh client and await its minted session id. */
async function connect(name: string): Promise<TestClient> {
  const socket: TestClient = clientIo(baseUrl, {
    auth: { name },
    transports: ["websocket"],
  });
  clients.push(socket);
  await waitFor(socket, "session");
  return socket;
}

beforeAll(async () => {
  // rng () => 0 makes the coin flip deterministic: player 0 (the room
  // creator, Alice) always fires first.
  handles = createServer({ rng: () => 0 });
  await new Promise<void>((resolve) => handles.httpServer.listen(0, resolve));
  const address = handles.httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an ephemeral TCP port");
  }
  baseUrl = `http://localhost:${address.port}`;
});

afterAll(async () => {
  for (const socket of clients) socket.disconnect();
  handles.io.close();
  await new Promise<void>((resolve) => {
    handles.httpServer.close(() => resolve());
  });
});

describe("game loop over sockets", () => {
  it("plays placement and battle with redacted snapshots throughout", async () => {
    const alice = await connect("Alice");
    const bob = await connect("Bob");

    // Every snapshot the SHOOTER (Alice) ever receives, for the final
    // redaction sweep.
    const aliceSnapshots: RoomSnapshot[] = [];
    alice.on("roomState", ({ snapshot }) => aliceSnapshots.push(snapshot));

    // --- Lobby: create, join, ready up into placement. -------------------
    const created = waitFor(alice, "roomState");
    alice.emit("createRoom", { name: "Alice" });
    const code = (await created).snapshot.code;

    let aliceState = waitFor(alice, "roomState");
    let bobState = waitFor(bob, "roomState");
    bob.emit("joinRoom", { name: "Bob", code });
    await Promise.all([aliceState, bobState]);

    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    alice.emit("setReady", { ready: true });
    await Promise.all([aliceState, bobState]);

    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    bob.emit("setReady", { ready: true });
    const [{ snapshot: placementA }] = await Promise.all([
      aliceState,
      bobState,
    ]);
    expect(placementA.phase).toBe("placement");

    // --- Placement: invalid rejected, re-place allowed. ------------------
    const bobPlacementError = waitFor(bob, "errorEvent");
    bob.emit("placeFleet", { fleet: OVERLAPPING_FLEET });
    expect((await bobPlacementError).code).toBe("INVALID_PLACEMENT");

    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    alice.emit("placeFleet", { fleet: FLEET_ALICE });
    const [{ snapshot: afterAlicePlaced }, { snapshot: bobSeesPlaced }] =
      await Promise.all([aliceState, bobState]);
    expect(afterAlicePlaced.phase).toBe("placement");
    expect(afterAlicePlaced.you.fleet).toEqual(FLEET_ALICE);
    // The opponent's snapshot never carries Alice's placement.
    expect(bobSeesPlaced.you.fleet).toBeNull();
    expect(bobSeesPlaced.revealedOpponentFleet).toBeNull();

    // Bob re-places with a legal fleet: battle begins, coin flip → Alice.
    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    bob.emit("placeFleet", { fleet: FLEET_BOB });
    const [{ snapshot: battleA }, { snapshot: battleB }] = await Promise.all([
      aliceState,
      bobState,
    ]);
    expect(battleA.phase).toBe("battle");
    expect(battleB.phase).toBe("battle");
    expect(battleA.currentTurn).toBe("you");
    expect(battleB.currentTurn).toBe("opponent");

    // --- Battle: out-of-turn rejection. ----------------------------------
    const bobTurnError = waitFor(bob, "errorEvent");
    bob.emit("fire", { target: { col: 0, row: 0 } });
    expect((await bobTurnError).code).toBe("NOT_YOUR_TURN");

    // Alice fires a known miss; both get shotResult and snapshots; turn
    // alternates.
    let aliceShot = waitFor(alice, "shotResult");
    let bobShot = waitFor(bob, "shotResult");
    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    alice.emit("fire", { target: { col: 0, row: 9 } });
    const [missForAlice, missForBob] = await Promise.all([
      aliceShot,
      bobShot,
    ]);
    expect(missForAlice).toEqual({
      shooter: "Alice",
      target: { col: 0, row: 9 },
      result: "miss",
      score: { points: 0, streak: 0, multiplier: 1, total: 0, bonuses: [] },
    });
    expect(missForBob.result).toBe("miss");
    const [{ snapshot: afterMissA }, { snapshot: afterMissB }] =
      await Promise.all([aliceState, bobState]);
    expect(afterMissA.currentTurn).toBe("opponent");
    expect(afterMissA.yourShots).toEqual([
      {
        target: { col: 0, row: 9 },
        result: "miss",
        score: { points: 0, streak: 0, multiplier: 1, total: 0, bonuses: [] },
      },
    ]);
    expect(afterMissB.currentTurn).toBe("you");
    expect(afterMissB.shotsAgainstYou).toHaveLength(1);

    // Bob burns his turn on a miss against Alice's board.
    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    bob.emit("fire", { target: { col: 9, row: 0 } });
    await Promise.all([aliceState, bobState]);

    // Repeat cell → CELL_ALREADY_SHOT and the turn stays with Alice.
    const aliceRepeatError = waitFor(alice, "errorEvent");
    alice.emit("fire", { target: { col: 0, row: 9 } });
    expect((await aliceRepeatError).code).toBe("CELL_ALREADY_SHOT");

    // --- Sink Bob's destroyer: (5,9) then (6,9). --------------------------
    // First destroyer cell: still Alice's turn (repeat was rejected).
    aliceShot = waitFor(alice, "shotResult");
    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    alice.emit("fire", { target: { col: 5, row: 9 } });
    expect((await aliceShot).result).toBe("hit");
    await Promise.all([aliceState, bobState]);

    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    bob.emit("fire", { target: { col: 9, row: 1 } });
    await Promise.all([aliceState, bobState]);

    aliceShot = waitFor(alice, "shotResult");
    bobShot = waitFor(bob, "shotResult");
    aliceState = waitFor(alice, "roomState");
    bobState = waitFor(bob, "roomState");
    alice.emit("fire", { target: { col: 6, row: 9 } });
    const [sunkForAlice, sunkForBob] = await Promise.all([
      aliceShot,
      bobShot,
    ]);
    const destroyerCells = [
      { col: 5, row: 9 },
      { col: 6, row: 9 },
    ];
    // Streak 2 at x1: base 100 + sink 250 + perfect kill 250 (both shots
    // landed on the destroyer), banked on the earlier first-blood 250.
    const sunkScore = {
      points: 600,
      streak: 2,
      multiplier: 1,
      total: 850,
      bonuses: [
        { bonus: "sink", points: 250 },
        { bonus: "perfect-kill", points: 250 },
      ],
    };
    expect(sunkForAlice).toEqual({
      shooter: "Alice",
      target: { col: 6, row: 9 },
      result: "sunk",
      sunkShip: "destroyer",
      sunkShipCells: destroyerCells,
      score: sunkScore,
    });
    expect(sunkForBob.sunkShip).toBe("destroyer");

    const [{ snapshot: afterSunkA }, { snapshot: afterSunkB }] =
      await Promise.all([aliceState, bobState]);
    // Shooter sees the proven kill; victim sees both hits against them.
    expect(afterSunkA.opponent?.sunkShips).toEqual(["destroyer"]);
    expect(
      afterSunkB.shotsAgainstYou.filter((s) => s.result !== "miss"),
    ).toEqual([
      {
        target: { col: 5, row: 9 },
        result: "hit",
        score: {
          points: 250,
          streak: 1,
          multiplier: 1,
          total: 250,
          bonuses: [{ bonus: "first-blood", points: 150 }],
        },
      },
      {
        target: { col: 6, row: 9 },
        result: "sunk",
        sunkShip: "destroyer",
        sunkShipCells: destroyerCells,
        score: sunkScore,
      },
    ]);
    expect(afterSunkB.phase).toBe("battle");

    // --- Redaction sweep: the wire never leaked Bob's placements. ---------
    const aliceTargets: Coordinate[] = [
      { col: 0, row: 9 },
      { col: 5, row: 9 },
      { col: 6, row: 9 },
    ];
    const unhitBobCells = FLEET_BOB.flatMap(cellsForPlacement).filter(
      (cell) => !aliceTargets.some((t) => coordsEqual(t, cell)),
    );
    expect(unhitBobCells).toHaveLength(15);
    expect(aliceSnapshots.length).toBeGreaterThanOrEqual(9);

    for (const snapshot of aliceSnapshots) {
      expect(snapshot.revealedOpponentFleet).toBeNull();
      const wire = JSON.stringify(snapshot);
      expect(wire).not.toContain('"revealedOpponentFleet":{');
      for (const cell of unhitBobCells) {
        expect(wire).not.toContain(`"col":${cell.col},"row":${cell.row}`);
      }
    }
  });
});
