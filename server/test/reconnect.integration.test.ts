// Phase 2 exit criterion, part 2: refresh-proof reconnect proven with
// headless clients against a server running a ~200ms disconnect grace.
// Mid-battle resume from one snapshot, forfeit on grace expiry, the
// stale-timer guard (reconnect must cancel the pending forfeit), and
// last-connect-wins on a same-session double connect.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoomSnapshot } from "@steel-horizon/shared";
import {
  sleep,
  startBattle,
  startTestServer,
  waitFor,
  waitForDisconnect,
  type TestServer,
} from "./helpers.js";

const GRACE_MS = 200;

let server: TestServer;

beforeAll(async () => {
  // rng () => 0: the room creator always fires first (deterministic).
  server = await startTestServer({ rng: () => 0, graceMs: GRACE_MS });
});

afterAll(async () => {
  await server.close();
});

/** Connected-flag-agnostic view for pre/post reconnect deep equality. */
function normalizeConnected(snap: RoomSnapshot): RoomSnapshot {
  return {
    ...snap,
    you: { ...snap.you, connected: true },
    opponent:
      snap.opponent === null ? null : { ...snap.opponent, connected: true },
  };
}

describe("reconnect and resilience", () => {
  it("resumes a mid-battle refresh from one snapshot within grace", async () => {
    const { a, b, bSession, snapA } = await startBattle(server);
    expect(snapA.currentTurn).toBe("you"); // Alice first

    // Play a few turns of known misses so it is Bob's turn afterwards.
    let pa = waitFor(a, "roomState");
    let pb = waitFor(b, "roomState");
    a.emit("fire", { target: { col: 9, row: 9 } }); // miss on Bob
    await Promise.all([pa, pb]);

    pa = waitFor(a, "roomState");
    pb = waitFor(b, "roomState");
    b.emit("fire", { target: { col: 9, row: 9 } }); // miss on Alice
    await Promise.all([pa, pb]);

    pa = waitFor(a, "roomState");
    pb = waitFor(b, "roomState");
    a.emit("fire", { target: { col: 9, row: 8 } }); // miss on Bob
    const [, { snapshot: bLast }] = await Promise.all([pa, pb]);
    expect(bLast.currentTurn).toBe("you"); // Bob's turn at disconnect time

    // Refresh: Bob's tab dies; Alice's snapshot flips opponent.connected.
    const aNoticeP = waitFor(a, "roomState");
    b.disconnect();
    const aNotice = (await aNoticeP).snapshot;
    expect(aNotice.opponent?.connected).toBe(false);
    expect(aNotice.winner).toBeNull();

    // A brand-new socket resumes with Bob's sessionId within grace.
    const b2 = server.open({ sessionId: bSession });
    const sessP = waitFor(b2, "session");
    const resumeP = waitFor(b2, "roomState");
    const aFlipP = waitFor(a, "roomState");
    expect((await sessP).sessionId).toBe(bSession);

    const resumed = (await resumeP).snapshot;
    // The resume snapshot IS the pre-disconnect state (modulo connected
    // flags) — no placement leak, own fleet and histories intact.
    expect(normalizeConnected(resumed)).toEqual(normalizeConnected(bLast));
    expect(resumed.revealedOpponentFleet).toBeNull();
    expect(resumed.currentTurn).toBe("you");
    expect(resumed.you.connected).toBe(true);

    const aFlip = (await aFlipP).snapshot;
    expect(aFlip.opponent?.connected).toBe(true);

    // Bob can immediately fire on the resumed socket.
    pa = waitFor(a, "roomState");
    const pb2 = waitFor(b2, "roomState");
    b2.emit("fire", { target: { col: 8, row: 9 } }); // miss on Alice
    const [{ snapshot: aAfter }, { snapshot: bAfter }] = await Promise.all([
      pa,
      pb2,
    ]);
    expect(bAfter.yourShots).toHaveLength(2);
    expect(bAfter.currentTurn).toBe("opponent");
    expect(aAfter.currentTurn).toBe("you");
  });

  it("forfeits to the opponent when grace expires", async () => {
    const { a: carol, b: dave } = await startBattle(server, "Carol", "Dave");

    const noticeP = waitFor(carol, "roomState");
    dave.disconnect();
    const notice = (await noticeP).snapshot;
    expect(notice.opponent?.connected).toBe(false);
    expect(notice.phase).toBe("battle");

    // The NEXT snapshot arrives when the grace timer fires the forfeit.
    const forfeitP = waitFor(carol, "roomState");
    const forfeited = (await forfeitP).snapshot;
    expect(forfeited.phase).toBe("gameover");
    expect(forfeited.winner).toBe("you");
    expect(forfeited.winReason).toBe("forfeit");
  });

  it("does not forfeit after a quick reconnect (stale-timer guard)", async () => {
    const { a: erin, b: frank, bSession } = await startBattle(
      server,
      "Erin",
      "Frank",
    );

    // Disconnect and reconnect Frank well inside the grace window.
    const noticeP = waitFor(erin, "roomState");
    frank.disconnect();
    await noticeP;

    const frank2 = server.open({ sessionId: bSession });
    const resumeP = waitFor(frank2, "roomState");
    const flipP = waitFor(erin, "roomState");
    await Promise.all([resumeP, flipP]);

    // Wait well past the grace window: a stale timer would forfeit now.
    await sleep(GRACE_MS * 3);

    // Game is still live: Erin (turn holder) fires and play continues.
    const pe = waitFor(erin, "roomState");
    const pf = waitFor(frank2, "roomState");
    erin.emit("fire", { target: { col: 9, row: 9 } }); // miss on Frank
    const [{ snapshot: erinSnap }, { snapshot: frankSnap }] =
      await Promise.all([pe, pf]);
    expect(erinSnap.phase).toBe("battle");
    expect(erinSnap.winner).toBeNull();
    expect(frankSnap.winner).toBeNull();
    expect(frankSnap.currentTurn).toBe("you");
  });

  it("hands the room to the newest socket on a same-session double connect", async () => {
    const { a: gina, b: hank, bSession, snapB } = await startBattle(
      server,
      "Gina",
      "Hank",
    );
    expect(snapB.currentTurn).toBe("opponent"); // Gina (creator) first

    // Second socket with Hank's sessionId while the first is still open.
    const droppedP = waitForDisconnect(hank);
    const hank2 = server.open({ sessionId: bSession });
    const sessP = waitFor(hank2, "session");
    const snapP = waitFor(hank2, "roomState");

    expect((await sessP).sessionId).toBe(bSession);
    const takeover = (await snapP).snapshot;
    expect(normalizeConnected(takeover)).toEqual(normalizeConnected(snapB));

    // The old socket was dropped by the server.
    expect(await droppedP).toBe("io server disconnect");

    // The new socket can play: Gina fires, then Hank answers on hank2.
    let pg = waitFor(gina, "roomState");
    let ph = waitFor(hank2, "roomState");
    gina.emit("fire", { target: { col: 9, row: 9 } }); // miss on Hank
    const [, { snapshot: hankTurn }] = await Promise.all([pg, ph]);
    expect(hankTurn.currentTurn).toBe("you");

    const shotP = waitFor(hank2, "shotResult");
    pg = waitFor(gina, "roomState");
    ph = waitFor(hank2, "roomState");
    hank2.emit("fire", { target: { col: 9, row: 9 } }); // miss on Gina
    expect((await shotP).result).toBe("miss");
    const [{ snapshot: ginaAfter }] = await Promise.all([pg, ph]);
    expect(ginaAfter.shotsAgainstYou).toHaveLength(1);
    expect(ginaAfter.winner).toBeNull();
  });
});
