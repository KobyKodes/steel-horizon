// Engine unit tests — pins every game rule from PROJECT.md: simultaneous
// placement, coin-flip first turn, strict alternation, hit/miss/sunk,
// win on the 17th hit, both-must-accept rematch, forfeit, and typed
// rejections that leave state untouched.

import { describe, expect, it } from "vitest";
import {
  cellsForPlacement,
  type Coordinate,
  type FleetPlacement,
} from "@steel-horizon/shared";
import {
  createGame,
  fire,
  forfeit,
  placeFleet,
  requestRematch,
  type Game,
} from "./engine.js";

const ALICE = "session-alice";
const BOB = "session-bob";
const STRANGER = "session-stranger";

/** Legal fleet packed into rows 0–4, all horizontal from col 0. */
const FLEET_A: FleetPlacement = [
  { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 0, row: 1 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 0, row: 2 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 0, row: 3 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 0, row: 4 }, orientation: "horizontal" },
];

/** Legal fleet packed into rows 5–9, all horizontal from col 5. */
const FLEET_B: FleetPlacement = [
  { ship: "carrier", origin: { col: 5, row: 5 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 5, row: 6 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 5, row: 7 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 5, row: 8 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 5, row: 9 }, orientation: "horizontal" },
];

/** Illegal: destroyer overlaps the carrier at (0,0). */
const OVERLAPPING_FLEET: FleetPlacement = [
  ...FLEET_A.slice(0, 4),
  { ship: "destroyer", origin: { col: 0, row: 0 }, orientation: "vertical" },
];

/** All 17 cells of a fleet, in placement order. */
function allCells(fleet: FleetPlacement): Coordinate[] {
  return fleet.flatMap((placement) => cellsForPlacement(placement));
}

/** Fresh game already advanced to battle. rng () => 0 makes ALICE first. */
function makeBattle(rng: () => number = () => 0): Game {
  const game = createGame([ALICE, BOB], rng);
  expect(placeFleet(game, ALICE, FLEET_A)).toEqual({
    ok: true,
    battleStarted: false,
  });
  expect(placeFleet(game, BOB, FLEET_B)).toEqual({
    ok: true,
    battleStarted: true,
  });
  return game;
}

/** Comparable projection of a game (rng excluded, Set normalized). */
function stateOf(game: Game): unknown {
  return {
    playerIds: game.playerIds,
    players: structuredClone(game.players),
    phase: game.phase,
    currentPlayer: game.currentPlayer,
    winner: game.winner,
    winReason: game.winReason,
    rematchRequests: [...game.rematchRequests].sort(),
  };
}

describe("createGame", () => {
  it("starts in placement with empty boards and no turn", () => {
    const game = createGame([ALICE, BOB], () => 0);
    expect(game.phase).toBe("placement");
    expect(game.currentPlayer).toBeNull();
    expect(game.winner).toBeNull();
    expect(game.players[ALICE]).toEqual({ fleet: null, shots: [] });
    expect(game.players[BOB]).toEqual({ fleet: null, shots: [] });
  });
});

describe("placeFleet", () => {
  it("rejects an illegal fleet with INVALID_PLACEMENT and no state change", () => {
    const game = createGame([ALICE, BOB], () => 0);
    const before = stateOf(game);
    expect(placeFleet(game, ALICE, OVERLAPPING_FLEET)).toEqual({
      ok: false,
      code: "INVALID_PLACEMENT",
    });
    expect(stateOf(game)).toEqual(before);
  });

  it("rejects a non-participant with NOT_IN_ROOM", () => {
    const game = createGame([ALICE, BOB], () => 0);
    expect(placeFleet(game, STRANGER, FLEET_A)).toEqual({
      ok: false,
      code: "NOT_IN_ROOM",
    });
  });

  it("allows re-placing while still in the placement phase", () => {
    const game = createGame([ALICE, BOB], () => 0);
    expect(placeFleet(game, ALICE, FLEET_A).ok).toBe(true);
    expect(placeFleet(game, ALICE, FLEET_B).ok).toBe(true);
    expect(game.players[ALICE]!.fleet).toEqual(FLEET_B);
    expect(game.phase).toBe("placement");
  });

  it("flips to battle when both fleets land, rng 0 giving player 0 the turn", () => {
    const game = makeBattle(() => 0);
    expect(game.phase).toBe("battle");
    expect(game.currentPlayer).toBe(ALICE);
  });

  it("gives player 1 the first turn when rng returns >= 0.5", () => {
    const game = makeBattle(() => 0.99);
    expect(game.phase).toBe("battle");
    expect(game.currentPlayer).toBe(BOB);
  });
});

describe("fire", () => {
  it("resolves a miss and alternates the turn", () => {
    const game = makeBattle();
    const result = fire(game, ALICE, { col: 0, row: 9 });
    expect(result).toEqual({
      ok: true,
      record: { target: { col: 0, row: 9 }, result: "miss" },
      gameOver: false,
    });
    expect(game.players[ALICE]!.shots).toHaveLength(1);
    expect(game.currentPlayer).toBe(BOB);
  });

  it("resolves a hit and STILL alternates the turn (no extra turn on hit)", () => {
    const game = makeBattle();
    const result = fire(game, ALICE, { col: 5, row: 5 });
    expect(result).toEqual({
      ok: true,
      record: { target: { col: 5, row: 5 }, result: "hit" },
      gameOver: false,
    });
    expect(game.currentPlayer).toBe(BOB);
  });

  it("announces the sunk ship on its final cell", () => {
    const game = makeBattle();
    expect(fire(game, ALICE, { col: 5, row: 9 }).ok).toBe(true); // destroyer 1/2
    expect(fire(game, BOB, { col: 9, row: 9 }).ok).toBe(true); // miss
    const result = fire(game, ALICE, { col: 6, row: 9 }); // destroyer 2/2
    expect(result).toEqual({
      ok: true,
      record: {
        target: { col: 6, row: 9 },
        result: "sunk",
        sunkShip: "destroyer",
      },
      gameOver: false,
    });
    expect(game.currentPlayer).toBe(BOB);
  });

  it("rejects out-of-turn fire with NOT_YOUR_TURN and no state change", () => {
    const game = makeBattle();
    const before = stateOf(game);
    expect(fire(game, BOB, { col: 0, row: 0 })).toEqual({
      ok: false,
      code: "NOT_YOUR_TURN",
    });
    expect(stateOf(game)).toEqual(before);
  });

  it("rejects a repeat shot with CELL_ALREADY_SHOT, turn unchanged", () => {
    const game = makeBattle();
    expect(fire(game, ALICE, { col: 0, row: 9 }).ok).toBe(true);
    expect(fire(game, BOB, { col: 9, row: 9 }).ok).toBe(true);
    const before = stateOf(game);
    expect(fire(game, ALICE, { col: 0, row: 9 })).toEqual({
      ok: false,
      code: "CELL_ALREADY_SHOT",
    });
    expect(stateOf(game)).toEqual(before);
    expect(game.currentPlayer).toBe(ALICE);
  });

  it("rejects an off-board target with OUT_OF_BOUNDS and no state change", () => {
    const game = makeBattle();
    const before = stateOf(game);
    expect(fire(game, ALICE, { col: 10, row: 0 })).toEqual({
      ok: false,
      code: "OUT_OF_BOUNDS",
    });
    expect(stateOf(game)).toEqual(before);
  });

  it("rejects a non-participant with NOT_IN_ROOM", () => {
    const game = makeBattle();
    expect(fire(game, STRANGER, { col: 0, row: 0 })).toEqual({
      ok: false,
      code: "NOT_IN_ROOM",
    });
  });

  it("plays a full game to the 17th hit: gameover, winner, all-ships-sunk", () => {
    const game = makeBattle();
    const targets = allCells(FLEET_B);
    expect(targets).toHaveLength(17);

    targets.forEach((target, i) => {
      const result = fire(game, ALICE, target);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      if (i < targets.length - 1) {
        expect(result.gameOver).toBe(false);
        // Bob burns his turn on a guaranteed miss (rows 5–9 are empty of
        // FLEET_A ships); every cell distinct.
        const missTarget = { col: i % 10, row: 5 + Math.floor(i / 10) };
        expect(fire(game, BOB, missTarget)).toEqual({
          ok: true,
          record: { target: missTarget, result: "miss" },
          gameOver: false,
        });
      } else {
        expect(result.gameOver).toBe(true);
        expect(result.record.result).toBe("sunk");
      }
    });

    expect(game.phase).toBe("gameover");
    expect(game.winner).toBe(ALICE);
    expect(game.winReason).toBe("all-ships-sunk");
    expect(game.currentPlayer).toBeNull();

    // Battle is over: nobody can keep firing.
    expect(fire(game, BOB, { col: 0, row: 0 })).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
  });
});

describe("requestRematch", () => {
  function finishedGame(): Game {
    const game = makeBattle();
    expect(forfeit(game, BOB)).toEqual({ ok: true });
    return game;
  }

  it("requires BOTH players before producing a fresh game", () => {
    const game = finishedGame();
    expect(requestRematch(game, ALICE)).toEqual({ ok: true, game: null });
    expect(game.rematchRequests.has(ALICE)).toBe(true);

    const result = requestRematch(game, BOB);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game).not.toBeNull();
  });

  it("resets boards, shots, and turn in the fresh game", () => {
    const game = makeBattle();
    expect(fire(game, ALICE, { col: 5, row: 5 }).ok).toBe(true);
    expect(forfeit(game, BOB)).toEqual({ ok: true });

    expect(requestRematch(game, ALICE).ok).toBe(true);
    const result = requestRematch(game, BOB);
    expect(result.ok).toBe(true);
    if (!result.ok || result.game === null) {
      throw new Error("expected a fresh game");
    }

    const fresh = result.game;
    expect(fresh.phase).toBe("placement");
    expect(fresh.playerIds).toEqual([ALICE, BOB]);
    expect(fresh.currentPlayer).toBeNull();
    expect(fresh.winner).toBeNull();
    expect(fresh.winReason).toBeNull();
    expect(fresh.players[ALICE]).toEqual({ fleet: null, shots: [] });
    expect(fresh.players[BOB]).toEqual({ fleet: null, shots: [] });
    expect(fresh.rematchRequests.size).toBe(0);
  });

  it("is idempotent per player: repeating a request does not start the game", () => {
    const game = finishedGame();
    expect(requestRematch(game, ALICE)).toEqual({ ok: true, game: null });
    expect(requestRematch(game, ALICE)).toEqual({ ok: true, game: null });
  });

  it("rejects a non-participant with NOT_IN_ROOM", () => {
    const game = finishedGame();
    expect(requestRematch(game, STRANGER)).toEqual({
      ok: false,
      code: "NOT_IN_ROOM",
    });
  });
});

describe("forfeit", () => {
  it("hands the opponent the win with reason forfeit, from placement", () => {
    const game = createGame([ALICE, BOB], () => 0);
    expect(forfeit(game, ALICE)).toEqual({ ok: true });
    expect(game.phase).toBe("gameover");
    expect(game.winner).toBe(BOB);
    expect(game.winReason).toBe("forfeit");
    expect(game.currentPlayer).toBeNull();
  });

  it("hands the opponent the win from battle regardless of whose turn", () => {
    const game = makeBattle(); // Alice's turn
    expect(forfeit(game, ALICE)).toEqual({ ok: true });
    expect(game.winner).toBe(BOB);
    expect(game.winReason).toBe("forfeit");
  });

  it("rejects a non-participant with NOT_IN_ROOM", () => {
    const game = makeBattle();
    expect(forfeit(game, STRANGER)).toEqual({
      ok: false,
      code: "NOT_IN_ROOM",
    });
  });
});

describe("WRONG_PHASE matrix — every event in every wrong phase", () => {
  it("placement phase: fire and requestRematch rejected", () => {
    const game = createGame([ALICE, BOB], () => 0);
    const before = stateOf(game);
    expect(fire(game, ALICE, { col: 0, row: 0 })).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(requestRematch(game, ALICE)).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(stateOf(game)).toEqual(before);
  });

  it("battle phase: placeFleet and requestRematch rejected", () => {
    const game = makeBattle();
    const before = stateOf(game);
    expect(placeFleet(game, ALICE, FLEET_A)).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(requestRematch(game, ALICE)).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(stateOf(game)).toEqual(before);
  });

  it("gameover phase: placeFleet, fire, and forfeit rejected", () => {
    const game = makeBattle();
    expect(forfeit(game, BOB)).toEqual({ ok: true });
    const before = stateOf(game);
    expect(placeFleet(game, ALICE, FLEET_A)).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(fire(game, ALICE, { col: 0, row: 0 })).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(forfeit(game, ALICE)).toEqual({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(stateOf(game)).toEqual(before);
  });
});
