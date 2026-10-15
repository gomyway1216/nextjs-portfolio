/**
 * The rules of Calico Janken (みけじゃんけん), and their exact odds.
 *
 * A candy-shop janken machine: a medal goes in, the cat calls
 * "jan, ken…", the player presses rock, scissors or paper, and the cat shows
 * its own hand. A win spins the ring of lamps round the cat's face and pays
 * the number the light stops on; a draw is thrown again for nothing; a loss
 * pays nothing. After a win the player may double up: the medals won are put
 * on one more throw, which doubles them, throws again on a draw, and loses
 * them on a loss.
 *
 * The cat's hand is drawn fairly: rock, scissors and paper a third each,
 * whatever the player presses and whatever went before. It is drawn when the
 * player's hand is pressed, never before, so it is nowhere to be found while
 * the cat is calling. The lamp is drawn the same way, every lamp of the ring
 * as likely as any other, so a lamp's chance can be counted on the ring.
 *
 * Everything here is arithmetic: nothing is drawn unless a `random` is passed.
 */

export type Hand = 'gu' | 'choki' | 'pa';
/** The three hands in the order their buttons stand, and the order a random number in [0, 1) is cut into thirds. */
export const HANDS: readonly Hand[] = ['gu', 'choki', 'pa'];
export type Outcome = 'win' | 'draw' | 'lose';

/** What each hand beats: rock blunts scissors, scissors cut paper, paper wraps rock. */
export const BEATS: Readonly<Record<Hand, Hand>> = { gu: 'choki', choki: 'pa', pa: 'gu' };

/** How the player's hand does against the cat's. */
export const judge = (player: Hand, machine: Hand): Outcome => (player === machine ? 'draw' : BEATS[player] === machine ? 'win' : 'lose');

/** The cat's hand from a random number in [0, 1): each third of the range one hand, in the order of `HANDS`. */
export const handFrom = (r: number): Hand => HANDS[Math.min(HANDS.length - 1, Math.max(0, Math.floor(r * HANDS.length)))];

/** The cat's hand, drawn. Called when the player presses theirs. */
export const drawHand = (random: () => number): Hand => handFrom(random());

// ── The ring of lamps ───────────────────────────────────────────────────────

/**
 * The lamps round the cat's face, clockwise from the top, each with the
 * medals it pays. Thirty lamps: twenty of 1, five of 2, three of 3, one of 5
 * and one of 10. The roulette stops on any one of them as likely as any other.
 */
export const LAMPS: readonly number[] = (() => {
  const ring = new Array<number>(30).fill(1);
  ring[0] = 10;
  ring[15] = 5;
  for (const at of [6, 21, 27]) ring[at] = 3;
  for (const at of [3, 9, 12, 18, 24]) ring[at] = 2;
  return ring;
})();

/** The values a lamp can pay, smallest first. */
export const VALUES: readonly number[] = [...new Set(LAMPS)].sort((a, b) => a - b);

/** The lamp the roulette stops on, from a random number in [0, 1): the ring cut into equal parts. */
export const lampFrom = (r: number): number => Math.min(LAMPS.length - 1, Math.max(0, Math.floor(r * LAMPS.length)));

/** The lamp the roulette stops on, drawn. Called when a win is thrown, with the throw. */
export const drawLamp = (random: () => number): number => lampFrom(random());

/** How many double-ups in a row a win can have: at most sixteen times the roulette's medals. */
export const MAX_DOUBLES = 4;

// ── Exact odds ──────────────────────────────────────────────────────────────

/** A fraction in lowest terms. */
export interface Fraction {
  num: number;
  den: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const fraction = (num: number, den: number): Fraction => {
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
};
export const valueOf = (f: Fraction): number => f.num / f.den;

export interface ValueOdds {
  /** Medals the lamp pays. */
  medals: number;
  /** Lamps of the ring that pay it. */
  lamps: number;
  /** Its chance when the roulette spins: lamps out of the ring. */
  perWin: Fraction;
  /** Its chance for every medal put in: half of that, as half the medals end in a win. */
  perMedal: Fraction;
  /** What it adds to the return: medals back per medal put in, from this lamp alone. */
  share: Fraction;
}

export interface MachineOdds {
  /** One throw: whatever the player presses, the cat's hand wins, draws and loses a third each. */
  throw: Record<Outcome, Fraction>;
  /** One medal, with every draw thrown again: a win or a loss, half and half. */
  medal: { win: Fraction; lose: Fraction };
  /** How many throws a medal takes, on average: a draw is thrown again. */
  throwsPerMedal: Fraction;
  values: ValueOdds[];
  /** The medals a win pays on average. */
  meanWin: Fraction;
  /** Medals back for every medal put in, on average, never doubling up. */
  rtp: Fraction;
  /** The rest: medals the machine keeps, per medal. */
  edge: Fraction;
}

/**
 * The machine's exact odds. A medal's throws end at the first that is not a
 * draw, and that one is a win or a loss as likely as each other: the chance
 * of a win is a third, plus a third of a draw times the same chance again, so
 * a half. A win pays a lamp's medals, each lamp a thirtieth.
 */
export function analyzeMachine(): MachineOdds {
  const third = fraction(1, 3);
  const n = LAMPS.length;
  const values: ValueOdds[] = VALUES.map((medals) => {
    const lamps = LAMPS.filter((value) => value === medals).length;
    return { medals, lamps, perWin: fraction(lamps, n), perMedal: fraction(lamps, 2 * n), share: fraction(lamps * medals, 2 * n) };
  });
  const total = LAMPS.reduce((sum, value) => sum + value, 0);
  const rtp = fraction(total, 2 * n);
  return {
    throw: { win: third, draw: third, lose: third },
    medal: { win: fraction(1, 2), lose: fraction(1, 2) },
    throwsPerMedal: fraction(3, 2),
    values,
    meanWin: fraction(total, n),
    rtp,
    edge: fraction(rtp.den - rtp.num, rtp.den),
  };
}

/**
 * What one medal pays, as chances of each payout, for a player who doubles
 * up `doubles` times after every win (and collects after that many, or at
 * once with 0). Each double-up keeps the medals half the time and doubles
 * them, so it changes how a medal's return is spread, never how much it is.
 */
export function payoutsOf(doubles: number): { medals: number; chance: Fraction }[] {
  const k = Math.max(0, Math.min(MAX_DOUBLES, Math.floor(doubles)));
  const n = LAMPS.length;
  // Out of 2n · 2^k equally likely ends: a loss in the first throw (n · 2^k of them), a win on lamp L kept through
  // all k double-ups (one each), and a win lost in one of the double-ups (2^k − 1 of each lamp's).
  const den = 2 * n * 2 ** k;
  const counts = new Map<number, number>();
  counts.set(0, n * 2 ** k + n * (2 ** k - 1));
  for (const value of LAMPS) counts.set(value * 2 ** k, (counts.get(value * 2 ** k) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([medals, count]) => ({ medals, chance: fraction(count, den) }));
}

/** The mean and spread of what one medal pays, for a player who doubles up `doubles` times after every win. */
export function spreadOf(doubles: number): { mean: number; variance: number; sd: number } {
  const payouts = payoutsOf(doubles);
  const mean = payouts.reduce((sum, { medals, chance }) => sum + medals * valueOf(chance), 0);
  const square = payouts.reduce((sum, { medals, chance }) => sum + medals * medals * valueOf(chance), 0);
  const variance = square - mean * mean;
  return { mean, variance, sd: Math.sqrt(variance) };
}

// ── Sessions, for the Odds tab ──────────────────────────────────────────────

/** A random number generator with a seed, so that a simulation can be run again and come out the same (mulberry32). */
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

/**
 * One medal played through, the way the machine plays it: throws until one
 * is not a draw (the player always pressing rock: the cat's hand does not
 * care), the roulette on a win, then `doubles` double-ups. Returns the
 * medals it pays.
 */
export function playMedal(random: () => number, doubles = 0, press: Hand = 'gu'): number {
  let outcome: Outcome;
  do outcome = judge(press, drawHand(random));
  while (outcome === 'draw');
  if (outcome === 'lose') return 0;
  let won = LAMPS[drawLamp(random)];
  for (let round = 0; round < Math.min(MAX_DOUBLES, doubles); round++) {
    let again: Outcome;
    do again = judge(press, drawHand(random));
    while (again === 'draw');
    if (again === 'lose') return 0;
    won *= 2;
  }
  return won;
}

export interface SessionSummary {
  /** How many medals each session played. */
  medals: number;
  sessions: number;
  /** What each session ended with, less what it put in: medals ahead (above 0) or behind. */
  nets: number[];
  meanNet: number;
  /** Share of the sessions that ended with more medals than they put in. */
  ahead: number;
  /** Medals back per medal put in, over every session together. */
  rtp: number;
}

/** Plays `sessions` sessions of `medals` medals each, every medal as `playMedal` plays it. */
export function simulateSessions(medals: number, sessions: number, doubles: number, random: () => number): SessionSummary {
  const nets: number[] = [];
  let back = 0;
  for (let s = 0; s < sessions; s++) {
    let won = 0;
    for (let m = 0; m < medals; m++) won += playMedal(random, doubles);
    back += won;
    nets.push(won - medals);
  }
  const meanNet = nets.reduce((sum, net) => sum + net, 0) / Math.max(1, sessions);
  return { medals, sessions, nets, meanNet, ahead: nets.filter((net) => net > 0).length / Math.max(1, sessions), rtp: back / Math.max(1, medals * sessions) };
}
