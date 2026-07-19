import { describe, expect, it } from "vitest";
import type { Coordinate } from "./board.js";
import {
  applyShot,
  BASE_HIT_POINTS,
  CALLED_SHOT_PENALTY,
  COMEBACK_BONUS,
  finalizeScore,
  FIRST_BLOOD_BONUS,
  FLAWLESS_BONUS,
  initialScoreState,
  isPerfectKill,
  multiplierForStreak,
  QUICK_DRAW_BONUS,
  rankForScore,
  SINK_BONUS_BY_LENGTH,
  VICTORY_BONUS,
  type FinalShot,
  type ScoredShot,
  type ScoreState,
} from "./scoring.js";

const NO_BONUS_CONTEXT = {
  firstHitOfMatch: false,
  priorTargets: [],
  quickDraw: false,
  calledShot: false,
  comeback: false,
};

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
      { ...NO_BONUS_CONTEXT, firstHitOfMatch: true },
    );
    expect(event.bonuses).toContainEqual({
      bonus: "first-blood",
      points: FIRST_BLOOD_BONUS,
    });
  });

  it("awards quick draw on hits fired inside the window", () => {
    const { event } = applyShot(
      initialScoreState(),
      { result: "hit" },
      { ...NO_BONUS_CONTEXT, quickDraw: true },
    );
    expect(event.bonuses).toContainEqual({
      bonus: "quick-draw",
      points: QUICK_DRAW_BONUS,
    });
    expect(event.points).toBe(BASE_HIT_POINTS + QUICK_DRAW_BONUS);
  });

  it("pays the comeback bonus only on a sink", () => {
    const hit = applyShot(
      initialScoreState(),
      { result: "hit" },
      { ...NO_BONUS_CONTEXT, comeback: true },
    );
    expect(hit.event.bonuses).toEqual([]);

    const sunk = applyShot(
      initialScoreState(),
      { result: "sunk", sunkShip: "destroyer", sunkShipCells: [] },
      { ...NO_BONUS_CONTEXT, comeback: true },
    );
    expect(sunk.event.bonuses).toContainEqual({
      bonus: "comeback",
      points: COMEBACK_BONUS,
    });
  });

  it("doubles the whole shot on a called hit", () => {
    const { event } = applyShot(
      initialScoreState(),
      { result: "hit" },
      { ...NO_BONUS_CONTEXT, calledShot: true },
    );
    expect(event.bonuses).toContainEqual({
      bonus: "called-shot",
      points: BASE_HIT_POINTS,
    });
    expect(event.points).toBe(BASE_HIT_POINTS * 2);
  });

  it("a called miss costs the penalty on top of the chain reset", () => {
    const banked: ScoreState = {
      points: 1000,
      streak: 4,
      multiplier: 2,
      maxMultiplier: 2,
    };
    const { state, event } = applyShot(
      banked,
      { result: "miss" },
      { ...NO_BONUS_CONTEXT, calledShot: true },
    );
    expect(event.points).toBe(-CALLED_SHOT_PENALTY);
    expect(state.points).toBe(1000 - CALLED_SHOT_PENALTY);
    expect(state.streak).toBe(0);
  });

  it("a called miss never drives banked points below zero", () => {
    const { state } = applyShot(
      { points: 50, streak: 0, multiplier: 1, maxMultiplier: 1 },
      { result: "miss" },
      { ...NO_BONUS_CONTEXT, calledShot: true },
    );
    expect(state.points).toBe(0);
  });

  it("doubles the sink bonus on a perfect kill", () => {
    const cells: Coordinate[] = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ];
    const { event } = applyShot(
      hitTimes(1).state,
      { result: "sunk", sunkShip: "destroyer", sunkShipCells: cells },
      { ...NO_BONUS_CONTEXT, priorTargets: [cells[0]!] },
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
    expect(summary.medals).toEqual([]);
  });

  it("awards medals from the recorded shot bonuses", () => {
    const perfectKill: FinalShot = {
      result: "sunk",
      sunkShip: "destroyer",
      score: {
        points: 0,
        streak: 1,
        multiplier: 1,
        total: 0,
        bonuses: [
          { bonus: "sink", points: 250 },
          { bonus: "perfect-kill", points: 250 },
        ],
      },
    };
    const firstBlood: FinalShot = {
      result: "hit",
      score: {
        points: 0,
        streak: 1,
        multiplier: 1,
        total: 0,
        bonuses: [{ bonus: "first-blood", points: 150 }],
      },
    };
    // 10 shots, all hits (100% accuracy), 3 perfect kills, first blood,
    // max multiplier at the critical tier, flawless win: every medal.
    const shotList: FinalShot[] = [
      firstBlood,
      perfectKill,
      perfectKill,
      perfectKill,
      ...Array.from({ length: 6 }, (): FinalShot => ({ result: "hit" })),
    ];
    const summary = finalizeScore(
      { points: 5000, streak: 10, multiplier: 8, maxMultiplier: 8 },
      shotList,
      { won: true, flawless: true },
    );
    expect(summary.medals).toEqual([
      "sharpshooter",
      "executioner",
      "untouchable",
      "first-strike",
      "chain-master",
    ]);
  });
});

describe("rankForScore", () => {
  it("maps totals to the highest rung reached", () => {
    expect(rankForScore(0)).toBe("Deck Swabber");
    expect(rankForScore(3999)).toBe("Deck Swabber");
    expect(rankForScore(4000)).toBe("Ensign");
    expect(rankForScore(23000)).toBe("Captain");
    expect(rankForScore(99999)).toBe("Fleet Admiral");
  });
});
