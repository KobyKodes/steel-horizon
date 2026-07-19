// Phase 2 exit criterion, part 1: headless clients play a COMPLETE game to
// victory against the real server, driven purely by snapshots — win with
// post-game fleet reveal, rematch into a live fresh game, and a hostile-
// input barrage that cannot corrupt state. rng () => 0 makes the coin flip
// deterministic (room creator fires first).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FLEET_A,
  FLEET_B,
  playToVictory,
  startBattle,
  startTestServer,
  waitFor,
  waitUntil,
  type TestClient,
  type TestServer,
} from "./helpers.js";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer({ rng: () => 0 });
});

afterAll(async () => {
  await server.close();
});

describe("full game over sockets", () => {
  // Shared across the first two tests: the rematch continues the same room.
  let alice: TestClient;
  let bob: TestClient;

  it("plays a scripted game to victory with winner mapping and fleet reveal", async () => {
    // Accounts are how scores reach the durable leaderboard now: sign both
    // players up over the REST API and connect their sockets with the
    // minted bearer tokens.
    async function signUp(username: string): Promise<string> {
      const response = await fetch(`${server.baseUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "s3cret-pass" }),
      });
      expect(response.ok).toBe(true);
      const body = (await response.json()) as { token: string };
      return body.token;
    }
    const [tokenA, tokenB] = await Promise.all([
      signUp("Alice"),
      signUp("Bob"),
    ]);

    const setup = await startBattle(server, "Alice", "Bob", tokenA, tokenB);
    alice = setup.a;
    bob = setup.b;

    const { snapA, snapB } = await playToVictory(
      alice,
      bob,
      setup.snapA,
      setup.snapB,
    );

    // Exactly one winner, each side viewer-relative.
    expect([snapA.winner, snapB.winner].sort()).toEqual(["opponent", "you"]);
    expect(snapA.phase).toBe("gameover");
    expect(snapB.phase).toBe("gameover");
    expect(snapA.winReason).toBe("all-ships-sunk");
    expect(snapB.winReason).toBe("all-ships-sunk");

    // Post-game reveal: BOTH sides now see the opponent's true placement.
    expect(snapA.revealedOpponentFleet).toEqual(FLEET_B);
    expect(snapB.revealedOpponentFleet).toEqual(FLEET_A);

    // With the row-major firing script, Bob's targets (Alice's fleet in
    // rows 0-4) come up first — Bob wins.
    expect(snapB.winner).toBe("you");
    expect(snapA.winner).toBe("opponent");

    // Arcade scoring: gameover snapshots carry both final breakdowns and
    // the freshly-submitted global leaderboard (both players placed on the
    // test server's empty in-memory board).
    for (const snap of [snapA, snapB]) {
      expect(snap.finalScores).not.toBeNull();
      expect(snap.leaderboard).toHaveLength(2);
      expect(snap.yourLeaderboardRank).not.toBeNull();
    }
    const winnerFinal = snapB.finalScores!.you;
    expect(winnerFinal.victoryBonus).toBe(500);
    expect(winnerFinal.shipsSunk).toBe(5);
    expect(winnerFinal.total).toBe(
      winnerFinal.battlePoints +
        winnerFinal.victoryBonus +
        winnerFinal.accuracyBonus +
        winnerFinal.flawlessBonus,
    );
    // The winner's total dwarfs the loser's; they top the 2-entry board.
    expect(snapB.yourLeaderboardRank).toBe(0);
    expect(snapB.leaderboard![0]!.score).toBe(winnerFinal.total);

    // Weekly board mirrors the all-time one for a fresh store, medals are
    // present, and the rematch win streak starts counting.
    expect(snapB.weeklyLeaderboard).toHaveLength(2);
    expect(snapB.yourWeeklyRank).toBe(0);

    // The public HTTP read (landing-page leaderboards) serves the same
    // boards without any room membership.
    const response = await fetch(`${server.baseUrl}/leaderboard`);
    expect(response.ok).toBe(true);
    const boards = (await response.json()) as {
      allTime: unknown[];
      weekly: unknown[];
    };
    expect(boards.allTime).toHaveLength(2);
    expect(boards.weekly).toHaveLength(2);

    // Durable player stats: the winner's profile shows the recorded game.
    const profileResponse = await fetch(`${server.baseUrl}/players/bob/stats`);
    expect(profileResponse.ok).toBe(true);
    const profile = (await profileResponse.json()) as {
      username: string;
      stats: { gamesPlayed: number; gamesWon: number; bestScore: number };
      recentGames: { won: boolean; mode: string }[];
    };
    expect(profile.username).toBe("Bob");
    expect(profile.stats.gamesPlayed).toBe(1);
    expect(profile.stats.gamesWon).toBe(1);
    expect(profile.stats.bestScore).toBe(winnerFinal.total);
    expect(profile.recentGames).toEqual([
      expect.objectContaining({ won: true, mode: "pvp" }),
    ]);
    expect(Array.isArray(winnerFinal.medals)).toBe(true);
    expect(snapB.winStreak).toEqual({ you: 1, opponent: 0 });
    expect(snapA.winStreak).toEqual({ you: 0, opponent: 1 });
  });

  it("rematches into a clean placement phase and the reset game is live", async () => {
    // First request: recorded, still gameover.
    let pa = waitFor(alice, "roomState");
    let pb = waitFor(bob, "roomState");
    alice.emit("requestRematch");
    const [afterFirstA, afterFirstB] = await Promise.all([pa, pb]);
    expect(afterFirstA.snapshot.rematch.youRequested).toBe(true);
    expect(afterFirstB.snapshot.rematch.opponentRequested).toBe(true);
    expect(afterFirstA.snapshot.phase).toBe("gameover");

    // Second request: fresh game, clean placement snapshots.
    pa = waitFor(alice, "roomState");
    pb = waitFor(bob, "roomState");
    bob.emit("requestRematch");
    const [{ snapshot: freshA }, { snapshot: freshB }] = await Promise.all([
      pa,
      pb,
    ]);
    for (const snap of [freshA, freshB]) {
      expect(snap.phase).toBe("placement");
      expect(snap.yourShots).toEqual([]);
      expect(snap.shotsAgainstYou).toEqual([]);
      expect(snap.you.fleet).toBeNull();
      expect(snap.winner).toBeNull();
      expect(snap.winReason).toBeNull();
      expect(snap.revealedOpponentFleet).toBeNull();
      expect(snap.rematch).toEqual({
        youRequested: false,
        opponentRequested: false,
      });
      // Scores reset with the fresh game; leaderboard hides until gameover.
      expect(snap.scores).toEqual({
        you: { points: 0, streak: 0, multiplier: 1, maxMultiplier: 1 },
        opponent: { points: 0, streak: 0, multiplier: 1, maxMultiplier: 1 },
      });
      expect(snap.finalScores).toBeNull();
      expect(snap.leaderboard).toBeNull();
    }

    // Place again and play a few turns to prove the reset game is live.
    pa = waitFor(alice, "roomState");
    pb = waitFor(bob, "roomState");
    alice.emit("placeFleet", { fleet: FLEET_A });
    await Promise.all([pa, pb]);

    pa = waitFor(alice, "roomState");
    pb = waitFor(bob, "roomState");
    bob.emit("placeFleet", { fleet: FLEET_B });
    const [{ snapshot: battleA }] = await Promise.all([pa, pb]);
    expect(battleA.phase).toBe("battle");
    expect(battleA.currentTurn).toBe("you"); // rng () => 0: creator first

    // Alice misses at (0,9); Bob hits Alice's carrier at (0,0).
    pa = waitFor(alice, "roomState");
    pb = waitFor(bob, "roomState");
    alice.emit("fire", { target: { col: 0, row: 9 } });
    await Promise.all([pa, pb]);

    const bobShot = waitFor(bob, "shotResult");
    pa = waitFor(alice, "roomState");
    pb = waitFor(bob, "roomState");
    bob.emit("fire", { target: { col: 0, row: 0 } });
    expect((await bobShot).result).toBe("hit");
    const [{ snapshot: afterA }, { snapshot: afterB }] = await Promise.all([
      pa,
      pb,
    ]);
    expect(afterA.currentTurn).toBe("you");
    expect(afterA.shotsAgainstYou).toHaveLength(1);
    expect(afterB.yourShots).toEqual([
      {
        target: { col: 0, row: 0 },
        result: "hit",
        // First non-miss of the rematch game, fired within the quick-draw
        // window: base 100 + first blood 150 + quick draw 50.
        score: {
          points: 300,
          streak: 1,
          multiplier: 1,
          total: 300,
          bonuses: [
            { bonus: "first-blood", points: 150 },
            { bonus: "quick-draw", points: 50 },
          ],
        },
      },
    ]);
  });

  it("rejects hostile input in every phase without corrupting state", async () => {
    const { socket: carol } = await server.connect({ name: "Carol" });
    const { socket: dave } = await server.connect({ name: "Dave" });

    // Lobby: create + join.
    const created = waitFor(carol, "roomState");
    carol.emit("createRoom", { name: "Carol" });
    const code = (await created).snapshot.code;

    let pc = waitFor(carol, "roomState");
    let pd = waitFor(dave, "roomState");
    dave.emit("joinRoom", { name: "Dave", code });
    await Promise.all([pc, pd]);

    // 1. fire before battle → WRONG_PHASE.
    let errP = waitFor(carol, "errorEvent");
    carol.emit("fire", { target: { col: 0, row: 0 } });
    expect((await errP).code).toBe("WRONG_PHASE");

    // Ready up into placement.
    pc = waitFor(carol, "roomState");
    pd = waitFor(dave, "roomState");
    carol.emit("setReady", { ready: true });
    await Promise.all([pc, pd]);
    pc = waitFor(carol, "roomState");
    pd = waitFor(dave, "roomState");
    dave.emit("setReady", { ready: true });
    await Promise.all([pc, pd]);

    // 2. placeFleet with only 4 ships → INVALID_PLACEMENT.
    errP = waitFor(carol, "errorEvent");
    carol.emit("placeFleet", {
      fleet: FLEET_A.slice(0, 4) as typeof FLEET_A,
    });
    expect((await errP).code).toBe("INVALID_PLACEMENT");

    // Legal placements → battle, Carol (creator) fires first.
    pc = waitFor(carol, "roomState");
    pd = waitFor(dave, "roomState");
    carol.emit("placeFleet", { fleet: FLEET_A });
    await Promise.all([pc, pd]);
    pc = waitFor(carol, "roomState");
    pd = waitFor(dave, "roomState");
    dave.emit("placeFleet", { fleet: FLEET_B });
    const [{ snapshot: battleC }] = await Promise.all([pc, pd]);
    expect(battleC.phase).toBe("battle");
    expect(battleC.currentTurn).toBe("you");

    // 3. fire out of bounds → OUT_OF_BOUNDS (turn unspent).
    errP = waitFor(carol, "errorEvent");
    carol.emit("fire", { target: { col: 10, row: 0 } });
    expect((await errP).code).toBe("OUT_OF_BOUNDS");

    // 4. setReady while in battle → WRONG_PHASE.
    errP = waitFor(carol, "errorEvent");
    carol.emit("setReady", { ready: true });
    expect((await errP).code).toBe("WRONG_PHASE");

    // 5. Burst of 20 rapid duplicate fire emits: exactly one accepted.
    const errors: { code: string }[] = [];
    carol.on("errorEvent", (e) => errors.push(e));
    const shotP = waitFor(carol, "shotResult");
    pc = waitFor(carol, "roomState");
    pd = waitFor(dave, "roomState");
    for (let i = 0; i < 20; i++) {
      carol.emit("fire", { target: { col: 0, row: 9 } }); // a known miss
    }
    expect((await shotP).result).toBe("miss");
    await Promise.all([pc, pd]);
    await waitUntil(() => errors.length >= 19);
    expect(errors).toHaveLength(19);
    for (const err of errors) {
      expect(["CELL_ALREADY_SHOT", "NOT_YOUR_TURN"]).toContain(err.code);
    }
    carol.off("errorEvent");

    // State consistent afterward: assert via the NEXT snapshot exchange.
    pc = waitFor(carol, "roomState");
    pd = waitFor(dave, "roomState");
    dave.emit("fire", { target: { col: 9, row: 0 } }); // miss on Carol
    const [{ snapshot: finalC }, { snapshot: finalD }] = await Promise.all([
      pc,
      pd,
    ]);
    expect(finalC.yourShots).toEqual([
      {
        target: { col: 0, row: 9 },
        result: "miss",
        score: { points: 0, streak: 0, multiplier: 1, total: 0, bonuses: [] },
      },
    ]);
    expect(finalC.shotsAgainstYou).toHaveLength(1);
    expect(finalC.currentTurn).toBe("you");
    expect(finalD.yourShots).toHaveLength(1);
    expect(finalC.phase).toBe("battle");
    expect(finalC.winner).toBeNull();
  });
});
