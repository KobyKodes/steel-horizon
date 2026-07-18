import { describe, expect, it } from "vitest";
import type { Coordinate } from "./board.js";
import {
  applyShot,
  BASE_HIT_POINTS,
  finalizeScore,
  FIRST_BLOOD_BONUS,
  FLAWLESS_BONUS,
  initialScoreState,
  isPerfectKill,
  multiplierForStreak,
  SINK_BONUS_BY_LENGTH,
  VICTORY_BONUS,
  type ScoredShot,
  type ScoreState,
} from "./scoring.js";

const NO_BONUS_CONTEXT = { firstHitOfMatch: false, priorTargets: [] };

function hitTimes(count: number, start = initialScoreState()) {
  let state = start;
  let lastEvent = null;
  for (let i = 0; i < count; i++) {
    const applied = applyShot(state, { result: "hit" }, NO_BONUS_CONTEXT);
    state = applied.state;
    lastEvent = applied.event;
  }
  return { state, lastEvent };
}

describe("multiplierForStreak", () => {
  it("hits x2 at 3, x3 at 5, then climbs +1 per hit, uncapped", () => {
    expect(multiplierForStreak(0)).toBe(1);
    expect(multiplierForStreak(2)).toBe(1);
    expect(multiplierForStreak(3)).toBe(2);
    expect(multiplierForStreak(4)).toBe(2);
    expect(multiplierForStreak(5)).toBe(3);
    expect(multiplierForStreak(6)).toBe(4);
    expect(multiplierForStreak(7)).toBe(5);
    expect(multiplierForStreak(9)).toBe(7);
    expect(multiplierForStreak(17)).toBe(15);
  });
});

describe("applyShot", () => {
  it("pays base points for a hit and extends the streak", () => {
    const { state, event } = applyShot(
      initialScoreState(),
      { result: "hit" },
      NO_BONUS_CONTEXT,
    );
    expect(event).toEqual({
      points: BASE_HIT_POINTS,
      streak: 1,
      multiplier: 1,
      total: BASE_HIT_POINTS,
      bonuses: [],
    });
    expect(state.points).toBe(BASE_HIT_POINTS);
  });

  it("applies x2 to the 3rd consecutive hit itself", () => {
    const { lastEvent } = hitTimes(3);
    expect(lastEvent?.multiplier).toBe(2);
    expect(lastEvent?.points).toBe(BASE_HIT_POINTS * 2);
  });

  it("a miss pays nothing and resets streak and multiplier", () => {
    const { state: hot } = hitTimes(6);
    expect(hot.multiplier).toBe(4);
    const { state, event } = applyShot(hot, { result: "miss" }, NO_BONUS_CONTEXT);
    expect(event.points).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.multiplier).toBe(1);
    expect(state.points).toBe(hot.points);
    // Max multiplier is remembered for the summary even after the reset.
    expect(state.maxMultiplier).toBe(4);
  });

  it("scales the sink bonus by ship length and multiplier", () => {
    const { state: hot } = hitTimes(2); // next hit lands at streak 3 => x2
    const { event } = applyShot(
      hot,
      {
        result: "sunk",
        sunkShip: "carrier",
        sunkShipCells: [],
      },
      NO_BONUS_CONTEXT,
    );
    const expectedSink = SINK_BONUS_BY_LENGTH[5]! * 2;
    expect(event.bonuses).toContainEqual({ bonus: "sink", points: expectedSink });
    expect(event.points).toBe(BASE_HIT_POINTS * 2 + expectedSink);
  });

  it("awards first blood exactly when the context says so", () => {
    const { event } = applyShot(
      initialScoreState(),
      { result: "hit" },
      { firstHitOfMatch: true, priorTargets: [] },
    );
    expect(event.bonuses).toContainEqual({
      bonus: "first-blood",
      points: FIRST_BLOOD_BONUS,
    });
  });

  it("doubles the sink bonus on a perfect kill", () => {
    const cells: Coordinate[] = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ];
    const { event } = applyShot(
      hitTimes(1).state,
      { result: "sunk", sunkShip: "destroyer", sunkShipCells: cells },
      { firstHitOfMatch: false, priorTargets: [cells[0]!] },
    );
    const sink = SINK_BONUS_BY_LENGTH[2]!;
    expect(event.bonuses).toContainEqual({ bonus: "sink", points: sink });
    expect(event.bonuses).toContainEqual({ bonus: "perfect-kill", points: sink });
  });
});

describe("isPerfectKill", () => {
  const cells: Coordinate[] = [
    { col: 3, row: 4 },
    { col: 4, row: 4 },
    { col: 5, row: 4 },
  ];

  it("is true when the preceding shots all landed on the sunk ship", () => {
    expect(
      isPerfectKill(
        [{ col: 9, row: 9 }, cells[0]!, cells[1]!],
        "cruiser",
        cells,
      ),
    ).toBe(true);
  });

  it("is false when another target interrupted the run", () => {
    expect(
      isPerfectKill([cells[0]!, { col: 9, row: 9 }, cells[1]!], "cruiser", cells),
    ).toBe(false);
  });
});

describe("finalizeScore", () => {
  const shots: ScoredShot[] = [
    { result: "hit" },
    { result: "miss" },
    { result: "sunk", sunkShip: "destroyer" },
    { result: "miss" },
  ];
  const state: ScoreState = {
    points: 1234,
    streak: 0,
    multiplier: 1,
    maxMultiplier: 4,
  };

  it("adds accuracy, victory, and flawless bonuses", () => {
    const summary = finalizeScore(state, shots, { won: true, flawless: true });
    expect(summary.accuracy).toBe(50);
    expect(summary.accuracyBonus).toBe(500);
    expect(summary.victoryBonus).toBe(VICTORY_BONUS);
    expect(summary.flawlessBonus).toBe(FLAWLESS_BONUS);
    expect(summary.total).toBe(1234 + 500 + VICTORY_BONUS + FLAWLESS_BONUS);
    expect(summary.shipsSunk).toBe(1);
    expect(summary.maxMultiplier).toBe(4);
  });

  it("gives losers their accuracy bonus but nothing else", () => {
    const summary = finalizeScore(state, shots, { won: false, flawless: false });
    expect(summary.victoryBonus).toBe(0);
    expect(summary.flawlessBonus).toBe(0);
    expect(summary.total).toBe(1234 + 500);
  });

  it("handles a zero-shot game without dividing by zero", () => {
    const summary = finalizeScore(initialScoreState(), [], {
      won: true,
      flawless: false,
    });
    expect(summary.accuracy).toBe(0);
    expect(summary.total).toBe(VICTORY_BONUS);
  });
});
