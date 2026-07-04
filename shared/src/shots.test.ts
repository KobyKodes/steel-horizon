import { describe, expect, it } from "vitest";
import type { Coordinate } from "./board.js";
import { cellsForPlacement, type FleetPlacement } from "./fleet.js";
import { isFleetDestroyed, resolveShot } from "./shots.js";

// Shared fixture: one known valid fleet, all horizontal on even rows.
//   carrier    A1–E1  (row 0, cols 0–4)
//   battleship A3–D3  (row 2, cols 0–3)
//   cruiser    A5–C5  (row 4, cols 0–2)
//   submarine  A7–C7  (row 6, cols 0–2)
//   destroyer  A9–B9  (row 8, cols 0–1)
const fleet: FleetPlacement = [
  { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" },
  { ship: "battleship", origin: { col: 0, row: 2 }, orientation: "horizontal" },
  { ship: "cruiser", origin: { col: 0, row: 4 }, orientation: "horizontal" },
  { ship: "submarine", origin: { col: 0, row: 6 }, orientation: "horizontal" },
  { ship: "destroyer", origin: { col: 0, row: 8 }, orientation: "horizontal" },
];

const allShipCells: Coordinate[] = fleet.flatMap(cellsForPlacement);

describe("resolveShot", () => {
  it("reports a miss on open water", () => {
    expect(resolveShot(fleet, [], { col: 9, row: 9 })).toEqual({
      ok: true,
      result: "miss",
    });
  });

  it("reports a hit naming the ship when other cells are intact", () => {
    expect(resolveShot(fleet, [], { col: 2, row: 0 })).toEqual({
      ok: true,
      result: "hit",
      ship: "carrier",
    });
  });

  it("reports sunk (not hit) on the shot completing a ship", () => {
    const priorHits: Coordinate[] = [
      { col: 0, row: 4 },
      { col: 1, row: 4 },
    ];
    expect(resolveShot(fleet, priorHits, { col: 2, row: 4 })).toEqual({
      ok: true,
      result: "sunk",
      ship: "cruiser",
      cells: [
        { col: 0, row: 4 },
        { col: 1, row: 4 },
        { col: 2, row: 4 },
      ],
    });
  });

  it("sinks the destroyer on its second cell after one prior hit", () => {
    expect(
      resolveShot(fleet, [{ col: 0, row: 8 }], { col: 1, row: 8 }),
    ).toEqual({
      ok: true,
      result: "sunk",
      ship: "destroyer",
      cells: [
        { col: 0, row: 8 },
        { col: 1, row: 8 },
      ],
    });
  });

  it("reports only the sunk ship's own cells when an adjacent ship touches it (legal layout)", () => {
    // battleship (A3-D3) and cruiser (A5-C5) don't touch in `fleet`, so
    // build a fleet where a ship's sinking cell is orthogonally adjacent to
    // another ship's cells — the touching cells must never bleed into the
    // reported `cells` for either ship.
    const touchingFleet: FleetPlacement = [
      {
        ship: "cruiser",
        origin: { col: 1, row: 1 },
        orientation: "vertical",
      }, // B2-B4
      {
        ship: "submarine",
        origin: { col: 1, row: 4 },
        orientation: "horizontal",
      }, // B5-D5 (touches the cruiser at B4/B5)
    ];
    const priorHits: Coordinate[] = [
      { col: 1, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 4 },
      { col: 2, row: 4 },
      { col: 3, row: 4 },
    ];
    expect(
      resolveShot(touchingFleet, priorHits, { col: 1, row: 3 }),
    ).toEqual({
      ok: true,
      result: "sunk",
      ship: "cruiser",
      cells: [
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 1, row: 3 },
      ],
    });
  });

  it("rejects a repeat of a previous hit with CELL_ALREADY_SHOT", () => {
    expect(
      resolveShot(fleet, [{ col: 0, row: 0 }], { col: 0, row: 0 }),
    ).toEqual({ ok: false, error: "CELL_ALREADY_SHOT" });
  });

  it("rejects a repeat of a previous miss with CELL_ALREADY_SHOT", () => {
    expect(
      resolveShot(fleet, [{ col: 9, row: 9 }], { col: 9, row: 9 }),
    ).toEqual({ ok: false, error: "CELL_ALREADY_SHOT" });
  });

  it("rejects out-of-bounds targets (col 10, row -1)", () => {
    expect(resolveShot(fleet, [], { col: 10, row: 0 })).toEqual({
      ok: false,
      error: "OUT_OF_BOUNDS",
    });
    expect(resolveShot(fleet, [], { col: 0, row: -1 })).toEqual({
      ok: false,
      error: "OUT_OF_BOUNDS",
    });
  });

  it("expects the target NOT to be in previousShots yet (caller appends after)", () => {
    // Contract: previousShots is the history BEFORE this shot. Resolving the
    // same fresh target twice against identical history is a plain hit both
    // times — no phantom CELL_ALREADY_SHOT from the shot being resolved.
    const target: Coordinate = { col: 4, row: 0 };
    const first = resolveShot(fleet, [], target);
    const second = resolveShot(fleet, [], target);
    expect(first).toEqual({ ok: true, result: "hit", ship: "carrier" });
    expect(second).toEqual(first);
  });
});

describe("isFleetDestroyed", () => {
  it("returns true when all 17 ship cells are shot, with misses interleaved", () => {
    const shots: Coordinate[] = allShipCells.flatMap((cell, i) => [
      cell,
      { col: 9, row: i % 10 },
    ]);
    expect(isFleetDestroyed(fleet, shots)).toBe(true);
  });

  it("returns false with 16 of 17 ship cells shot", () => {
    expect(isFleetDestroyed(fleet, allShipCells.slice(0, 16))).toBe(false);
  });

  it("returns false for an empty shot list", () => {
    expect(isFleetDestroyed(fleet, [])).toBe(false);
  });

  it("is idempotent w.r.t. duplicate shots and extra misses", () => {
    const shots: Coordinate[] = [
      ...allShipCells,
      ...allShipCells, // repeats of every hit
      { col: 9, row: 9 },
      { col: 9, row: 9 }, // repeated miss
    ];
    expect(isFleetDestroyed(fleet, shots)).toBe(true);
  });
});
