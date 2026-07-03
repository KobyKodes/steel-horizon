import { describe, expect, it } from "vitest";
import { labelToCoord } from "./board.js";
import {
  FLEET,
  SHIP_LENGTHS,
  TOTAL_SHIP_CELLS,
  cellsForPlacement,
} from "./fleet.js";

describe("cellsForPlacement", () => {
  it("expands a horizontal carrier at A1 to A1–E1", () => {
    const cells = cellsForPlacement({
      ship: "carrier",
      origin: labelToCoord("A1")!,
      orientation: "horizontal",
    });
    expect(cells).toEqual([
      labelToCoord("A1"),
      labelToCoord("B1"),
      labelToCoord("C1"),
      labelToCoord("D1"),
      labelToCoord("E1"),
    ]);
  });

  it("expands a vertical destroyer at J9 to J9–J10", () => {
    const cells = cellsForPlacement({
      ship: "destroyer",
      origin: labelToCoord("J9")!,
      orientation: "vertical",
    });
    expect(cells).toEqual([labelToCoord("J9"), labelToCoord("J10")]);
  });
});

describe("fleet composition", () => {
  it("TOTAL_SHIP_CELLS is 17", () => {
    expect(TOTAL_SHIP_CELLS).toBe(17);
  });

  it("FLEET contains each of the five ship classes exactly once", () => {
    expect([...FLEET].sort()).toEqual(
      ["battleship", "carrier", "cruiser", "destroyer", "submarine"],
    );
  });

  it("ship lengths match the classic rules", () => {
    expect(SHIP_LENGTHS).toEqual({
      carrier: 5,
      battleship: 4,
      cruiser: 3,
      submarine: 3,
      destroyer: 2,
    });
  });
});
