import { describe, expect, it } from "vitest";
import { MatchmakingQueue } from "./matchmaking.js";

const notInRoom = (): boolean => false;

describe("MatchmakingQueue", () => {
  it("a single entrant waits", () => {
    const queue = new MatchmakingQueue();
    const result = queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    expect(result).toEqual({ status: "waiting" });
    expect(queue.size).toBe(1);
  });

  it("pairs exactly two distinct sessions FIFO", () => {
    const queue = new MatchmakingQueue();
    queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    const result = queue.enqueue({ sessionId: "s2", name: "Bo" }, notInRoom);

    expect(result.status).toBe("paired");
    if (result.status !== "paired") throw new Error("unreachable");
    expect(result.players[0]).toEqual({ sessionId: "s1", name: "Ada" });
    expect(result.players[1]).toEqual({ sessionId: "s2", name: "Bo" });
    expect(queue.size).toBe(0);
  });

  it("pairs in arrival order when more than two queue up", () => {
    const queue = new MatchmakingQueue();
    queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    queue.enqueue({ sessionId: "s2", name: "Bo" }, notInRoom);
    // s1+s2 paired; s3 starts a fresh queue.
    queue.enqueue({ sessionId: "s3", name: "Cy" }, notInRoom);
    const result = queue.enqueue({ sessionId: "s4", name: "Di" }, notInRoom);
    if (result.status !== "paired") throw new Error("expected pairing");
    expect(result.players.map((p) => p.sessionId)).toEqual(["s3", "s4"]);
  });

  it("rejects the same session enqueueing twice", () => {
    const queue = new MatchmakingQueue();
    queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    const result = queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    expect(result).toEqual({ status: "rejected", reason: "already-queued" });
    expect(queue.size).toBe(1);
  });

  it("rejects a session that is already in a room", () => {
    const queue = new MatchmakingQueue();
    const result = queue.enqueue(
      { sessionId: "s1", name: "Ada" },
      (sessionId) => sessionId === "s1",
    );
    expect(result).toEqual({ status: "rejected", reason: "already-in-room" });
    expect(queue.size).toBe(0);
  });

  it("removes a session on disconnect so it never pairs", () => {
    const queue = new MatchmakingQueue();
    queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    queue.remove("s1");
    expect(queue.size).toBe(0);
    expect(queue.has("s1")).toBe(false);

    const result = queue.enqueue({ sessionId: "s2", name: "Bo" }, notInRoom);
    expect(result).toEqual({ status: "waiting" });
  });

  it("remove is a no-op for sessions not in the queue", () => {
    const queue = new MatchmakingQueue();
    queue.enqueue({ sessionId: "s1", name: "Ada" }, notInRoom);
    queue.remove("ghost");
    expect(queue.size).toBe(1);
  });
});
