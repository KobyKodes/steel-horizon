import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  InMemoryRoomStore,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type Room,
} from "./rooms.js";

describe("generateRoomCode", () => {
  it("produces 6-character codes", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateRoomCode(() => false)).toHaveLength(ROOM_CODE_LENGTH);
    }
  });

  it("only uses the unambiguous alphabet (no I, O, 0, 1)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(() => false);
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it("retries until it finds an untaken code", () => {
    const seen: string[] = [];
    // Reject the first three candidates, accept the fourth.
    const isTaken = (code: string): boolean => {
      seen.push(code);
      return seen.length < 4;
    };
    const code = generateRoomCode(isTaken);
    expect(seen).toHaveLength(4);
    expect(code).toBe(seen[3]);
  });
});

describe("InMemoryRoomStore", () => {
  const makeRoom = (code: string): Room => ({
    code,
    players: [],
    phase: "lobby",
    game: null,
    scoresSubmitted: false,
    leaderboard: null,
    weeklyLeaderboard: null,
    leaderboardRanks: {},
    winStreaks: {},
  });

  it("create/get round-trips a room by code", () => {
    const store = new InMemoryRoomStore();
    const room = makeRoom("ABC234");
    store.create(room);
    expect(store.get("ABC234")).toBe(room);
  });

  it("get returns undefined for unknown codes", () => {
    const store = new InMemoryRoomStore();
    expect(store.get("NOPE22")).toBeUndefined();
  });

  it("delete removes the room", () => {
    const store = new InMemoryRoomStore();
    store.create(makeRoom("ABC234"));
    store.delete("ABC234");
    expect(store.get("ABC234")).toBeUndefined();
  });
});
