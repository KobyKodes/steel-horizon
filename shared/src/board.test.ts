import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  coordToLabel,
  coordsEqual,
  inBounds,
  labelToCoord,
} from "./board.js";

describe("GRID_SIZE", () => {
  it("is 10", () => {
    expect(GRID_SIZE).toBe(10);
  });
});

describe("coordToLabel / labelToCoord round-trips", () => {
  it("handles corner A1", () => {
    const coord = { col: 0, row: 0 };
    expect(coordToLabel(coord)).toBe("A1");
    expect(labelToCoord("A1")).toEqual(coord);
  });

  it("handles corner J10", () => {
    const coord = { col: 9, row: 9 };
    expect(coordToLabel(coord)).toBe("J10");
    expect(labelToCoord("J10")).toEqual(coord);
  });

  it("handles mid cell B7", () => {
    const coord = { col: 1, row: 6 };
    expect(coordToLabel(coord)).toBe("B7");
    expect(labelToCoord("B7")).toEqual(coord);
  });

  it("round-trips every cell on the board", () => {
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        expect(labelToCoord(coordToLabel({ col, row }))).toEqual({ col, row });
      }
    }
  });
});

describe("labelToCoord invalid input", () => {
  it.each(["K3", "A11", "A0", "7B", "", "AA1", "A", "1", "B07", " A1", "A1 "])(
    "rejects %j",
    (label) => {
      expect(labelToCoord(label)).toBeNull();
    },
  );

  it("is case-insensitive for valid labels", () => {
    expect(labelToCoord("b7")).toEqual({ col: 1, row: 6 });
    expect(labelToCoord("j10")).toEqual({ col: 9, row: 9 });
  });
});

describe("inBounds", () => {
  it("rejects col/row of -1 and 10", () => {
    expect(inBounds({ col: -1, row: 0 })).toBe(false);
    expect(inBounds({ col: 0, row: -1 })).toBe(false);
    expect(inBounds({ col: 10, row: 0 })).toBe(false);
    expect(inBounds({ col: 0, row: 10 })).toBe(false);
  });

  it("accepts col/row of 0 and 9", () => {
    expect(inBounds({ col: 0, row: 0 })).toBe(true);
    expect(inBounds({ col: 9, row: 9 })).toBe(true);
    expect(inBounds({ col: 0, row: 9 })).toBe(true);
    expect(inBounds({ col: 9, row: 0 })).toBe(true);
  });
});

describe("coordsEqual", () => {
  it("matches identical coordinates", () => {
    expect(coordsEqual({ col: 3, row: 4 }, { col: 3, row: 4 })).toBe(true);
  });

  it("rejects differing coordinates", () => {
    expect(coordsEqual({ col: 3, row: 4 }, { col: 4, row: 3 })).toBe(false);
  });
});
