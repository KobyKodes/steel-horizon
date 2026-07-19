// Solo-vs-bot over real sockets: createBotGame skips the lobby straight to
// placement with the bot's fleet already down, the bot fires on its turns
// until someone wins, bot scores never reach the global leaderboard, and a
// rematch restarts instantly because the bot auto-accepts.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@steel-horizon/shared";
import {
  ALL_CELLS,
  FLEET_A,
  startTestServer,
  waitFor,
  waitUntil,
  type TestClient,
  type TestServer,
} from "./helpers.js";

let server: TestServer;

beforeAll(async () => {
  // Near-instant bot so a full game resolves in test time.
  server = await startTestServer({ botDelayMs: 5 });
});

afterAll(async () => {
  await server.close();
});

describe("bot game over sockets", () => {
  let solo: TestClient;
  let latest: RoomSnapshot;

  it("createBotGame lands directly in placement against a ready bot", async () => {
    const { socket } = await server.connect({ name: "Solo" });
    solo = socket;
    socket.on("roomState", ({ snapshot }) => {
      latest = snapshot;
    });

    const first = waitFor(solo, "roomState");
    solo.emit("createBotGame", { name: "Solo", difficulty: "hard" });
    const { snapshot } = await first;

    expect(snapshot.phase).toBe("placement");
    expect(snapshot.opponent?.name).toBe("Admiral Bot");
    expect(snapshot.opponent?.ready).toBe(true);
    expect(snapshot.opponent?.connected).toBe(true);
  });

  it("plays a complete game — the bot fires its own turns to gameover", async () => {
    const placed = waitFor(solo, "roomState");
    solo.emit("placeFleet", { fleet: FLEET_A });
    await placed;
    expect(latest.phase).toBe("battle");

    let nextCell = 0;
    while (latest.phase === "battle") {
      await waitUntil(
        () => latest.phase !== "battle" || latest.currentTurn === "you",
        15_000,
      );
      if (latest.phase !== "battle") break;
      const fired = latest.yourShots.length;
      solo.emit("fire", { target: ALL_CELLS[nextCell++]! });
      await waitUntil(
        () => latest.phase !== "battle" || latest.yourShots.length > fired,
        15_000,
      );
    }

    expect(latest.phase).toBe("gameover");
    expect(latest.winner).not.toBeNull();
    expect(latest.winReason).toBe("all-ships-sunk");
    expect(latest.finalScores).not.toBeNull();

    // The bot fought back (it fired real shots)…
    expect(latest.shotsAgainstYou.length).toBeGreaterThan(0);
    // …but never touches the global leaderboard.
    expect(latest.leaderboard).not.toBeNull();
    for (const entry of latest.leaderboard!) {
      expect(entry.name).not.toBe("Admiral Bot");
    }
  }, 30_000);

  it("rematch restarts immediately — the bot auto-accepts and re-places", async () => {
    const restarted = waitFor(solo, "roomState");
    solo.emit("requestRematch");
    await restarted;

    expect(latest.phase).toBe("placement");
    expect(latest.opponent?.ready).toBe(true);
    expect(latest.yourShots).toEqual([]);

    // The new game is live: placing again flips straight to battle.
    const battle = waitFor(solo, "roomState");
    solo.emit("placeFleet", { fleet: FLEET_A });
    await battle;
    expect(latest.phase).toBe("battle");
  });
});
