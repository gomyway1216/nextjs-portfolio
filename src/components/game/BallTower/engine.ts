/**
 * Firework Ball Tower (花火ボールタワー): the rules, the tower, and their exact
 * odds.
 *
 * The big medal machines of a Japanese game floor are built round a lottery
 * the whole cabinet watches, played from seats round it. In the bet machines
 * of this kind (Sega's 100&メダル series: KAZAAAN!! of 2010 and the machines
 * after it), a player bets up to 99 medals on a ball, and the ball goes round
 * a ring of pockets level by level: an UP pocket takes it on to the next
 * level, OUT ends the run, and every other pocket pays a multiple of the bet
 * (a "?" pocket a multiple a lamp roulette picks). Each level has fewer
 * pockets and fewer UPs than the one before it, and only a run that goes UP
 * at every level reaches the jackpot pocket on the last. This tower is built
 * the same way (the sources are in the PR), with a firework festival's look,
 * names and numbers of the floor's own: the ball is sent up a lift to the top
 * of a glass tower and comes down it over five turning discs.
 *
 * ## The tower
 *
 * Five discs, one above another (`DISCS`), each with its pockets round its
 * rim, every pocket of a disc as wide as the others:
 *
 * 1. **18 pockets:** 6 UP, 12 OUT.
 * 2. **15 pockets:** 3 UP, ×1, ×2 twice, ×3, three "?", 5 OUT.
 * 3. **6 pockets:** CHANCE (an UP that opens the jackpot chance), ×3 twice,
 *    ×6 twice, "?".
 * 4. **6 pockets:** CHANCE, ×6 twice, ×12 twice, "?".
 * 5. **6 pockets:** JP, ×15 twice, ×30 twice, "?".
 *
 * A "?" pocket lights its disc's lamp roulette (`LAMP_SETS`), which runs and
 * stops on one of its lamps, each as likely: the multiple it pays. The jackpot
 * (`JACKPOT`) is 300 times the bet.
 *
 * Every figure is a multiple of the bet: a ball takes 1, 2, 3, 5 or 10 medals
 * (`BETS`), and every pocket pays its multiple times the bet. So no bet is
 * better than another: every one brings back exactly 9/10 of the medals
 * played (`analyze`, which works it out for each bet all the same).
 *
 * ## The draw
 *
 * As on the real machines, the run is a lottery the tower then shows. The
 * moment START is pressed, ten random numbers in [0, 1) are drawn, always ten
 * and in this order: for each disc, top to bottom, the pocket the ball settles
 * in (each pocket of the disc as likely as any other), then the lamp its
 * roulette stops on (each lamp as likely). A disc the ball never reaches, and
 * a roulette that is never lit, keep their numbers unused (`drawRun`). The
 * tower only plays out what was drawn: nothing is drawn as the ball comes
 * down, and Skip only takes it to its end the sooner.
 *
 * ## The odds
 *
 * The run is a Markov chain over the discs: its state is the disc the ball is
 * on, and each of the disc's pockets, 1 in its count, ends the run with what
 * it pays or drops the ball to the next disc. `analyze` works out, exactly, as
 * fractions of BigInts, what each state is worth (backward, from the bottom
 * disc up: `worthFrom`) and how likely each ending is (forward, from the top):
 * the return, the chance of reaching each disc, of every pocket, and of the
 * jackpot.
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── The bets ────────────────────────────────────────────────────────────────

/** The medals a ball can take: the seat's bet buttons. Every pocket pays its multiple times the bet. */
export const BETS = [1, 2, 3, 5, 10] as const;
export type Bet = (typeof BETS)[number];
export const isBet = (value: unknown): value is Bet => (BETS as readonly unknown[]).includes(value);
/** The most a ball takes. */
export const BET_MOST: Bet = 10;

// ── The tower ───────────────────────────────────────────────────────────────

/**
 * A pocket: an UP hole through to the disc below (`up`; on the third and fourth discs it is the jackpot CHANCE), a
 * pocket that pays its multiple of the bet and ends the run (`pay`), a "?" pocket whose multiple the disc's lamp
 * roulette picks (`mystery`), the jackpot (`jackpot`), or OUT, which ends it with nothing (`out`).
 */
export type Pocket = { kind: 'up' } | { kind: 'out' } | { kind: 'mystery' } | { kind: 'jackpot' } | { kind: 'pay'; pays: number };
export type PocketKind = Pocket['kind'];

/** The jackpot: 300 times the bet. */
export const JACKPOT = 300;

const UP: Pocket = { kind: 'up' };
const OUT: Pocket = { kind: 'out' };
const ASK: Pocket = { kind: 'mystery' };
const JP: Pocket = { kind: 'jackpot' };
const X = (pays: number): Pocket => ({ kind: 'pay', pays });

/** The five discs, top first, each pocket in its order round the rim. */
export const DISCS: readonly (readonly Pocket[])[] = [
  [UP, OUT, OUT, UP, OUT, OUT, UP, OUT, OUT, UP, OUT, OUT, UP, OUT, OUT, UP, OUT, OUT],
  [UP, X(1), OUT, ASK, OUT, UP, X(2), OUT, ASK, OUT, UP, X(3), ASK, X(2), OUT],
  [UP, X(3), X(6), ASK, X(3), X(6)],
  [UP, X(6), X(12), ASK, X(6), X(12)],
  [JP, X(15), X(30), ASK, X(15), X(30)],
];

/**
 * Each disc's lamp roulette, which a ball in a "?" pocket lights: the multiples on its lamps, each lamp as likely. The
 * top disc has no "?" pocket, and no roulette.
 */
export const LAMP_SETS: readonly (readonly number[])[] = [[], [1, 1, 1, 2, 2, 3, 3, 5, 5, 10], [3, 3, 5, 5, 5, 6, 8, 10, 12, 15], [6, 6, 8, 10, 12, 20, 20, 30], [15, 20, 20, 25, 30, 30, 50, 50]];

/** How many discs the ball can come down. */
export const LEVELS = DISCS.length;
/** How many pockets each disc has, top first. */
export const POCKETS: readonly number[] = DISCS.map((disc) => disc.length);
/** How many lamps each disc's roulette has: none on the top disc, drawn all the same from one. */
export const LAMPS: readonly number[] = LAMP_SETS.map((set) => Math.max(1, set.length));
/** The first disc of the jackpot chance: a ball that drops onto it has gone UP on every disc above. */
export const CHANCE_LEVEL = 3;

/** The most a ball pays per medal bet: the jackpot. */
export const PAYS_MOST = Math.max(JACKPOT, ...LAMP_SETS.flat(), ...DISCS.flat().map((p) => (p.kind === 'pay' ? p.pays : 0)));
/** The most a ball can pay: the jackpot on the biggest bet. */
export const MOST_WIN = PAYS_MOST * BET_MOST;

// ── The draw ────────────────────────────────────────────────────────────────

/** Everything random about a run, drawn as its medals go in: the pocket on each disc, top first, and the lamp each disc's roulette stops on. */
export interface Draw {
  pockets: number[];
  lamps: number[];
}

/** How many numbers in [0, 1) a draw takes: two a disc, always. */
export const DRAW_NUMBERS = LEVELS * 2;

const pick = (n: number, of: number): number => Math.min(of - 1, Math.max(0, Math.floor(n * of)));

/** A run's draw, from `DRAW_NUMBERS` random numbers in [0, 1): for each disc in turn, top first, its pocket and its roulette's lamp. */
export function drawRun(random: () => number): Draw {
  const draw: Draw = { pockets: [], lamps: [] };
  for (let level = 0; level < LEVELS; level++) {
    draw.pockets.push(pick(random(), POCKETS[level]));
    draw.lamps.push(pick(random(), LAMPS[level]));
  }
  return draw;
}

/** The number in [0, 1) that draws `value` of `of`. */
const numberFor = (value: number, of: number): number => (value + 0.5) / of;
/** The numbers that draw `draw`, in the order `drawRun` takes them. */
export const numbersFor = (draw: Draw): number[] => draw.pockets.flatMap((pocket, level) => [numberFor(pocket, POCKETS[level]), numberFor(draw.lamps[level], LAMPS[level])]);

const isWhole = (value: unknown, below: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;

/** Whether a value is a draw the machine could have made. */
export function isDraw(value: unknown): value is Draw {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { pockets, lamps } = value as Record<string, unknown>;
  const list = (v: unknown, counts: readonly number[]) => Array.isArray(v) && v.length === LEVELS && v.every((n, level) => isWhole(n, counts[level]));
  return list(pockets, POCKETS) && list(lamps, LAMPS);
}
export const copyDraw = (draw: Draw): Draw => ({ pockets: [...draw.pockets], lamps: [...draw.lamps] });

// ── A run ───────────────────────────────────────────────────────────────────

/** The ball on one disc: the pocket it settled in, what kind it is, the lamp its roulette stopped on (a "?" pocket), and what it pays per medal bet. */
export interface Stop {
  level: number;
  pocket: number;
  kind: PocketKind;
  /** The lamp the roulette stopped on, for a "?" pocket; null otherwise. */
  lamp: number | null;
  pays: number;
}

/** A run played out from its draw: every disc the ball settled on, top first, and what it pays per medal bet. */
export interface Run {
  stops: Stop[];
  /** Medals paid for every medal bet: 0 for a run that ended OUT. */
  pays: number;
  jackpot: boolean;
}

/** What the ball does in pocket `pocket` of disc `level`, its roulette stopping on `lamp`. */
export function stopAt(level: number, pocket: number, lamp: number): Stop {
  const p = DISCS[level][pocket];
  if (p.kind === 'pay') return { level, pocket, kind: 'pay', lamp: null, pays: p.pays };
  if (p.kind === 'mystery') return { level, pocket, kind: 'mystery', lamp, pays: LAMP_SETS[level][lamp] };
  if (p.kind === 'jackpot') return { level, pocket, kind: 'jackpot', lamp: null, pays: JACKPOT };
  return { level, pocket, kind: p.kind, lamp: null, pays: 0 };
}

/** The run a draw makes: down the discs from the top, until a pocket that is not UP ends it. */
export function runOf(draw: Draw): Run {
  const stops: Stop[] = [];
  for (let level = 0; level < LEVELS; level++) {
    const stop = stopAt(level, draw.pockets[level], draw.lamps[level]);
    stops.push(stop);
    if (stop.kind !== 'up') return { stops, pays: stop.pays, jackpot: stop.kind === 'jackpot' };
  }
  // The bottom disc has no UP pocket: never reached.
  return { stops, pays: 0, jackpot: false };
}

/** What a run pays on a bet of `bet`. */
export const wonOf = (run: Run, bet: number): number => run.pays * bet;

/** The deepest disc a run reached (0 is the top). */
export const deepestOf = (run: Run): number => run.stops.length - 1;

/** The floor's name for a run's win, where it has one: the jackpot, or any other win in the jackpot chance (the fourth and fifth discs). */
export const labelOf = (run: Run): 'tower-jackpot' | 'tower-chance' | null => (run.jackpot ? 'tower-jackpot' : run.pays > 0 && deepestOf(run) >= CHANCE_LEVEL ? 'tower-chance' : null);

/**
 * A draw that plays out as `kinds`, top first, for the tests and the e2e specs: on each disc the first pocket of the
 * kind asked for (the last one, a `pay` pocket paying `pays` where it is given, and a "?" pocket's roulette stopping on
 * the first lamp of `pays`). The discs after the last are drawn at their first pocket, and every unused lamp at its first.
 */
export function drawFor(kinds: readonly PocketKind[], pays?: number): Draw {
  const draw: Draw = { pockets: [], lamps: [] };
  for (let level = 0; level < LEVELS; level++) {
    const want = kinds[level];
    const last = level === kinds.length - 1;
    let pocket = 0;
    let lamp = 0;
    if (want !== undefined) {
      pocket = DISCS[level].findIndex((p) => p.kind === want && (!last || pays === undefined || p.kind !== 'pay' || p.pays === pays));
      if (want === 'mystery' && last && pays !== undefined) lamp = LAMP_SETS[level].indexOf(pays);
      if (pocket < 0 || lamp < 0) throw new Error(`disc ${level + 1} has no ${want} pocket${pays === undefined ? '' : ` paying ${pays}`}`);
    }
    draw.pockets.push(pocket);
    draw.lamps.push(lamp);
  }
  return draw;
}

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
export const times = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.num, a.den * b.den);
export const less = (a: Fraction, b: Fraction): boolean => a.num * b.den < b.num * a.den;
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};
/** A fraction written as "num/den". */
export const ratioOf = (f: Fraction): string => `${f.num.toString()}/${f.den.toString()}`;

// ── The odds: a Markov chain over the discs ─────────────────────────────────

/** What a pocket of disc `level` is worth per medal bet, ending the run there: its multiple, a "?" pocket's roulette on average. */
export function pocketWorth(level: number, pocket: Pocket): Fraction {
  if (pocket.kind === 'pay') return fraction(pocket.pays);
  if (pocket.kind === 'jackpot') return fraction(JACKPOT);
  if (pocket.kind === 'mystery') return fraction(LAMP_SETS[level].reduce((sum, n) => sum + n, 0), LAMP_SETS[level].length);
  return fraction(0);
}

/**
 * What a ball is worth per medal bet as it drops onto disc `level`, backward from the bottom disc: every pocket of the
 * disc, 1 in its count, is worth what it pays, or, an UP, what the ball is worth on the disc below. The tower's return is
 * the top disc's worth. Exact.
 */
export function worthFrom(level: number): Fraction {
  if (level >= LEVELS) return fraction(0);
  const below = worthFrom(level + 1);
  const sum = DISCS[level].reduce((total, pocket) => add(total, pocket.kind === 'up' ? below : pocketWorth(level, pocket)), fraction(0));
  return fraction(sum.num, sum.den * BigInt(POCKETS[level]));
}

/** The tower's exact odds, per medal bet: what a ball brings back, how far it goes, and how it ends. */
export interface TowerOdds {
  /** Medals back for every medal bet, the same on every bet. */
  back: Fraction;
  /** The return on each bet (`BETS`), each worked out on its own: the same for all. */
  byBet: Fraction[];
  /** The chance of reaching each disc, top first (the top's is 1). */
  reach: Fraction[];
  /** The chance a ball pays anything. */
  hit: Fraction;
  jackpot: Fraction;
  /** The chance of ending in each kind of pocket, on each disc: `ends[level][kind]`. */
  ends: Record<'pay' | 'mystery' | 'jackpot' | 'out', Fraction>[];
  /** What each disc's own pockets bring back, per medal bet. */
  backByLevel: Fraction[];
  /** The chance of each multiple a ball can pay (the jackpot's included), smallest first; a run that pays nothing is left out. */
  pays: { pays: number; chance: Fraction }[];
}

/**
 * The tower's exact odds: the chance of every pocket forward from the top, each pocket of a disc 1 in its count and
 * each lamp of a roulette 1 in its count, and what every ending pays. The return comes out the same both ways: forward,
 * from the chances of every ending, and backward (`worthFrom`). The published test checks that they agree to the last
 * digit, and adds the chances of every ending up to one.
 */
export function analyze(): TowerOdds {
  const zero = () => fraction(0);
  const reach: Fraction[] = [];
  const ends = DISCS.map(() => ({ pay: zero(), mystery: zero(), jackpot: zero(), out: zero() }));
  const backByLevel = DISCS.map(zero);
  const pays = new Map<number, Fraction>();
  const paying = (n: number, chance: Fraction) => {
    if (n > 0) pays.set(n, add(pays.get(n) ?? zero(), chance));
  };
  let back = zero();
  let hit = zero();
  let here = fraction(1);
  for (let level = 0; level < LEVELS; level++) {
    reach.push(here);
    const each = fraction(here.num, here.den * BigInt(POCKETS[level]));
    let down = zero();
    for (const pocket of DISCS[level]) {
      if (pocket.kind === 'up') {
        down = add(down, each);
        continue;
      }
      const end = ends[level];
      end[pocket.kind] = add(end[pocket.kind], each);
      const worth = times(each, pocketWorth(level, pocket));
      back = add(back, worth);
      backByLevel[level] = add(backByLevel[level], worth);
      if (pocket.kind === 'out') continue;
      hit = add(hit, each);
      if (pocket.kind === 'mystery') {
        const lamps = LAMP_SETS[level];
        for (const n of lamps) paying(n, fraction(each.num, each.den * BigInt(lamps.length)));
      } else paying(pocket.kind === 'jackpot' ? JACKPOT : pocket.pays, each);
    }
    here = down;
  }
  // Every bet on its own: what it brings back over what it takes. Every pocket pays its multiple times the bet, so each
  // comes to the same share; worked out all the same, so that a change that made one bet better would show here.
  const byBet = BETS.map((bet) => fraction(back.num * BigInt(bet), back.den * BigInt(bet)));
  const jackpot = ends.reduce((sum, end) => add(sum, end.jackpot), zero());
  return { back, byBet, reach, hit, jackpot, ends, backByLevel, pays: [...pays.entries()].sort(([a], [b]) => a - b).map(([n, chance]) => ({ pays: n, chance })) };
}

/** The best return over every choice a player has (the bet): the floor's `bestReturn` is this, rounded up. */
export const bestBack = (odds: Pick<TowerOdds, 'byBet'>): Fraction => odds.byBet.reduce((best, f) => (less(best, f) ? f : best));

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
  runs: number;
  /** Medals back per medal bet. */
  back: number;
  /** Runs that reached each disc, top first. */
  reached: number[];
  jackpots: number;
}

/** Plays `runs` runs drawn from `random`, as the machine draws them: what came back, to set beside the exact figures. */
export function checkRuns(runs: number, random: () => number): CheckResult {
  let back = 0;
  let jackpots = 0;
  const reached = new Array<number>(LEVELS).fill(0);
  for (let i = 0; i < runs; i++) {
    const run = runOf(drawRun(random));
    back += run.pays;
    if (run.jackpot) jackpots += 1;
    for (let level = 0; level < run.stops.length; level++) reached[level] += 1;
  }
  return { runs, back: back / runs, reached, jackpots };
}
