/**
 * Hot Spring Smart Ball (湯けむりスマートボール): the rules, the board, and their
 * exact odds.
 *
 * The smart ball of hot-spring towns and candy shops: a low table of painted
 * wood under glass, sloped a little away from the player, with a spring
 * plunger at the right-hand corner. A pull on the plunger sends a glass marble
 * up the lane at the side and round the rail at the top; where it leaves the
 * rail depends on how hard it was shot, and it falls back down the board
 * through the pins. The bingo-style boards have their holes in a square, and
 * every hole a marble drops into lights; a row, a column or a diagonal of lit
 * holes is a line, and the lines pay. Here the marbles are the machine's, and
 * what the lines pay is medals.
 *
 * ## The rules
 *
 * - **A play takes five medals** (`STAKE`) **and gives ten marbles**
 *   (`MARBLES`), shot one at a time.
 * - **The plunger.** Held, it draws back and forth on its spring, over a gauge
 *   of seven strengths (`WINDOWS`); let go, it shoots the marble at the
 *   strength it was drawn to. A soft shot leaves the top rail early, over the
 *   right of the board; a hard one rides it round to the left. Drawn back too
 *   little, the marble rolls back down the lane and waits to be shot again:
 *   that is no shot at all.
 * - **The pins.** Under the rail the pins scatter the marble: each strength has
 *   its chances of reaching each of the board's four columns of holes, and of
 *   missing them all into the OUT gutter at the foot (`COLUMN_WEIGHTS`,
 *   `OUT_WEIGHTS`, out of 24). In its column the pins drop it at one of the
 *   four holes, each as likely.
 * - **The holes.** Sixteen numbered holes in a square of four by four
 *   (`SIZE`). A marble that drops at a hole already lit rattles over the
 *   marble in it and rolls on down its column into the next one that is not;
 *   past the last, it goes OUT.
 * - **The lines.** Four rows, four columns and the two diagonals (`LINES`).
 *   When the ten marbles have been shot, the lines lit pay (`PAYS`): one line
 *   7 medals, two 20, three 100. Ten marbles light ten holes at most, and four
 *   lines need eleven, so three is the most.
 * - **Skip only fast-forwards:** it can be pressed once the last marble has been
 *   shot, and cuts its way to its hole short.
 * - **A page that goes away mid-play** (hidden, left, reloaded, or another tab
 *   taking the medals) **finishes the play:** the marbles already shot keep
 *   their strengths, and every marble still to come is shot blind, at a
 *   strength drawn with the rest of the play (`blinds`).
 *
 * ## Skill, and why it never beats the machine
 *
 * How hard to pull is the player's to choose, and it matters: a strength sends
 * the marble toward the column the player wants. But no strength is sure of a
 * column, the pins choose the hole, and a line needs four. So the return is
 * worked out for three players (`analyze`), exactly, as fractions of BigInts,
 * by dynamic programming over every state the board can be in (which of the
 * sixteen holes are lit, and how many marbles are left):
 *
 * - **perfect play**: the best strength for every marble, chosen afresh for
 *   the board as it stands; no way of playing brings back more, and this is
 *   the machine's best return;
 * - **an everyday hand** (`TYPICAL_QUARTERS`): aims where perfect play would,
 *   for the board as it stands, but lands on the strength aimed at half the
 *   time, and one strength softer or harder a quarter of the time each (at
 *   the ends of the gauge, the quarter that would fall off it stays on the end
 *   strength);
 * - **blind shots**: any of the seven strengths, each as likely.
 *
 * ## The draw
 *
 * Everything random about a play is drawn the moment its medals go in
 * (`drawPlay`), always twenty numbers in [0, 1), two for each marble in turn:
 * the way the pins will throw it (`drops`, one of `SLOTS` equally likely
 * slots), and the strength a blind shot of it would be (`blinds`). The
 * strength the player shoots it at only chooses where the slot drawn sends it:
 * each strength shares the 96 slots out among the holes it can reach and OUT,
 * column by column from the left, each hole as many slots as its chance is in
 * 96ths. The shot itself draws nothing.
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── The board ───────────────────────────────────────────────────────────────

/** Medals a play takes. */
export const STAKE = 5;
/** Marbles a play gives. */
export const MARBLES = 10;
/** The holes are a square of SIZE × SIZE. */
export const SIZE = 4;
export const HOLES = SIZE * SIZE;
/** The plunger's strengths, softest first: 0 to 6 here, shown as 1 to 7. */
export const WINDOWS = 7;
/** The equally likely ways the pins can throw a marble. */
export const SLOTS = 96;
/** Each strength's weights (its columns' and OUT's) add up to this. */
export const WEIGHT_TOTAL = 24;

/**
 * Each strength's weight for each column of holes, left to right, out of `WEIGHT_TOTAL`: the softest shots fall over
 * the right-hand column, the hardest ride the rail round to the left. A column's weight is shared out evenly among its
 * four holes.
 */
export const COLUMN_WEIGHTS: readonly (readonly number[])[] = [
  [0, 1, 4, 9],
  [0, 2, 5, 9],
  [1, 4, 9, 2],
  [2, 7, 7, 2],
  [2, 9, 4, 1],
  [9, 5, 2, 0],
  [9, 4, 1, 0],
];
/** Each strength's weight for missing the holes into the OUT gutter, out of `WEIGHT_TOTAL`: most at either end of the gauge. */
export const OUT_WEIGHTS: readonly number[] = [10, 8, 8, 6, 8, 8, 10];

/** What the lines lit when the marbles have all been shot pay, by how many there are: none, one, two, three. */
export const PAYS: readonly number[] = [0, 7, 20, 100];
/** The most a play can pay. */
export const MOST_WIN = Math.max(...PAYS);

export const holeAt = (row: number, col: number): number => row * SIZE + col;
export const rowOf = (hole: number): number => Math.floor(hole / SIZE);
export const colOf = (hole: number): number => hole % SIZE;
/** The number painted by a hole: 1 to 16, row by row from the top left, as on a bingo card. */
export const numberOf = (hole: number): number => hole + 1;

export type LineKind = 'row' | 'column' | 'diagonal';
export interface Line {
  kind: LineKind;
  holes: readonly number[];
  /** Its holes as bits of a set of lit holes. */
  mask: number;
}

const lineOf = (kind: LineKind, holes: number[]): Line => ({ kind, holes, mask: holes.reduce((m, h) => m | (1 << h), 0) });
/** The ten lines: the four rows, the four columns, and the two diagonals. */
export const LINES: readonly Line[] = [
  ...Array.from({ length: SIZE }, (_, r) => lineOf('row', Array.from({ length: SIZE }, (_, c) => holeAt(r, c)))),
  ...Array.from({ length: SIZE }, (_, c) => lineOf('column', Array.from({ length: SIZE }, (_, r) => holeAt(r, c)))),
  lineOf('diagonal', Array.from({ length: SIZE }, (_, i) => holeAt(i, i))),
  lineOf('diagonal', Array.from({ length: SIZE }, (_, i) => holeAt(i, SIZE - 1 - i))),
];

/** The lines a set of lit holes makes, by their place in `LINES`. */
export const linesOf = (lit: number): number[] => LINES.flatMap((line, i) => ((lit & line.mask) === line.mask ? [i] : []));
/** What `lines` lines pay. */
export const payFor = (lines: number): number => PAYS[Math.min(lines, PAYS.length - 1)];

/** Where the pins drop a marble: at a hole of a column, or OUT. */
export interface Entry {
  row: number;
  col: number;
}

/** Each strength's slots, in order: column by column from the left, each column's shared among its holes from the top; OUT last. */
const SLOT_TABLE: readonly (readonly (Entry | null)[])[] = COLUMN_WEIGHTS.map((columns, w) => {
  const slots: (Entry | null)[] = [];
  columns.forEach((weight, col) => {
    for (let row = 0; row < SIZE; row++) for (let n = 0; n < weight; n++) slots.push({ row, col });
  });
  for (let n = 0; n < SIZE * OUT_WEIGHTS[w]; n++) slots.push(null);
  return slots;
});

/** Where a marble shot at strength `window` is dropped by the pins, for the slot drawn for it: a hole's place, or null for OUT. */
export const entryOf = (window: number, slot: number): Entry | null => SLOT_TABLE[window][slot];

/** The first slot that drops a marble shot at `window` at `entry` (null: OUT), or -1 when that strength never does: for a test that rigs the draw. */
export const slotFor = (window: number, entry: Entry | null): number =>
  SLOT_TABLE[window].findIndex((e) => (entry === null ? e === null : e !== null && e.row === entry.row && e.col === entry.col));

/**
 * Where a marble dropped at `entry` comes to rest on a board lit as `lit`: the hole it drops into (the first one not
 * lit, from the entry down its column), the lit holes it rattles over on the way, and the holes above the entry it was
 * thrown past. Null hole: OUT.
 */
export function landing(lit: number, entry: Entry | null): { hole: number | null; over: number[]; past: number[] } {
  if (entry === null) return { hole: null, over: [], past: [] };
  const past = Array.from({ length: entry.row }, (_, r) => holeAt(r, entry.col));
  const over: number[] = [];
  for (let row = entry.row; row < SIZE; row++) {
    const hole = holeAt(row, entry.col);
    if ((lit & (1 << hole)) === 0) return { hole, over, past };
    over.push(hole);
  }
  return { hole: null, over, past };
}

/** The set of lit holes after a marble dropped at row `row` of column `col` on a board lit as `lit`. */
const landed = (lit: number, row: number, col: number): number => {
  for (let r = row; r < SIZE; r++) {
    const bit = 1 << (r * SIZE + col);
    if ((lit & bit) === 0) return lit | bit;
  }
  return lit;
};

// ── The draw ────────────────────────────────────────────────────────────────

/** Everything random about a play, drawn as its medals go in. */
export interface Draw {
  /** How the pins throw each marble: one of `SLOTS`, for each marble in turn. */
  drops: number[];
  /** The strength each marble would be shot at blind, 0 to 6: for a play whose page went away mid-play. */
  blinds: number[];
}

/** How many numbers in [0, 1) a draw takes. */
export const DRAW_NUMBERS = MARBLES * 2;

const pick = (n: number, of: number): number => Math.min(of - 1, Math.max(0, Math.floor(n * of)));

/** A play's draw, from `DRAW_NUMBERS` random numbers in [0, 1): for each marble in turn, its throw by the pins, then its blind strength. */
export function drawPlay(random: () => number): Draw {
  const draw: Draw = { drops: [], blinds: [] };
  for (let m = 0; m < MARBLES; m++) {
    draw.drops.push(pick(random(), SLOTS));
    draw.blinds.push(pick(random(), WINDOWS));
  }
  return draw;
}

/** The number that draws slot `slot`. */
export const numberForSlot = (slot: number): number => (slot + 0.5) / SLOTS;
/** The number that draws blind strength `window`. */
export const numberForWindow = (window: number): number => (window + 0.5) / WINDOWS;
/** The numbers that draw `draw`, in the order `drawPlay` takes them. */
export const numbersFor = (draw: Draw): number[] => draw.drops.flatMap((slot, m) => [numberForSlot(slot), numberForWindow(draw.blinds[m])]);

const isWhole = (value: unknown, below: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;
/** Whether a value is a strength a marble can be shot at. */
export const isShot = (value: unknown): value is number => isWhole(value, WINDOWS);

/** Whether a value is a draw the machine could have made. */
export function isDraw(value: unknown): value is Draw {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  const list = (v: unknown, below: number) => Array.isArray(v) && v.length === MARBLES && v.every((n) => isWhole(n, below));
  return list(d.drops, SLOTS) && list(d.blinds, WINDOWS);
}
export const copyDraw = (draw: Draw): Draw => ({ drops: [...draw.drops], blinds: [...draw.blinds] });

// ── A play ──────────────────────────────────────────────────────────────────

/** A marble shot, and where it went. */
export interface MarblePlay {
  marble: number;
  /** The strength it was shot at, 0 to 6. */
  window: number;
  /** Whether it was shot blind (its page went away mid-play), not by the player. */
  blind: boolean;
  /** Where the pins dropped it (null: straight into the OUT gutter). */
  entry: Entry | null;
  /** The hole it lit, or null: OUT. */
  hole: number | null;
  /** The lit holes it rattled over on the way down its column. */
  over: number[];
  /** The holes above its entry it was thrown past. */
  past: number[];
}

export interface Play {
  /** The marbles shot so far, in order. */
  marbles: MarblePlay[];
  /** The holes lit, as bits (hole `h` is bit `h`). */
  lit: number;
  /** The lines lit, by their place in `LINES`. */
  lines: number[];
  /** Medals the play pays: nothing until every marble has been shot. */
  won: number;
  /** Whether every marble has been shot. */
  complete: boolean;
}

/**
 * A play as far as it has gone: the shots made (`shots`, a strength for each marble shot), and, with `finish`, every
 * marble still to come shot blind, at the strength drawn for it.
 */
export function playOf(draw: Draw, shots: readonly number[], finish = false): Play {
  const marbles: MarblePlay[] = [];
  let lit = 0;
  for (let m = 0; m < MARBLES; m++) {
    const own = m < shots.length;
    if (!own && !finish) break;
    const window = own ? shots[m] : draw.blinds[m];
    const entry = entryOf(window, draw.drops[m]);
    const { hole, over, past } = landing(lit, entry);
    if (hole !== null) lit |= 1 << hole;
    marbles.push({ marble: m, window, blind: !own, entry, hole, over, past });
  }
  const lines = linesOf(lit);
  const complete = marbles.length === MARBLES;
  return { marbles, lit, lines, won: complete ? payFor(lines.length) : 0, complete };
}

/** The shots of a play played to its end: those made, then blind ones for the rest. */
export const finishedShots = (draw: Draw, shots: readonly number[]): number[] => playOf(draw, shots, true).marbles.map((marble) => marble.window);

/** Whether `shots` could be the shots of a play: a strength for each, and no more than the marbles. */
export const shotsFit = (shots: readonly unknown[]): boolean => shots.length <= MARBLES && shots.every(isShot);

/** What the medal floor calls a play's win: a BINGO of one, two or three lines, by name. */
export const labelOf = (play: Play): string | null => {
  if (!play.complete) return null;
  const n = Math.min(play.lines.length, PAYS.length - 1);
  return n === 3 ? 'smart-triple' : n === 2 ? 'smart-double' : n === 1 ? 'smart-line' : null;
};

// ── Exact fractions ─────────────────────────────────────────────────────────

export interface Fraction {
  num: bigint;
  den: bigint;
}

// Written with BigInt() rather than literals: the site's TypeScript targets a version before BigInt literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) [x, y] = [y, x % y];
  return x;
};
export const fraction = (num: bigint | number, den: bigint | number = ONE): Fraction => {
  const n = typeof num === 'bigint' ? num : BigInt(num);
  const d = typeof den === 'bigint' ? den : BigInt(den);
  const g = gcd(n, d) || ONE;
  const sign = d < ZERO ? -ONE : ONE;
  return { num: (sign * n) / g, den: (sign * d) / g };
};
export const less = (a: Fraction, b: Fraction): boolean => a.num * b.den < b.num * a.den;
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};
/** A fraction written as "num/den", and read back. */
export const ratioOf = (f: Fraction): string => `${f.num.toString()}/${f.den.toString()}`;
export const parseRatio = (text: string): Fraction => {
  const [num, den] = text.split('/');
  return fraction(BigInt(num), BigInt(den));
};

// ── The players ─────────────────────────────────────────────────────────────

export type Player = 'perfect' | 'typical' | 'blind';
export const PLAYERS: readonly Player[] = ['perfect', 'typical', 'blind'];

/**
 * The everyday hand's spread, in quarters: where it lands when it aims at strength `aim`. On it half the time, one
 * softer or harder a quarter each; at either end of the gauge the quarter that would fall off it stays on the end.
 */
export function TYPICAL_QUARTERS(aim: number): { window: number; quarters: number }[] {
  if (aim === 0) return [{ window: 0, quarters: 3 }, { window: 1, quarters: 1 }];
  if (aim === WINDOWS - 1) return [{ window: WINDOWS - 1, quarters: 3 }, { window: WINDOWS - 2, quarters: 1 }];
  return [{ window: aim, quarters: 2 }, { window: aim - 1, quarters: 1 }, { window: aim + 1, quarters: 1 }];
}

/** A choice a player makes for a marble, as weights over a common scale: a weight for each hole of each column, and OUT's. */
interface Choice {
  /** The weight of each hole of each column (every hole of a column alike). */
  cols: number[];
  out: number;
}

/** The choices each player has for a marble, and the scale their weights are over. */
function choicesOf(player: Player): { scale: number; choices: Choice[] } {
  const single = (w: number): Choice => ({ cols: [...COLUMN_WEIGHTS[w]], out: SIZE * OUT_WEIGHTS[w] });
  const mix = (parts: { window: number; times: number }[]): Choice => ({
    cols: Array.from({ length: SIZE }, (_, c) => parts.reduce((sum, { window, times }) => sum + times * COLUMN_WEIGHTS[window][c], 0)),
    out: parts.reduce((sum, { window, times }) => sum + times * SIZE * OUT_WEIGHTS[window], 0),
  });
  const perShot = SIZE * WEIGHT_TOTAL;
  if (player === 'perfect') return { scale: perShot, choices: Array.from({ length: WINDOWS }, (_, w) => single(w)) };
  if (player === 'typical') return { scale: 4 * perShot, choices: Array.from({ length: WINDOWS }, (_, aim) => mix(TYPICAL_QUARTERS(aim).map(({ window, quarters }) => ({ window, times: quarters })))) };
  return { scale: WINDOWS * perShot, choices: [mix(Array.from({ length: WINDOWS }, (_, window) => ({ window, times: 1 })))] };
}

// ── The dynamic programme ───────────────────────────────────────────────────

const STATES = 1 << HOLES;
/**
 * Every set of lit holes ten marbles can leave, by how many are lit: made the first time the programme runs, never as
 * the page loads (the page reads published.ts).
 */
let setsBySize: number[][] | null = null;
/** The sets of lit holes a board can be in with `left` marbles still to shoot: those `MARBLES - left` marbles can light. */
const setsWith = (left: number): number[] => {
  if (!setsBySize) {
    const sets: number[][] = Array.from({ length: MARBLES + 1 }, () => []);
    for (let lit = 0; lit < STATES; lit++) {
      let count = 0;
      for (let rest = lit; rest !== 0 && count <= MARBLES; rest &= rest - 1) count += 1;
      if (count <= MARBLES) sets[count].push(lit);
    }
    setsBySize = sets;
  }
  return setsBySize.slice(0, MARBLES - left + 1).flat();
};

/** What a board lit as `lit` pays once every marble has been shot. */
const payOfSet = (lit: number): number => {
  let n = 0;
  for (const line of LINES) if ((lit & line.mask) === line.mask) n += 1;
  return payFor(n);
};

/** The successors of a board lit as `lit`, column by column, hole by hole: where a marble dropped there leaves it. */
const successors = (lit: number): number[] => {
  const next = new Array<number>(HOLES);
  for (let c = 0; c < SIZE; c++) for (let r = 0; r < SIZE; r++) next[c * SIZE + r] = landed(lit, r, c);
  return next;
};

/**
 * The best choice for every board and every count of marbles left, worked out in floating point: what a player who
 * chooses as `player` does is the choice of highest worth (none for blind shots). Index: `left * STATES + lit`.
 */
export interface FloatSolution {
  player: Player;
  /** The worth of each board with `left` marbles left, in medals. */
  worth: Float64Array;
  /** The choice made there (a strength, or the strength aimed at), -1 where nothing is chosen. */
  choice: Int8Array;
}

/** Choices within this much of the best (relative) are compared exactly before one is taken. */
const NEAR = 1e-9;

/** The float programme, from the end of a play back to its start. */
function solveFloat(player: Player): FloatSolution & { near: Uint8Array } {
  const { scale, choices } = choicesOf(player);
  const worth = new Float64Array(STATES * (MARBLES + 1));
  const choice = new Int8Array(STATES * (MARBLES + 1)).fill(-1);
  // How many choices came within `NEAR` of the best: more than one, and the exact pass compares them.
  const near = new Uint8Array(STATES * (MARBLES + 1));
  for (const lit of setsWith(0)) worth[lit] = payOfSet(lit);
  const colSum = new Float64Array(SIZE);
  for (let left = 1; left <= MARBLES; left++) {
    const below = (left - 1) * STATES;
    for (const lit of setsWith(left)) {
      const next = successors(lit);
      for (let c = 0; c < SIZE; c++) {
        let sum = 0;
        for (let r = 0; r < SIZE; r++) sum += worth[below + next[c * SIZE + r]];
        colSum[c] = sum;
      }
      const stay = worth[below + lit];
      let best = -Infinity;
      let bestAt = 0;
      const evs: number[] = [];
      for (let i = 0; i < choices.length; i++) {
        const { cols, out } = choices[i];
        let ev = out * stay;
        for (let c = 0; c < SIZE; c++) ev += cols[c] * colSum[c];
        ev /= scale;
        evs.push(ev);
        if (ev > best) {
          best = ev;
          bestAt = i;
        }
      }
      const at = left * STATES + lit;
      worth[at] = best;
      choice[at] = player === 'blind' ? -1 : bestAt;
      const tolerance = NEAR * Math.max(1, Math.abs(best));
      near[at] = evs.filter((ev) => ev >= best - tolerance).length;
    }
  }
  return { player, worth, choice, near };
}

const solutions = new Map<Player, FloatSolution>();
/** The best choices for `player`, worked out once, when first asked for (a few hundred milliseconds). */
export function solve(player: Player): FloatSolution {
  const known = solutions.get(player);
  if (known) return known;
  const { worth, choice } = solveFloat(player);
  const solved = { player, worth, choice };
  solutions.set(player, solved);
  return solved;
}

/** A player's exact odds: what a play brings back, and the chance of each number of lines. */
export interface PlayerOdds {
  /** Medals back per medal played. */
  back: Fraction;
  /** The chance of ending with no line, one, two and three. */
  lines: Fraction[];
}

export type MachineOdds = Record<Player, PlayerOdds>;

/**
 * A player's exact odds, by the same programme in BigInts: every board's worth with `left` marbles left, times the
 * scale to the power `left`, is a whole number, so the programme runs on whole numbers and divides once at the end.
 * The choices are the float programme's, and wherever two came within a hair of each other they are compared exactly
 * here, so the best is the best to the last digit (`exhaustive` compares every choice exactly everywhere, for a test
 * that the float programme chose right). Then the chance of each number of lines, played that way, forward from an
 * empty board.
 */
export function analyzePlayer(player: Player, { exhaustive = false }: { exhaustive?: boolean } = {}): PlayerOdds {
  const { scale, choices } = choicesOf(player);
  const solved = solveFloat(player);
  const big = choices.map(({ cols, out }) => ({ cols: cols.map((w) => BigInt(w)), out: BigInt(out) }));
  let worth: bigint[] = new Array<bigint>(STATES);
  for (const lit of setsWith(0)) worth[lit] = BigInt(payOfSet(lit));
  const choice = new Int8Array(STATES * (MARBLES + 1)).fill(-1);
  const colSum = new Array<bigint>(SIZE);
  for (let left = 1; left <= MARBLES; left++) {
    const now: bigint[] = new Array<bigint>(STATES);
    for (const lit of setsWith(left)) {
      const next = successors(lit);
      for (let c = 0; c < SIZE; c++) {
        let sum = ZERO;
        for (let r = 0; r < SIZE; r++) sum += worth[next[c * SIZE + r]];
        colSum[c] = sum;
      }
      const stay = worth[lit];
      const at = left * STATES + lit;
      const candidates = exhaustive || solved.near[at] > 1 ? big.map((_, i) => i) : [Math.max(0, solved.choice[at])];
      let best: bigint | null = null;
      let bestAt = candidates[0];
      for (const i of candidates) {
        const { cols, out } = big[i];
        let ev = out * stay;
        for (let c = 0; c < SIZE; c++) ev += cols[c] * colSum[c];
        if (best === null || ev > best) {
          best = ev;
          bestAt = i;
        }
      }
      now[lit] = best!;
      choice[at] = bestAt;
    }
    worth = now;
  }
  const den = BigInt(scale) ** BigInt(MARBLES);
  const back = fraction(worth[0], den * BigInt(STAKE));
  // Forward: the chance of every board after each marble, played by the choices taken, as whole numbers over the scale.
  let chance = new Map<number, bigint>([[0, ONE]]);
  for (let left = MARBLES; left >= 1; left--) {
    const after = new Map<number, bigint>();
    const add = (lit: number, n: bigint) => after.set(lit, (after.get(lit) ?? ZERO) + n);
    for (const [lit, p] of chance) {
      const { cols, out } = big[choice[left * STATES + lit]];
      const next = successors(lit);
      for (let c = 0; c < SIZE; c++) {
        if (cols[c] === ZERO) continue;
        const each = p * cols[c];
        for (let r = 0; r < SIZE; r++) add(next[c * SIZE + r], each);
      }
      if (out !== ZERO) add(lit, p * out);
    }
    chance = after;
  }
  const byLines = Array.from({ length: PAYS.length }, () => ZERO);
  for (const [lit, p] of chance) byLines[Math.min(linesOf(lit).length, PAYS.length - 1)] += p;
  return { back, lines: byLines.map((n) => fraction(n, den)) };
}

/** Every player's exact odds (a second or so): for the tests, and for writing out published.ts. The page reads published.ts. */
export const analyze = (): MachineOdds => ({ perfect: analyzePlayer('perfect'), typical: analyzePlayer('typical'), blind: analyzePlayer('blind') });

// ── A check by play ─────────────────────────────────────────────────────────

/** Random numbers in [0, 1) from a seed, the same every time: for the check, never for the machine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The strength `player` shoots a marble at, on a board lit as `lit` with `left` marbles left, `random` for a hand that is not perfect. */
export function shotAs(player: Player, lit: number, left: number, random: () => number): number {
  if (player === 'blind') return pick(random(), WINDOWS);
  const aim = solve(player).choice[left * STATES + lit];
  if (player === 'perfect') return aim;
  const n = random() * 4;
  let sum = 0;
  for (const { window, quarters } of TYPICAL_QUARTERS(aim)) {
    sum += quarters;
    if (n < sum) return window;
  }
  return aim;
}

/** The strength perfect play shoots the next marble at, on a board lit as `lit` with `left` marbles left. */
export const bestShot = (lit: number, left: number): number => solve('perfect').choice[left * STATES + lit];

export interface CheckResult {
  plays: number;
  /** Medals back per medal played. */
  back: number;
  /** Plays that ended with each number of lines. */
  lines: number[];
}

/** Plays `plays` plays as `player`, drawn from `random`: what came back, to set beside the exact figures. */
export function checkPlays(plays: number, player: Player, random: () => number): CheckResult {
  let back = 0;
  const lines = new Array<number>(PAYS.length).fill(0);
  for (let p = 0; p < plays; p++) {
    const draw = drawPlay(random);
    const shots: number[] = [];
    let play = playOf(draw, shots);
    while (!play.complete) {
      shots.push(shotAs(player, play.lit, MARBLES - shots.length, random));
      play = playOf(draw, shots);
    }
    back += play.won;
    lines[Math.min(play.lines.length, PAYS.length - 1)] += 1;
  }
  return { plays, back: back / (plays * STAKE), lines };
}
