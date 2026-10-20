/**
 * Video Keno (ビデオキノ): the rules, the paytables, the draw and their exact odds.
 *
 * The video keno cabinet of a casino floor: a screen with the keno board on it, the numbers 1 to 80 in eight rows of
 * ten, the top half 1 to 40 and the bottom half 41 to 80. The player marks between one and ten of them, their spots,
 * bets, and presses DRAW: twenty of the eighty are drawn, one at a time, and every one of the player's spots among them
 * is caught. What a game pays depends only on how many spots were marked and how many of them were caught: a paytable
 * for each number of spots, as on the real machines.
 *
 * ## The paytables
 *
 * Every pay is a whole number of medals for every medal bet (`PAYS`), and a game's win is its pay times the bet, the
 * bet of 1, 2, 3, 5 or 10 medals included in it (a pay of 3 on a bet of 2 gives back 6). The tables are this machine's
 * own. Their shape follows the real ones (Wizard of Odds' keno pay table report): the fewer the spots, the smaller and
 * likelier the pays; the more, the longer the shot at the top, which on ten spots pays at the far end of eight
 * million to one.
 *
 * ## The last ball: ×5
 *
 * When the twentieth ball drawn, the last, is one of the player's spots, the game's win is five times the table's
 * (`LAST_BALL_TIMES`), as the multiplier versions of the real machine pay for a catch on the last ball. It is what lets
 * every number of spots bring back about 90%: with whole medals and no multiplier, one spot pays 3 (75%) or 4 (100%),
 * nothing between; with the last ball's ×5 its 3 brings back exactly 90%.
 *
 * Of the twenty balls drawn, the last is any one of them as likely as any other, so of a game that catches c spots,
 * the last ball is one of them c times in 20. A pay of p for c caught is worth p × (1 + 4c/20) on average: the returns
 * are worked out exactly from that and the hypergeometric chances of each catch (`analyze`), as fractions of BigInts,
 * and the tests add up every ordered draw of a smaller board to check the rule.
 *
 * ## The draw
 *
 * Everything random about a game is drawn the moment DRAW is pressed (`drawBalls`): twenty random numbers in [0, 1),
 * each picking one of the balls still in the machine, in order, so the order the balls come out is drawn as well. The
 * screen then shows them one by one. A quick pick draws the spots the same way (`quickPick`).
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── The board ───────────────────────────────────────────────────────────────

/** The numbers on the board: 1 to 80. */
export const BALLS = 80;
/** The balls drawn each game. */
export const DRAWN = 20;
/** The most spots a ticket may have, and the fewest. */
export const SPOTS_MOST = 10;
export const SPOTS_LEAST = 1;
/** The board's columns and rows, as the real board is laid out; its halves are rows 1–4 (1 to 40) and 5–8 (41 to 80). */
export const COLUMNS = 10;
export const ROWS = 8;
export const HALF = BALLS / 2;

/** The bets, in medals. */
export const BETS = [1, 2, 3, 5, 10] as const;
export type Bet = (typeof BETS)[number];
export const BET_MOST: Bet = 10;
export const isBet = (value: unknown): value is Bet => BETS.includes(value as Bet);

/** What a win is multiplied by when the last ball drawn is one of the player's spots. */
export const LAST_BALL_TIMES = 5;

/**
 * The paytables: for each number of spots, what each catch (0 to the spots) pays for every medal bet, before the last
 * ball's ×5. Two spots also give the medal back on a catch of none: with whole medals a 2-spot ticket could only bring
 * back 84.2% (a pay of 10 for both caught) or 92.6% (11), and a catch of none paying the medal back, as some real
 * tables do, brings it to 89.68%.
 */
export const PAYS: Readonly<Record<number, readonly number[]>> = {
  1: [0, 3],
  2: [1, 0, 4],
  3: [0, 0, 2, 23],
  4: [0, 0, 1, 4, 59],
  5: [0, 0, 0, 3, 8, 250],
  6: [0, 0, 0, 2, 3, 35, 400],
  7: [0, 0, 0, 1, 2, 11, 121, 800],
  8: [0, 0, 0, 0, 1, 6, 50, 680, 1_000],
  9: [0, 0, 0, 0, 1, 3, 19, 133, 800, 1_500],
  10: [0, 0, 0, 0, 0, 3, 9, 54, 390, 1_000, 2_000],
};

/** The numbers of spots a ticket can have: 1 to 10. */
export const SPOT_COUNTS: readonly number[] = Array.from({ length: SPOTS_MOST }, (_, i) => i + 1);

/** What `caught` of `spots` pays for every medal bet, before the last ball. */
export const payOf = (spots: number, caught: number): number => PAYS[spots]?.[caught] ?? 0;
/** The most any game pays for every medal bet: the top of the biggest table, on the last ball. */
export const TOP_PAY = Math.max(...SPOT_COUNTS.map((n) => payOf(n, n))) * LAST_BALL_TIMES;
/** The most medals a game can pay: the top on the biggest bet. */
export const MOST_WIN = TOP_PAY * BET_MOST;

/** The smallest number of spots whose all-caught is named a big catch on the floor (`labelOf`). */
export const ALL_CAUGHT_FROM = 5;

// ── Numbers and tickets ─────────────────────────────────────────────────────

/** Whether a value is a number on the board. */
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= BALLS;

/** Whether a value is a ticket's spots: 1 to 10 different numbers of the board, in order. */
export function isSpots(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length < SPOTS_LEAST || value.length > SPOTS_MOST || !value.every(isNumber)) return false;
  for (let i = 1; i < value.length; i++) if (value[i] <= value[i - 1]) return false;
  return true;
}

/** Spots put in order, each once. */
export const sortSpots = (spots: readonly number[]): number[] => [...new Set(spots)].sort((a, b) => a - b);

/** Whether a value is a draw: twenty different numbers of the board, in the order they came out. */
export function isDraw(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === DRAWN && value.every(isNumber) && new Set(value).size === DRAWN;
}

/** Whether two tickets have the same spots. */
export const sameSpots = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((n, i) => n === b[i]);

/** Which half of the board a number is in: the top (1 to 40) or the bottom (41 to 80). */
export const halfOf = (n: number): 'top' | 'bottom' => (n <= HALF ? 'top' : 'bottom');

// ── The draw ────────────────────────────────────────────────────────────────

/**
 * `count` different numbers of `1..pool`, in the order they were picked: each random number in [0, 1) picks one of the
 * numbers still left (a shuffle stopped after `count`).
 */
function pick(count: number, random: () => number, pool = BALLS): number[] {
  const left = Array.from({ length: pool }, (_, i) => i + 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.min(left.length - 1, Math.floor(random() * left.length));
    out.push(left[at]);
    left.splice(at, 1);
  }
  return out;
}

/** A game's twenty balls, in the order they come out: twenty random numbers, drawn the moment DRAW is pressed. */
export const drawBalls = (random: () => number): number[] => pick(DRAWN, random);

/** A quick pick: `count` spots drawn at random, in order. */
export const quickPick = (count: number, random: () => number): number[] => sortSpots(pick(Math.max(SPOTS_LEAST, Math.min(SPOTS_MOST, count)), random));

/**
 * The random numbers that pick `wanted`, in that order, the way `drawBalls` and `quickPick` take them: for a test that
 * rigs a draw or a quick pick.
 */
export function numbersFor(wanted: readonly number[]): number[] {
  const left = Array.from({ length: BALLS }, (_, i) => i + 1);
  return wanted.map((n) => {
    const at = left.indexOf(n);
    if (at < 0) throw new Error(`not on the board, or picked twice: ${n}`);
    const number = (at + 0.5) / left.length;
    left.splice(at, 1);
    return number;
  });
}

// ── A game ──────────────────────────────────────────────────────────────────

export interface Game {
  /** The spots caught, in the order their balls came out. */
  caught: number[];
  /** Whether the last ball is one of the spots. */
  lastCaught: boolean;
  /** What the table pays for the catch, for every medal bet. */
  pay: number;
  /** What the win is multiplied by: ×5 on the last ball, if the catch pays at all. */
  times: number;
  /** Medals the game pays back for every medal bet. */
  perMedal: number;
}

/** A game of `spots` against `balls` (the draw, in order), after the first `shown` balls (all of them when not given). */
export function gameOf(spots: readonly number[], balls: readonly number[], shown = DRAWN): Game {
  const mine = new Set(spots);
  const out = balls.slice(0, shown);
  const caught = out.filter((n) => mine.has(n));
  const lastCaught = out.length === DRAWN && mine.has(out[DRAWN - 1]);
  const pay = payOf(spots.length, caught.length);
  const times = lastCaught && pay > 0 ? LAST_BALL_TIMES : 1;
  return { caught, lastCaught, pay, times, perMedal: pay * times };
}

/** The medals a game pays on a bet of `bet`, the bet included. */
export const winOf = (spots: readonly number[], balls: readonly number[], bet: number): number => gameOf(spots, balls).perMedal * bet;

/** What the medal floor calls a game's big catch: every spot caught, on a ticket of five spots or more. */
export const labelOf = (spots: readonly number[], balls: readonly number[]): string | null => {
  const game = gameOf(spots, balls);
  return spots.length >= ALL_CAUGHT_FROM && game.caught.length === spots.length ? 'keno-all' : null;
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
export const add = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.den + b.num * a.den, a.den * b.den);
export const mul = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.num, a.den * b.den);
export const less = (a: Fraction, b: Fraction): boolean => a.num * b.den < b.num * a.den;
const FZERO = fraction(0);
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};

/** n choose k, exactly. */
export function choose(n: number, k: number): bigint {
  if (k < 0 || k > n) return ZERO;
  let r = ONE;
  for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1);
  return r;
}

/** The board a game is played on: the balls on it and the balls drawn. The tests check the rules on a smaller one. */
export interface Board {
  balls: number;
  drawn: number;
}
export const BOARD: Board = { balls: BALLS, drawn: DRAWN };

/** The chance that `caught` of `spots` spots are among the balls drawn: the hypergeometric distribution. */
export const catchChance = (spots: number, caught: number, board: Board = BOARD): Fraction => fraction(choose(spots, caught) * choose(board.balls - spots, board.drawn - caught), choose(board.balls, board.drawn));

/** Of a game that catches `caught`, the chance that the last ball is one of them: `caught` in `drawn`. */
export const lastBallChance = (caught: number, board: Board = BOARD): Fraction => fraction(caught, board.drawn);

/**
 * What a catch's pay `pay` is worth on average, the last ball's ×5 included: the pay, and four pays more the
 * `caught`-in-`drawn` times the last ball is one of the catch.
 */
export const payWorth = (pay: number, caught: number, board: Board = BOARD): Fraction =>
  pay === 0 ? FZERO : mul(fraction(pay), add(fraction(1), mul(fraction(LAST_BALL_TIMES - 1), lastBallChance(caught, board))));

/** One line of a paytable, as the Odds tab shows it. */
export interface CatchOdds {
  caught: number;
  pay: number;
  chance: Fraction;
  /** What it adds to the return: its chance times its pay's worth. */
  back: Fraction;
}

/** The exact odds of a ticket of `spots` spots. */
export interface SpotOdds {
  spots: number;
  lines: CatchOdds[];
  /** Medals back for every medal bet, the last ball's ×5 included. */
  back: Fraction;
  /** The same without the last ball: what the table alone brings back. */
  table: Fraction;
  /** The chance a game pays anything. */
  hit: Fraction;
  /** The chance the last ball is one of the spots: `spots` in 80. */
  lastBall: Fraction;
  /** The chance every spot is caught. */
  all: Fraction;
}

/** A ticket's exact odds, from `pays` (catch → pay), on `board`. */
export function oddsOf(spots: number, pays: readonly number[] = PAYS[spots], board: Board = BOARD): SpotOdds {
  const lines: CatchOdds[] = [];
  let back = FZERO;
  let table = FZERO;
  let hit = FZERO;
  for (let caught = 0; caught <= spots; caught++) {
    const pay = pays[caught] ?? 0;
    const chance = catchChance(spots, caught, board);
    const worth = mul(chance, payWorth(pay, caught, board));
    lines.push({ caught, pay, chance, back: worth });
    back = add(back, worth);
    table = add(table, mul(chance, fraction(pay)));
    if (pay > 0) hit = add(hit, chance);
  }
  return { spots, lines, back, table, hit, lastBall: fraction(spots, board.balls), all: catchChance(spots, spots, board) };
}

export interface KenoOdds {
  /** Every ticket's odds, 1 to 10 spots. */
  tickets: SpotOdds[];
  /** The best return of any ticket, and the ticket. */
  best: Fraction;
  bestSpots: number;
  /** The worst. */
  worst: Fraction;
}

let odds: KenoOdds | null = null;

/** The machine's exact odds, worked out once, when first asked for. */
export function analyze(): KenoOdds {
  if (odds) return odds;
  const tickets = SPOT_COUNTS.map((n) => oddsOf(n));
  let bestSpots = tickets[0].spots;
  let best = tickets[0].back;
  let worst = tickets[0].back;
  for (const ticket of tickets) {
    if (less(best, ticket.back)) {
      best = ticket.back;
      bestSpots = ticket.spots;
    }
    if (less(ticket.back, worst)) worst = ticket.back;
  }
  odds = { tickets, best, bestSpots, worst };
  return odds;
}

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

export interface CheckResult {
  games: number;
  /** Medals back for every medal bet. */
  back: number;
  /** Games that paid anything, and games won on the last ball. */
  hits: number;
  lastBalls: number;
}

/** Plays `games` games of a `spots`-spot quick pick each, drawn from `random` as the machine draws them. */
export function checkGames(games: number, spots: number, random: () => number): CheckResult {
  let back = 0;
  let hits = 0;
  let lastBalls = 0;
  for (let g = 0; g < games; g++) {
    const ticket = quickPick(spots, random);
    const game = gameOf(ticket, drawBalls(random));
    back += game.perMedal;
    if (game.perMedal > 0) hits += 1;
    if (game.times > 1) lastBalls += 1;
  }
  return { games, back: back / games, hits, lastBalls };
}
