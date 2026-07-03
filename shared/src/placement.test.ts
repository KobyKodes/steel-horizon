import { describe, expect, it } from "vitest";
import type { FleetPlacement } from "./fleet.js";
import { generateRandomFleet, validateFleetPlacement } from "./placement.js";

/** All 5 ships, in bounds, disjoint, none touching. */
function knownGoodFleet(): FleetPlacement {
  return [
    { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" }, // A1–E1
    { ship: "battleship", origin: { col: 0, row: 2 }, orientation: "horizontal" }, // A3–D3
    { ship: "cruiser", origin: { col: 0, row: 4 }, orientation: "horizontal" }, // A5–C5
    { ship: "submarine", origin: { col: 0, row: 6 }, orientation: "horizontal" }, // A7–C7
    { ship: "destroyer", origin: { col: 0, row: 8 }, orientation: "horizontal" }, // A9–B9
  ];
}

describe("validateFleetPlacement", () => {
  it("accepts a known-good fleet (all 5 ships, in bounds, disjoint)", () => {
    expect(validateFleetPlacement(knownGoodFleet())).toEqual({ valid: true });
  });

  it("accepts ships touching side-by-side (classic rules: touching allowed)", () => {
    // Ships packed into adjacent rows with no shared cell. This test exists
    // to prevent someone "helpfully" adding a no-touch rule later.
    const fleet: FleetPlacement = [
      { ship: "carrier", origin: { col: 0, row: 0 }, orientation: "horizontal" }, // A1–E1
      { ship: "battleship", origin: { col: 0, row: 1 }, orientation: "horizontal" }, // A2–D2
      { ship: "cruiser", origin: { col: 0, row: 2 }, orientation: "horizontal" }, // A3–C3
      { ship: "submarine", origin: { col: 5, row: 0 }, orientation: "horizontal" }, // F1–H1, touches carrier end
      { ship: "destroyer", origin: { col: 4, row: 1 }, orientation: "horizontal" }, // E2–F2, touches battleship
    ];
    expect(validateFleetPlacement(fleet)).toEqual({ valid: true });
  });

  it("rejects a horizontal carrier at G1 (runs off column J) as OUT_OF_BOUNDS", () => {
    const fleet = knownGoodFleet();
    fleet[0] = {
      ship: "carrier",
      origin: { col: 6, row: 0 }, // G1: cells G1–K1, off the board
      orientation: "horizontal",
    };
    expect(validateFleetPlacement(fleet)).toEqual({
      valid: false,
      reason: "OUT_OF_BOUNDS",
    });
  });

  it("rejects a vertical destroyer at row 10 (runs off bottom) as OUT_OF_BOUNDS", () => {
    const fleet = knownGoodFleet();
    fleet[4] = {
      ship: "destroyer",
      origin: { col: 9, row: 9 }, // J10: second cell would be row 11
      orientation: "vertical",
    };
    expect(validateFleetPlacement(fleet)).toEqual({
      valid: false,
      reason: "OUT_OF_BOUNDS",
    });
  });

  it("rejects an origin that is itself off-board as OUT_OF_BOUNDS", () => {
    const negative = knownGoodFleet();
    negative[4] = {
      ship: "destroyer",
      origin: { col: -1, row: 8 },
      orientation: "horizontal",
    };
    expect(validateFleetPlacement(negative)).toEqual({
      valid: false,
      reason: "OUT_OF_BOUNDS",
    });

    const beyond = knownGoodFleet();
    beyond[4] = {
      ship: "destroyer",
      origin: { col: 0, row: 10 },
      orientation: "horizontal",
    };
    expect(validateFleetPlacement(beyond)).toEqual({
      valid: false,
      reason: "OUT_OF_BOUNDS",
    });
  });

  it("rejects two ships sharing any cell as OVERLAP", () => {
    const fleet = knownGoodFleet();
    fleet[4] = {
      ship: "destroyer",
      origin: { col: 2, row: 0 }, // C1–D1 overlaps carrier at C1
      orientation: "horizontal",
    };
    expect(validateFleetPlacement(fleet)).toEqual({
      valid: false,
      reason: "OVERLAP",
    });
  });

  it("rejects a fleet missing a ship class (4 ships) as WRONG_FLEET_COMPOSITION", () => {
    const fleet = knownGoodFleet().slice(0, 4); // drop the destroyer
    expect(validateFleetPlacement(fleet)).toEqual({
      valid: false,
      reason: "WRONG_FLEET_COMPOSITION",
    });
  });

  it("rejects a duplicate ship class (two destroyers, 5 total) as WRONG_FLEET_COMPOSITION", () => {
    const fleet = knownGoodFleet();
    fleet[3] = {
      ship: "destroyer", // replaces submarine → two destroyers, still 5 ships
      origin: { col: 0, row: 6 },
      orientation: "horizontal",
    };
    expect(validateFleetPlacement(fleet)).toEqual({
      valid: false,
      reason: "WRONG_FLEET_COMPOSITION",
    });
  });

  it("rejects an empty array as WRONG_FLEET_COMPOSITION", () => {
    expect(validateFleetPlacement([])).toEqual({
      valid: false,
      reason: "WRONG_FLEET_COMPOSITION",
    });
  });
});

describe("generateRandomFleet", () => {
  it("always produces a fleet that passes validateFleetPlacement (200 iterations)", () => {
    for (let i = 0; i < 200; i++) {
      const fleet = generateRandomFleet();
      expect(validateFleetPlacement(fleet)).toEqual({ valid: true });
    }
  });

  it("produces varying layouts across calls (20 fleets → at least 2 distinct)", () => {
    const layouts = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const fleet = generateRandomFleet();
      const canonical = [...fleet]
        .sort((a, b) => a.ship.localeCompare(b.ship))
        .map((p) => `${p.ship}:${p.origin.col},${p.origin.row},${p.orientation}`)
        .join("|");
      layouts.add(canonical);
    }
    expect(layouts.size).toBeGreaterThanOrEqual(2);
  });
});
