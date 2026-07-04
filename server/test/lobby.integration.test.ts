// Lobby flow proven against the real Socket.IO server: create, join by
// code, double-join rejection, ready-up phase flip, and quick-match
// pairing, all via headless socket.io-client connections. Every assertion
// awaits a specific event with a timeout — never fixed sleeps.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as clientIo, type Socket as ClientSocket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@steel-horizon/shared";
import { createServer, type ServerHandles } from "../src/index.js";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const EVENT_TIMEOUT_MS = 2000;

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
async function connect(
  name: string,
): Promise<{ socket: TestClient; sessionId: string }> {
  const socket: TestClient = clientIo(baseUrl, {
    auth: { name },
    transports: ["websocket"],
  });
  clients.push(socket);
  const { sessionId } = await waitFor(socket, "session");
  return { socket, sessionId };
}

beforeAll(async () => {
  handles = createServer();
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

describe("lobby flow", () => {
  it("runs create → join → double-join rejection → ready-up phase flip", async () => {
    // 1. A connects and creates a room.
    const { socket: alice, sessionId: aliceSession } = await connect("Alice");
    expect(aliceSession).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const createdState = waitFor(alice, "roomState");
    alice.emit("createRoom", { name: "Alice" });
    const { snapshot: created } = await createdState;

    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(created.phase).toBe("lobby");
    expect(created.you).toMatchObject({
      name: "Alice",
      ready: false,
      connected: true,
    });
    expect(created.opponent).toBeNull();
    const code = created.code;

    // 2. B joins by code — BOTH receive viewer-relative snapshots.
    const { socket: bob } = await connect("Bob");
    const aliceState = waitFor(alice, "roomState");
    const bobState = waitFor(bob, "roomState");
    bob.emit("joinRoom", { name: "Bob", code });
    const [{ snapshot: aliceSnap }, { snapshot: bobSnap }] = await Promise.all([
      aliceState,
      bobState,
    ]);

    expect(aliceSnap.you.name).toBe("Alice");
    expect(aliceSnap.opponent?.name).toBe("Bob");
    expect(bobSnap.you.name).toBe("Bob");
    expect(bobSnap.opponent?.name).toBe("Alice");
    expect(bobSnap.code).toBe(code);

    // 3a. A third client joining the now-full room gets ROOM_FULL.
    const { socket: carol } = await connect("Carol");
    const carolError = waitFor(carol, "errorEvent");
    carol.emit("joinRoom", { name: "Carol", code });
    expect((await carolError).code).toBe("ROOM_FULL");

    // 3b. A joining again (even her own room) gets ALREADY_JOINED.
    const aliceError = waitFor(alice, "errorEvent");
    alice.emit("joinRoom", { name: "Alice", code });
    expect((await aliceError).code).toBe("ALREADY_JOINED");

    // 4. Both ready up — both snapshots flip to "placement".
    const afterAliceReadyA = waitFor(alice, "roomState");
    const afterAliceReadyB = waitFor(bob, "roomState");
    alice.emit("setReady", { ready: true });
    const [{ snapshot: midA }, { snapshot: midB }] = await Promise.all([
      afterAliceReadyA,
      afterAliceReadyB,
    ]);
    expect(midA.phase).toBe("lobby");
    expect(midA.you.ready).toBe(true);
    expect(midB.opponent?.ready).toBe(true);

    const afterBobReadyA = waitFor(alice, "roomState");
    const afterBobReadyB = waitFor(bob, "roomState");
    bob.emit("setReady", { ready: true });
    const [{ snapshot: finalA }, { snapshot: finalB }] = await Promise.all([
      afterBobReadyA,
      afterBobReadyB,
    ]);
    expect(finalA.phase).toBe("placement");
    expect(finalB.phase).toBe("placement");
  });

  it("pairs two quick-match clients into a shared room", async () => {
    const { socket: dana } = await connect("Dana");
    const { socket: eve } = await connect("Eve");

    const danaState = waitFor(dana, "roomState");
    const eveState = waitFor(eve, "roomState");
    dana.emit("quickMatch", { name: "Dana" });
    eve.emit("quickMatch", { name: "Eve" });

    const [{ snapshot: danaSnap }, { snapshot: eveSnap }] = await Promise.all([
      danaState,
      eveState,
    ]);

    expect(danaSnap.code).toBe(eveSnap.code);
    expect(danaSnap.phase).toBe("lobby");
    expect(danaSnap.opponent?.name).toBe("Eve");
    expect(eveSnap.opponent?.name).toBe("Dana");
  });

  it("rejects invalid names without creating state", async () => {
    const { socket: mallory } = await connect("Mallory");
    const nameError = waitFor(mallory, "errorEvent");
    mallory.emit("createRoom", { name: "   " });
    expect((await nameError).code).toBe("INVALID_NAME");

    // Session is still room-less: a valid createRoom now succeeds.
    const state = waitFor(mallory, "roomState");
    mallory.emit("createRoom", { name: "Mallory" });
    expect((await state).snapshot.you.name).toBe("Mallory");
  });
});
