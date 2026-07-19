// Bot AI unit tests — pins the difficulty contracts: every pick is legal
// (in bounds, never repeated), medium locks on after a hit and extends
// collinear runs, hard's heatmap finishes wounded ships and out-hunts
// random, and all three difficulties can finish a full game.

import { describe, expect, it } from "vitest";
import {
  cellsForPlacement,
  generateRandomFleet,
  GRID_SIZE,
  resolveShot,
  type Coordinate,
  type ShotRecord,
} from "@steel-horizon/shared";
import { chooseBotShot, isBotDifficulty, type BotDifficulty } from "./bot.js";

const DIFFICULTIES: BotDifficulty[] = ["easy", "medium", "hard"];

function record(
  col: number,
  row: number,
  result: ShotRecord["result"] = "miss",
): ShotRecord {
  return { target: { col, row }, result };
}

/** Play a bot against a random fleet until it is destroyed; return shots. */
function playOut(difficulty: BotDifficulty, rng: () => number): ShotRecord[] {
  const fleet = generateRandomFleet();
  const shots: ShotRecord[] = [];
  const totalShipCells = 17;
  let hits = 0;
  while (hits < totalShipCells) {
    expect(shots.length).toBeLessThan(GRID_SIZE * GRID_SIZE);
    const target = chooseBotShot(shots, difficulty, rng);
    const resolution = resolveShot(
      fleet,
      shots.map((s) => s.target),
      target,
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error("illegal bot shot");
    if (resolution.result !== "miss") hits++;
    shots.push(
      resolution.result === "sunk"
        ? {
            target,
            result: "sunk",
            sunkShip: resolution.ship,
            sunkShipCells: resolution.cells,
          }
        : { target, result: resolution.result },
    );
  }
  return shots;
}

/** Deterministic-ish rng for reproducible tests. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("isBotDifficulty", () => {
  it("accepts the three difficulties and rejects everything else", () => {
    for (const d of DIFFICULTIES) expect(isBotDifficulty(d)).toBe(true);
    expect(isBotDifficulty("brutal")).toBe(false);
    expect(isBotDifficulty(undefined)).toBe(false);
    expect(isBotDifficulty(3)).toBe(false);
  });
});

describe("chooseBotShot legality", () => {
  it("never repeats a cell and always stays in bounds (all difficulties)", () => {
    for (const difficulty of DIFFICULTIES) {
      const rng = seededRng(42);
      const shots = playOut(difficulty, rng);
      const seen = new Set(shots.map((s) => `${s.target.col},${s.target.row}`));
      expect(seen.size).toBe(shots.length);
      for (const s of shots) {
        expect(s.target.col).toBeGreaterThanOrEqual(0);
        expect(s.target.col).toBeLessThan(GRID_SIZE);
        expect(s.target.row).toBeGreaterThanOrEqual(0);
        expect(s.target.row).toBeLessThan(GRID_SIZE);
      }
    }
  });

  it("finishes a full game within the 100-cell budget (all difficulties)", () => {
    for (const difficulty of DIFFICULTIES) {
      const shots = playOut(difficulty, seededRng(7));
      expect(shots.length).toBeLessThanOrEqual(GRID_SIZE * GRID_SIZE);
      expect(
        shots.filter((s) => s.result === "sunk").length,
      ).toBe(5);
    }
  });
});

describe("medium lock-on", () => {
  it("probes an orthogonal neighbour after a lone hit", () => {
    const shots = [record(5, 5, "hit")];
    for (let i = 0; i < 20; i++) {
      const pick = chooseBotShot(shots, "medium", seededRng(i));
      const distance =
        Math.abs(pick.col - 5) + Math.abs(pick.row - 5);
      expect(distance).toBe(1);
    }
  });

  it("extends a collinear run at one of its ends", () => {
    const shots = [record(4, 5, "hit"), record(5, 5, "hit")];
    for (let i = 0; i < 20; i++) {
      const pick = chooseBotShot(shots, "medium", seededRng(i));
      expect(pick.row).toBe(5);
      expect([3, 6]).toContain(pick.col);
    }
  });

  it("ignores hits already resolved by a sunk ship", () => {
    const shots: ShotRecord[] = [
      record(0, 0, "hit"),
      {
        target: { col: 1, row: 0 },
        result: "sunk",
        sunkShip: "destroyer",
        sunkShipCells: [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
      },
    ];
    // No open hits: medium falls back to hunting, which may go anywhere
    // EXCEPT it must not treat (0,0)/(1,0) as wounds. Sample many picks and
    // require they are not all adjacent to the sunk pair.
    const picks = Array.from({ length: 30 }, (_, i) =>
      chooseBotShot(shots, "medium", seededRng(i)),
    );
    const allAdjacent = picks.every(
      (p) => Math.abs(p.col - 0.5) + Math.abs(p.row) <= 1.5,
    );
    expect(allAdjacent).toBe(false);
  });
});

describe("hard heatmap", () => {
  it("targets a completion of a wounded ship", () => {
    // Two hits in a row with a miss capping the left end: the only
    // completions run rightward, so the pick must be (6,5) or (3,5)…
    // with (3,5) blocked by the miss, it must be (6,5) or cells between —
    // all between-cells are already hit, so (6,5) or (3,5)->excluded.
    const shots = [
      record(3, 5, "miss"),
      record(4, 5, "hit"),
      record(5, 5, "hit"),
    ];
    for (let i = 0; i < 10; i++) {
      const pick = chooseBotShot(shots, "hard", seededRng(i));
      expect(pick.row).toBe(5);
      expect(pick.col).toBe(6);
    }
  });

  it("sinks a random fleet in far fewer shots than easy on average", () => {
    let easyTotal = 0;
    let hardTotal = 0;
    for (let i = 0; i < 10; i++) {
      easyTotal += playOut("easy", seededRng(100 + i)).length;
      hardTotal += playOut("hard", seededRng(100 + i)).length;
    }
    expect(hardTotal).toBeLessThan(easyTotal);
  });
});

describe("cellsForPlacement sanity for playOut", () => {
  it("classic fleet totals 17 cells", () => {
    const total = generateRandomFleet()
      .map((p) => cellsForPlacement(p).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(17);
  });
});
