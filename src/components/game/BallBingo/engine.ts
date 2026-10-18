/**
 * The rules of Ball Bingo (ボールビンゴ), and their exact odds.
 *
 * A ball-drop bingo of the medal corner, built as its own machine. A game is
 * bet (one to three medals), and five balls are shot, one at a time, up the
 * rail and down through the pins into the pockets at the foot of the field.
 * Each numbered pocket marks its number on the 3 × 3 card; three in a row,
 * a column or a diagonal is a line, and the lines the card holds when the
 * game is over pay, more for more lines and most of all for the full card.
 *
 * As on the bingo machines it follows (the pinball bingos' 25 holes, Sigma's
 * IC Bingo, Sega's BINGO GALAXY), a ball that drops into a numbered pocket
 * stays there until the game is over: no number comes twice in a game, and
 * the balls that come after it go into the pockets still open. Two OUT
 * gutters at the sides take a ball and give nothing. Three pockets stand in
 * the field among the pins: the two FREE pockets give the ball back with one
 * more (three times a game at most; then their lamps go out and they close),
 * and the CHANCE pocket keeps its ball and starts CHANCE TIME, four balls
 * more (once a game).
 *
 * The chances are published and fixed. Every pocket has a weight, its share
 * of the field's 144 (drawn as its width at the foot of the field), and each
 * ball goes into one of the pockets open at that moment with a chance of its
 * weight over the weights of all of them. Nothing else moves the odds: not
 * the last game, not the medals, not the time. The pocket of every ball of a
 * game is drawn when the game is bet (`drawGame`); the ball is then shot and
 * bounced through the pins to the pocket drawn for it (ballPath.ts).
 *
 * The return of a whole game (`analyzeMachine`) is worked out by dynamic
 * programming over every state a card can be in, not by playing games: the
 * numbers marked (2⁹ of them), the balls still to come, the free balls given
 * and whether CHANCE TIME has come. Nothing here draws anything unless a
 * `random` is passed.
 */

// ── The pockets ─────────────────────────────────────────────────────────────

export type PocketKind = 'number' | 'out' | 'free' | 'chance';

export interface Pocket {
  /** The pocket's name, for the page and for storage. */
  id: string;
  kind: PocketKind;
  /** The number it marks on the card, for a numbered pocket; 0 for the others. */
  number: number;
  /** Its share of the field's `WEIGHT_TOTAL`. */
  weight: number;
}

/**
 * Every pocket of the field. The foot of the field, left to right: an OUT
 * gutter, the numbers 1 to 9, the other OUT gutter. Then the three pockets
 * among the pins: FREE on the left, CHANCE in the middle, FREE on the right.
 * The middle numbers are a little more likely than the ends, as on any field
 * of pins a ball falls down the middle of.
 */
export const POCKETS: readonly Pocket[] = [
  { id: 'out-l', kind: 'out', number: 0, weight: 24 },
  { id: 'n1', kind: 'number', number: 1, weight: 8 },
  { id: 'n2', kind: 'number', number: 2, weight: 9 },
  { id: 'n3', kind: 'number', number: 3, weight: 10 },
  { id: 'n4', kind: 'number', number: 4, weight: 11 },
  { id: 'n5', kind: 'number', number: 5, weight: 12 },
  { id: 'n6', kind: 'number', number: 6, weight: 11 },
  { id: 'n7', kind: 'number', number: 7, weight: 10 },
  { id: 'n8', kind: 'number', number: 8, weight: 9 },
  { id: 'n9', kind: 'number', number: 9, weight: 8 },
  { id: 'out-r', kind: 'out', number: 0, weight: 24 },
  { id: 'free-l', kind: 'free', number: 0, weight: 3 },
  { id: 'chance', kind: 'chance', number: 0, weight: 2 },
  { id: 'free-r', kind: 'free', number: 0, weight: 3 },
];

/** The pockets at the foot of the field, left to right (the gutters and the numbers), by their place in `POCKETS`. */
export const FOOT: readonly number[] = POCKETS.map((_, i) => i).filter((i) => POCKETS[i].kind === 'number' || POCKETS[i].kind === 'out');
/** The pockets among the pins, by their place in `POCKETS`. */
export const FIELD_POCKETS: readonly number[] = POCKETS.map((_, i) => i).filter((i) => POCKETS[i].kind === 'free' || POCKETS[i].kind === 'chance');

/** The weights of every pocket together: each ball's chances are out of this, while every pocket is open. */
export const WEIGHT_TOTAL = POCKETS.reduce((sum, pocket) => sum + pocket.weight, 0);

/** The place in `POCKETS` of the pocket that marks number `n`. */
export const pocketOfNumber = (n: number): number => POCKETS.findIndex((pocket) => pocket.kind === 'number' && pocket.number === n);

// ── The game ────────────────────────────────────────────────────────────────

/** Medals that can be bet on a game: one, two or three, every payout times the bet, so the odds are the same on each. */
export const BET_OPTIONS = [1, 2, 3] as const;
export type Bet = (typeof BET_OPTIONS)[number];
export const isBet = (value: unknown): value is Bet => BET_OPTIONS.includes(value as Bet);

/** Balls a game starts with. */
export const BALLS_PER_GAME = 5;
/** Free balls a game gives at most. After the last, the FREE pockets close. */
export const FREE_MOST = 3;
/** A FREE pocket gives the ball back and one more: the balls to come are one more than before it was shot. */
export const FREE_GIVES = 1;
/** The CHANCE pocket keeps its ball and gives four more: three more to come than before it was shot. */
export const CHANCE_BALLS = 4;
/** The most balls a game can have still to come: its five, a ball for each free ball, three for CHANCE TIME. */
export const MOST_LEFT = BALLS_PER_GAME + FREE_MOST * FREE_GIVES + CHANCE_BALLS - 1;
/** The most balls a game can shoot: every one that lands somewhere that is not a FREE pocket, and the free balls' own. */
export const MOST_SHOTS = MOST_LEFT + FREE_MOST + 1;

/** The card: its numbers row by row, top left first. Every row, column and diagonal adds up to 15. */
export const CARD: readonly number[] = [2, 7, 6, 9, 5, 1, 4, 3, 8];
/** The card's eight lines, as the places of their cells on the card: three rows, three columns, two diagonals. */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** A set of numbers marked, as bits: number n is bit n − 1. */
export type Marks = number;
export const FULL_CARD: Marks = 0b111_111_111;
const bitOf = (n: number): number => 1 << (n - 1);
/** Each line as the numbers it needs, as bits. */
export const LINE_MARKS: readonly Marks[] = LINES.map((cells) => cells.reduce((bits, cell) => bits | bitOf(CARD[cell]), 0));

/** The lines a card holds with `marks`, by their place in `LINES`. */
export const linesHeld = (marks: Marks): number[] => LINE_MARKS.flatMap((line, i) => ((marks & line) === line ? [i] : []));
/** How many lines a card holds. */
export const linesOf = (marks: Marks): number => LINE_MARKS.reduce((count, line) => count + ((marks & line) === line ? 1 : 0), 0);
/** The numbers that would finish a line (リーチ): a line two of whose three are marked. */
export const reachOf = (marks: Marks): number[] => {
  const numbers = new Set<number>();
  for (const line of LINE_MARKS) {
    const missing = line & ~marks;
    if (missing !== 0 && (missing & (missing - 1)) === 0) numbers.add(Math.log2(missing) + 1);
  }
  return [...numbers].sort((a, b) => a - b);
};
export const countMarks = (marks: Marks): number => {
  let count = 0;
  for (let bits = marks; bits; bits &= bits - 1) count += 1;
  return count;
};

/** What a card pays, a medal bet, by the lines it holds when the game is over. Seven lines cannot be held on a 3 × 3 card. */
export const PAY_TABLE: readonly { lines: number; pays: number }[] = [
  { lines: 1, pays: 2 },
  { lines: 2, pays: 4 },
  { lines: 3, pays: 10 },
  { lines: 4, pays: 25 },
  { lines: 5, pays: 50 },
  { lines: 6, pays: 100 },
  { lines: 8, pays: 500 },
];
/** The lines of a full card: all eight. */
export const FULL_CARD_LINES = 8;
/** What a card holding `lines` lines pays a medal bet. */
export const paysFor = (lines: number): number => PAY_TABLE.find((row) => row.lines === lines)?.pays ?? 0;
/** What a game's card pays, for `bet` medals. */
export const winOf = (marks: Marks, bet: number): number => paysFor(linesOf(marks)) * bet;
/** The most a game can pay: the full card on the biggest bet. */
export const MOST_WIN = paysFor(FULL_CARD_LINES) * Math.max(...BET_OPTIONS);

/** Where a game stands after some of its balls. */
export interface GameState {
  /** The numbers marked. */
  marks: Marks;
  /** The balls still to come. */
  left: number;
  /** The free balls given so far. */
  frees: number;
  /** Whether CHANCE TIME has come. */
  chance: boolean;
  /** The balls shot so far. */
  shots: number;
}

export const START: GameState = { marks: 0, left: BALLS_PER_GAME, frees: 0, chance: false, shots: 0 };

/** Whether a game is over: no balls left, or every number marked (nothing more to mark). */
export const over = (state: GameState): boolean => state.left <= 0 || state.marks === FULL_CARD;

/** Whether a pocket can take a ball now: a number not yet marked, a FREE pocket while free balls are left to give, CHANCE before it has come, and OUT always. */
export function isOpen(state: GameState, pocket: number): boolean {
  const p = POCKETS[pocket];
  if (!p) return false;
  switch (p.kind) {
    case 'number':
      return (state.marks & bitOf(p.number)) === 0;
    case 'free':
      return state.frees < FREE_MOST;
    case 'chance':
      return !state.chance;
    case 'out':
      return true;
  }
}

/** The pockets open now, by their place in `POCKETS`. */
export const openPockets = (state: GameState): number[] => POCKETS.map((_, i) => i).filter((i) => isOpen(state, i));
/** The weights of the pockets open now: each ball's chances are out of this. */
export const openWeight = (state: GameState): number => openPockets(state).reduce((sum, i) => sum + POCKETS[i].weight, 0);

/** Where the game stands once a ball has gone into `pocket` (which must be open). */
export function after(state: GameState, pocket: number): GameState {
  const p = POCKETS[pocket];
  const shots = state.shots + 1;
  switch (p.kind) {
    case 'number':
      return { ...state, marks: state.marks | bitOf(p.number), left: state.left - 1, shots };
    case 'out':
      return { ...state, left: state.left - 1, shots };
    case 'free':
      return { ...state, left: state.left + FREE_GIVES, frees: state.frees + 1, shots };
    case 'chance':
      return { ...state, left: state.left - 1 + CHANCE_BALLS, chance: true, shots };
  }
}

/**
 * The pocket a ball goes into, from a random number in [0, 1): the open
 * pockets laid end to end in the order of `POCKETS`, each as long as its
 * weight, and the number read off as a point along them.
 */
export function pocketFrom(state: GameState, r: number): number {
  const open = openPockets(state);
  const total = open.reduce((sum, i) => sum + POCKETS[i].weight, 0);
  let at = Math.min(total - 1e-9, Math.max(0, r * total));
  for (const i of open) {
    if (at < POCKETS[i].weight) return i;
    at -= POCKETS[i].weight;
  }
  return open[open.length - 1];
}

/** A random number that `pocketFrom` turns into `pocket` (the middle of its stretch), for a test that wants a ball to go there. */
export function randomFor(state: GameState, pocket: number): number {
  const open = openPockets(state);
  const total = open.reduce((sum, i) => sum + POCKETS[i].weight, 0);
  let start = 0;
  for (const i of open) {
    if (i === pocket) return (start + POCKETS[i].weight / 2) / total;
    start += POCKETS[i].weight;
  }
  throw new Error(`pocket ${pocket} is not open`);
}

/** The pocket of every ball of a game, drawn at once, as the game is bet: one random number a ball. */
export function drawGame(random: () => number): number[] {
  const draws: number[] = [];
  let state = START;
  while (!over(state)) {
    const pocket = pocketFrom(state, random());
    draws.push(pocket);
    state = after(state, pocket);
  }
  return draws;
}

/** The random numbers that make `drawGame` draw exactly `draws` (each the middle of its pocket's stretch): for tests. */
export function randomsFor(draws: readonly number[]): number[] {
  const out: number[] = [];
  let state = START;
  for (const pocket of draws) {
    out.push(randomFor(state, pocket));
    state = after(state, pocket);
  }
  return out;
}

/**
 * A game's draws played out: where it stood before each ball and at the end.
 * Null for anything that is not a whole game a machine could have drawn: a
 * ball into a pocket that was closed, a ball after the game was over, a game
 * not over at its last ball.
 */
export function playOut(draws: readonly number[]): { states: GameState[]; end: GameState } | null {
  if (!Array.isArray(draws) || draws.length > MOST_SHOTS) return null;
  const states: GameState[] = [];
  let state = START;
  for (const pocket of draws) {
    if (!Number.isInteger(pocket) || over(state) || !isOpen(state, pocket)) return null;
    states.push(state);
    state = after(state, pocket);
  }
  if (!over(state)) return null;
  return { states, end: state };
}

/** Where a game stands after its first `shown` balls. */
export function stateAfter(draws: readonly number[], shown: number): GameState {
  let state = START;
  for (const pocket of draws.slice(0, Math.max(0, shown))) state = after(state, pocket);
  return state;
}

// ── Exact odds ──────────────────────────────────────────────────────────────

/** What a game comes to, and its chance. */
export interface LineOdds {
  lines: number;
  /** The chance a game ends with exactly this many lines. */
  chance: number;
  /** What it pays a medal bet. */
  pays: number;
  /** What it adds to the return, a medal bet. */
  share: number;
}

export interface MachineOdds {
  /** Medals back for every medal bet, on average: the same on every bet. */
  rtp: number;
  /** The rest, kept by the machine. */
  edge: number;
  /** The chance of a game ending with 0, 1, 2 … 8 lines, with what each pays. */
  lines: LineOdds[];
  /** The chance a game pays anything. */
  hit: number;
  /** The chance of a full card. */
  fullCard: number;
  /** The chance CHANCE TIME comes in a game. */
  chanceTime: number;
  /** The chance of a game with at least one free ball. */
  anyFree: number;
  /** Free balls a game, on average. */
  meanFrees: number;
  /** Balls shot a game, on average. */
  meanShots: number;
  /** Numbers marked a game, on average. */
  meanMarks: number;
  /** The return of the games in which CHANCE TIME came, as a share of the whole return. */
  chanceShare: number;
  /** The spread of what a game pays, a medal bet. */
  sd: number;
  /** Games before the return seen is within a point of `rtp` 95 times in 100 (a normal approximation, (1.96 σ / 0.01)²). */
  gamesForOnePercent: number;
  /** How many states of a game the reckoning went through. */
  states: number;
}

/**
 * A game's state packed into one whole number, for the reckoning: the marks
 * in bits 0–8, the balls to come in 9–12, the free balls given in 13–14 and
 * CHANCE TIME in 15.
 */
export const packState = (s: GameState): number => s.marks | (s.left << 9) | (s.frees << 13) | ((s.chance ? 1 : 0) << 15);
/** Where a game ends, for the reckoning: its lines (0 to 8), and whether CHANCE TIME came. */
const ENDS = 9 * 2;

/**
 * The reckoning: for every state a game can reach from its start, the chance
 * of each end, and what is still to come on average (balls shot, free balls,
 * numbers marked at the end, the chance of no free ball at all). A state's
 * figures are its next ball's pockets' figures, each by the pocket's chance:
 * dynamic programming, from the states where the game is over back to its
 * start. A ball into a FREE pocket gives the ball back and one more, so the
 * balls to come can go up; but every ball either marks a number, uses one of
 * the three free balls, uses CHANCE or is gone for good, so every path ends
 * and no state is met twice on one.
 */
function reckonAll() {
  const slotOf = new Int32Array(1 << 16).fill(-1);
  let size = 0;
  let room = 4096;
  let ends = new Float64Array(room * ENDS);
  let shots = new Float64Array(room);
  let frees = new Float64Array(room);
  let marks = new Float64Array(room);
  let noFree = new Float64Array(room);
  const grow = () => {
    room *= 2;
    const bigger = (old: Float64Array, width: number) => {
      const next = new Float64Array(room * width);
      next.set(old);
      return next;
    };
    ends = bigger(ends, ENDS);
    shots = bigger(shots, 1);
    frees = bigger(frees, 1);
    marks = bigger(marks, 1);
    noFree = bigger(noFree, 1);
  };
  const weights = POCKETS.map((p) => p.weight);
  const kinds = POCKETS.map((p) => p.kind);
  const bits = POCKETS.map((p) => (p.kind === 'number' ? bitOf(p.number) : 0));

  const visit = (key: number): number => {
    const known = slotOf[key];
    if (known >= 0) return known;
    const m = key & 0x1ff;
    const left = (key >> 9) & 0xf;
    const given = (key >> 13) & 0x3;
    const chance = (key >> 15) & 1;
    // Its own slot first, so that the slots of what comes after it are filled in after it (the arrays may grow meanwhile).
    if (size === room) grow();
    const slot = size++;
    slotOf[key] = slot;
    if (left <= 0 || m === FULL_CARD) {
      ends[slot * ENDS + linesOf(m) * 2 + chance] = 1;
      marks[slot] = countMarks(m);
      noFree[slot] = 1;
      return slot;
    }
    let total = 0;
    for (let i = 0; i < weights.length; i++) {
      const kind = kinds[i];
      const open = kind === 'out' || (kind === 'number' && (m & bits[i]) === 0) || (kind === 'free' && given < FREE_MOST) || (kind === 'chance' && chance === 0);
      if (open) total += weights[i];
    }
    let s = 1;
    let f = 0;
    let k = 0;
    let n = 0;
    const sum = new Float64Array(ENDS);
    for (let i = 0; i < weights.length; i++) {
      const kind = kinds[i];
      let next: number;
      if (kind === 'out') next = m | ((left - 1) << 9) | (given << 13) | (chance << 15);
      else if (kind === 'number') {
        if ((m & bits[i]) !== 0) continue;
        next = (m | bits[i]) | ((left - 1) << 9) | (given << 13) | (chance << 15);
      } else if (kind === 'free') {
        if (given >= FREE_MOST) continue;
        next = m | ((left + FREE_GIVES) << 9) | ((given + 1) << 13) | (chance << 15);
      } else {
        if (chance !== 0) continue;
        next = m | ((left - 1 + CHANCE_BALLS) << 9) | (given << 13) | (1 << 15);
      }
      const p = weights[i] / total;
      const at = visit(next);
      for (let e = 0; e < ENDS; e++) sum[e] += p * ends[at * ENDS + e];
      s += p * shots[at];
      f += p * (frees[at] + (kind === 'free' ? 1 : 0));
      k += p * marks[at];
      if (kind !== 'free') n += p * noFree[at];
    }
    ends.set(sum, slot * ENDS);
    shots[slot] = s;
    frees[slot] = f;
    marks[slot] = k;
    noFree[slot] = n;
    return slot;
  };
  const start = visit(packState(START));
  return { ends: ends.slice(start * ENDS, start * ENDS + ENDS), shots: shots[start], frees: frees[start], marks: marks[start], noFree: noFree[start], states: size };
}

let analyzed: MachineOdds | null = null;

/** The machine's exact odds, worked out once (in a few tens of milliseconds), and kept. */
export function analyzeMachine(): MachineOdds {
  if (analyzed) return analyzed;
  const reckoned = reckonAll();
  const byLines = Array.from({ length: 9 }, (_, lines) => reckoned.ends[lines * 2] + reckoned.ends[lines * 2 + 1]);
  const chanceTime = byLines.reduce((sum, _, lines) => sum + reckoned.ends[lines * 2 + 1], 0);
  const chanceReturn = byLines.reduce((sum, _, lines) => sum + reckoned.ends[lines * 2 + 1] * paysFor(lines), 0);
  const rtp = byLines.reduce((sum, p, lines) => sum + p * paysFor(lines), 0);
  const square = byLines.reduce((sum, p, lines) => sum + p * paysFor(lines) ** 2, 0);
  const sd = Math.sqrt(Math.max(0, square - rtp * rtp));
  analyzed = {
    rtp,
    edge: 1 - rtp,
    lines: byLines.map((chance, lines) => ({ lines, chance, pays: paysFor(lines), share: chance * paysFor(lines) })),
    hit: 1 - byLines[0],
    fullCard: byLines[FULL_CARD_LINES],
    chanceTime,
    anyFree: 1 - reckoned.noFree,
    meanFrees: reckoned.frees,
    meanShots: reckoned.shots,
    meanMarks: reckoned.marks,
    chanceShare: chanceReturn / rtp,
    sd,
    gamesForOnePercent: Math.ceil(((1.96 * sd) / 0.01) ** 2),
    states: reckoned.states,
  };
  return analyzed;
}

// ── Games played, for a check ───────────────────────────────────────────────

/** A random number generator with a seed, so that a run can be made again and come out the same (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plays `games` games a medal bet with `random`, and says what came back: a check on the reckoning, never its source. */
export function simulateGames(games: number, random: () => number): { games: number; back: number; byLines: number[]; chanceTimes: number } {
  const byLines = new Array<number>(9).fill(0);
  let back = 0;
  let chanceTimes = 0;
  for (let g = 0; g < games; g++) {
    const draws = drawGame(random);
    const end = stateAfter(draws, draws.length);
    const lines = linesOf(end.marks);
    byLines[lines] += 1;
    back += paysFor(lines);
    if (end.chance) chanceTimes += 1;
  }
  return { games, back, byLines, chanceTimes };
}
