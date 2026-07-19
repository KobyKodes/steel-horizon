// Bot opponent brains — pure target selection over a shot history. No
// timers, no sockets, no game mutation: socket.ts owns scheduling and
// feeds the chosen coordinate through the same engineFire path a human
// shot takes, so the bot can never bend a rule the engine enforces.
//
// The bot sees ONLY its own ShotRecords (what any player legitimately
// knows): where it fired, what landed, and the revealed cells of ships it
// has sunk. Difficulty changes how it reasons over that view:
//   easy   — uniform random over unshot cells.
//   medium — hunt randomly; after a hit, lock on: extend collinear hit
//            runs, otherwise probe orthogonal neighbours.
//   hard   — placement-counting heatmap: every legal position of every
//            surviving ship votes for the cells it covers; positions that
//            explain open hits dominate. Yields parity-style hunting and
//            optimal line finishing without special cases.

import {
  FLEET,
  GRID_SIZE,
  SHIP_LENGTHS,
  type BotDifficulty,
  type Coordinate,
  type ShipClassId,
  type ShotRecord,
} from "@steel-horizon/shared";

export type { BotDifficulty };

export function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

/** How a placement covering an open hit outvotes pure-hunt placements. */
const OPEN_HIT_WEIGHT = 1000;

function key(cell: Coordinate): string {
  return `${cell.col},${cell.row}`;
}

/** What the bot's shot history implies about the enemy grid. */
interface BoardView {
  /** Every cell already fired at. */
  shot: Set<string>;
  /** Hit cells NOT yet accounted for by a sunk ship — a live wound. */
  openHits: Coordinate[];
  /** Enemy ship classes still afloat. */
  remainingShips: ShipClassId[];
}

function buildView(shots: ShotRecord[]): BoardView {
  const shot = new Set<string>(shots.map((s) => key(s.target)));
  const sunkCells = new Set<string>(
    shots.flatMap((s) => (s.sunkShipCells ?? []).map(key)),
  );
  const openHits = shots
    .filter((s) => s.result !== "miss" && !sunkCells.has(key(s.target)))
    .map((s) => s.target);
  const sunk = new Set(
    shots.map((s) => s.sunkShip).filter((s): s is ShipClassId => s != null),
  );
  return {
    shot,
    openHits,
    remainingShips: FLEET.filter((ship) => !sunk.has(ship)),
  };
}

function unshotCells(view: BoardView): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      if (!view.shot.has(`${col},${row}`)) cells.push({ col, row });
    }
  }
  return cells;
}

function pick(cells: Coordinate[], rng: () => number): Coordinate {
  return cells[Math.min(cells.length - 1, Math.floor(rng() * cells.length))]!;
}

/**
 * Medium's lock-on: with 2+ open hits sharing a row or column, the cells
 * just past each end of the run; otherwise the unshot orthogonal
 * neighbours of every open hit.
 */
function lockOnCandidates(view: BoardView): Coordinate[] {
  const hits = view.openHits;
  const open = (cell: Coordinate): boolean =>
    cell.col >= 0 &&
    cell.col < GRID_SIZE &&
    cell.row >= 0 &&
    cell.row < GRID_SIZE &&
    !view.shot.has(key(cell));

  if (hits.length >= 2) {
    const sameRow = hits.every((h) => h.row === hits[0]!.row);
    const sameCol = hits.every((h) => h.col === hits[0]!.col);
    if (sameRow || sameCol) {
      const axis = sameRow ? "col" : "row";
      const values = hits.map((h) => h[axis]);
      const lo = Math.min(...values) - 1;
      const hi = Math.max(...values) + 1;
      const fixed = sameRow
        ? { row: hits[0]!.row }
        : { col: hits[0]!.col };
      const ends = [
        { ...fixed, [axis]: lo } as unknown as Coordinate,
        { ...fixed, [axis]: hi } as unknown as Coordinate,
      ].filter(open);
      if (ends.length > 0) return ends;
    }
  }

  return hits.flatMap((hit) =>
    [
      { col: hit.col - 1, row: hit.row },
      { col: hit.col + 1, row: hit.row },
      { col: hit.col, row: hit.row - 1 },
      { col: hit.col, row: hit.row + 1 },
    ].filter(open),
  );
}

/**
 * Hard's heatmap: slide every surviving ship across the board; positions
 * made impossible by misses/sunk cells are discarded, the rest vote for
 * each unshot cell they cover. Covering an open hit multiplies the vote,
 * so wounded-ship completions swamp the hunt signal.
 */
function heatmapCandidates(view: BoardView): Coordinate[] {
  const openHitKeys = new Set(view.openHits.map(key));
  const heat = new Map<string, number>();

  for (const ship of view.remainingShips) {
    const length = SHIP_LENGTHS[ship];
    for (let col = 0; col < GRID_SIZE; col++) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (const horizontal of [true, false]) {
          if ((horizontal ? col : row) + length > GRID_SIZE) continue;
          const cells: Coordinate[] = [];
          for (let i = 0; i < length; i++) {
            cells.push(
              horizontal ? { col: col + i, row } : { col, row: row + i },
            );
          }
          // Feasible = every cell either untouched or an open hit.
          let hitsCovered = 0;
          let feasible = true;
          for (const cell of cells) {
            const k = key(cell);
            if (openHitKeys.has(k)) hitsCovered++;
            else if (view.shot.has(k)) {
              feasible = false;
              break;
            }
          }
          if (!feasible) continue;
          const weight = 1 + hitsCovered * OPEN_HIT_WEIGHT;
          for (const cell of cells) {
            const k = key(cell);
            if (view.shot.has(k)) continue;
            heat.set(k, (heat.get(k) ?? 0) + weight);
          }
        }
      }
    }
  }

  let best = 0;
  for (const value of heat.values()) best = Math.max(best, value);
  if (best === 0) return [];
  const candidates: Coordinate[] = [];
  for (const [k, value] of heat) {
    if (value !== best) continue;
    const [col, row] = k.split(",").map(Number);
    candidates.push({ col: col!, row: row! });
  }
  return candidates;
}

/**
 * Choose the bot's next target. `shots` is the bot's own firing history;
 * the returned cell is always in bounds and never previously fired at.
 */
export function chooseBotShot(
  shots: ShotRecord[],
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): Coordinate {
  const view = buildView(shots);
  const fallback = unshotCells(view);

  if (difficulty === "medium") {
    const lockOn = lockOnCandidates(view);
    if (lockOn.length > 0) return pick(lockOn, rng);
  }
  if (difficulty === "hard") {
    const hot = heatmapCandidates(view);
    if (hot.length > 0) return pick(hot, rng);
  }
  return pick(fallback, rng);
}
