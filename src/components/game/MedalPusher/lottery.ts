/**
 * The digital half of the machine: the number slot on the centre screen and
 * the three games it leads to — a sugoroku board, a choice of treasure chests,
 * and the roulette a prize ball starts when it is pushed over the front, which
 * ends in a bowl with the jackpot in one of its holes when its run is full.
 * Unlike the field, these are pure lotteries — every result is drawn first and
 * the screen only acts it out — so their odds are exact and are listed on the
 * Odds tab.
 */

export const TIERS = ['miss', 'small', 'big', 'seven'] as const;
export type Tier = (typeof TIERS)[number];

/** Chances out of 1,000 spins. */
export const SPIN_TABLE: Record<Tier, number> = { miss: 938, small: 40, big: 15, seven: 7 };
export const SPIN_TOTAL = 1000;

/** What a line leads to: a roll on the sugoroku board, a choice of chests, or a prize ball on the field. */
export type Bonus = 'sugoroku' | 'chest' | 'ball';
export const TIER_BONUS: Record<Exclude<Tier, 'miss'>, Bonus> = { small: 'sugoroku', big: 'chest', seven: 'ball' };

/** The digits each winning tier can line up. */
export const TIER_DIGITS: Record<Exclude<Tier, 'miss'>, readonly number[]> = {
  small: [2, 4, 6, 8],
  big: [1, 3, 5, 9],
  seven: [7],
};

/** Share of losing spins that tease with two matching digits before missing. */
export const REACH_RATE = 0.15;

export interface SpinResult {
  tier: Tier;
  /** Left, centre and right reel. The centre stops last. */
  digits: [number, number, number];
  /** Whether the left and right reels match, so the centre decides it. */
  reach: boolean;
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
const digit = (rng: () => number): number => 1 + Math.min(8, Math.floor(rng() * 9));

/** The tier a roll lands on, for a roll in [0, 1). */
export function tierFor(roll: number): Tier {
  let threshold = 0;
  for (const tier of ['seven', 'big', 'small'] as const) {
    threshold += SPIN_TABLE[tier] / SPIN_TOTAL;
    if (roll < threshold) return tier;
  }
  return 'miss';
}

/** Draws one spin: the tier first, then digits that show it. */
export function drawSpin(rng: () => number): SpinResult {
  const tier = tierFor(rng());
  if (tier !== 'miss') {
    const d = pick(TIER_DIGITS[tier], rng);
    return { tier, digits: [d, d, d], reach: true };
  }
  const left = digit(rng);
  if (rng() < REACH_RATE) {
    // Two alike and a centre reel that stops one short or one past.
    const centre = ((left - 1 + (rng() < 0.5 ? 1 : 8)) % 9) + 1;
    return { tier, digits: [left, centre, left], reach: true };
  }
  let right = digit(rng);
  if (right === left) right = (right % 9) + 1;
  return { tier, digits: [left, digit(rng), right], reach: false };
}

// ── The sugoroku board ──────────────────────────────────────────────────────

/**
 * The board: a loop of twelve squares, each paying the medals written on it
 * to whoever lands there. The piece stays where it stopped until the next roll.
 */
export const BOARD = [10, 3, 5, 8, 3, 10, 5, 30, 3, 8, 5, 15] as const;
/** The square that pays its medals as a fever: the big one. */
export const FEVER_SQUARE = 7;
export const DIE_FACES = 6;

/** One roll of the die: 1 to 6. */
export const drawDie = (rng: () => number): number => 1 + Math.min(DIE_FACES - 1, Math.floor(rng() * DIE_FACES));

/** The square a piece on `from` reaches with a roll of `roll`. */
export const squareAfter = (from: number, roll: number): number => (from + roll) % BOARD.length;

/**
 * Medals a roll pays on average. A die that moves 1 to 6 round a loop visits
 * every square equally often in the long run, wherever the piece began, so
 * this is simply the average of the board.
 */
export const BOARD_VALUE = BOARD.reduce<number>((sum, medals) => sum + medals, 0) / BOARD.length;

/**
 * The exact chance of standing on each square after `rolls` rolls from `from`:
 * how quickly "every square equally often" becomes true.
 */
export function boardAfter(rolls: number, from = 0): number[] {
  if (!Number.isInteger(rolls) || rolls < 0) throw new Error('rolls must be a whole number');
  let chances: number[] = BOARD.map((_, square) => (square === from ? 1 : 0));
  for (let i = 0; i < rolls; i++) {
    const next: number[] = BOARD.map(() => 0);
    chances.forEach((chance, square) => {
      for (let roll = 1; roll <= DIE_FACES; roll++) next[squareAfter(square, roll)] += chance / DIE_FACES;
    });
    chances = next;
  }
  return chances;
}

// ── The treasure chests ─────────────────────────────────────────────────────

/** What the three chests hold. Which chest holds which is shuffled every time. */
export const CHESTS = [10, 20, 30] as const;
/** A chest holding this much or more is paid as towers; less is thrown on loose. */
export const CHEST_TOWERS_FROM = 20;

/** The three prizes in the order the chests hold them, left to right. */
export function shuffleChests(rng: () => number): number[] {
  const prizes: number[] = [...CHESTS];
  for (let i = prizes.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
  }
  return prizes;
}

/** Medals a choice of chest pays on average: each prize is as likely as the next, whichever chest is picked. */
export const CHEST_VALUE = CHESTS.reduce<number>((sum, medals) => sum + medals, 0) / CHESTS.length;

// ── The ball's roulette ─────────────────────────────────────────────────────

/** One pocket of the roulette: medals for the tower, or the cross that ends the run. */
export type Pocket = 'stop' | number;

/**
 * The twelve pockets in the order they sit on the wheel, each as likely as the
 * next. A number adds that many medals to the towers on the pusher and the
 * roulette turns again; a cross ends the run.
 */
export const ROULETTE: readonly Pocket[] = ['stop', 10, 20, 30, 'stop', 10, 20, 50, 'stop', 10, 20, 'stop'];

/** Numbers in a row, with no cross, that start the jackpot challenge: the ball in the bowl. */
export const CHAIN_GOAL = 4;

/** The jackpot starts here and grows by one medal for every `JACKPOT_STEP` medals played. */
export const JACKPOT_START = 300;
export const JACKPOT_STEP = 40;

export const drawPocket = (rng: () => number): number => Math.min(ROULETTE.length - 1, Math.floor(rng() * ROULETTE.length));

const NUMBERS = ROULETTE.filter((pocket): pocket is number => pocket !== 'stop');
/** The chance that a turn lands on a number, so the run goes on. */
export const CONTINUE_CHANCE = NUMBERS.length / ROULETTE.length;
/** The average a numbered pocket pays. */
export const POCKET_VALUE = NUMBERS.reduce((sum, medals) => sum + medals, 0) / NUMBERS.length;

/** The chance that a run gets as far as `level` numbers in a row. */
export const chainChance = (level: number): number => CONTINUE_CHANCE ** level;

// ── The jackpot challenge: a ball in a bowl ─────────────────────────────────

/** One hole of the bowl: the jackpot, or that many medals. */
export type Hole = 'jackpot' | number;

/**
 * The bowl a full run ends in: a ball rolls round it and drops into one of
 * its holes, each as likely as the next. Whatever the hole pays is stacked on
 * the pusher as towers.
 */
export const BOWL: readonly Hole[] = ['jackpot', 50, 100];

/** Draws the hole the ball will drop into, as an index into the bowl. */
export const drawHole = (rng: () => number): number => Math.min(BOWL.length - 1, Math.floor(rng() * BOWL.length));

/** Medals a hole pays when the jackpot stands at `jackpot`. */
export const holePays = (hole: Hole, jackpot: number): number => (hole === 'jackpot' ? jackpot : hole);

/** Medals the bowl pays on average when the jackpot stands at `jackpot`. */
export const bowlValue = (jackpot: number): number => BOWL.reduce<number>((sum, hole) => sum + holePays(hole, jackpot), 0) / BOWL.length;

/** The chance that a ball's run gets as far as the bowl. */
export const CHALLENGE_CHANCE = chainChance(CHAIN_GOAL);
/** The chance that the ball in the bowl drops into the jackpot's hole. */
export const HOLE_JACKPOT_CHANCE = BOWL.filter((hole) => hole === 'jackpot').length / BOWL.length;
/** The chance that a ball pushed over the front wins the jackpot: a full run, then the right hole. */
export const BALL_JACKPOT_CHANCE = CHALLENGE_CHANCE * HOLE_JACKPOT_CHANCE;

// ── Exact odds ──────────────────────────────────────────────────────────────

/** The chance of each tier on one spin. */
export const tierChance = (tier: Tier): number => SPIN_TABLE[tier] / SPIN_TOTAL;

/**
 * Medals a ball's roulette pays on average when the jackpot stands at
 * `jackpot`: every number it gets to, each worth the average pocket, and the
 * bowl for the runs that reach the goal.
 */
export function rouletteValue(jackpot: number): number {
  let numbers = 0;
  for (let level = 1; level <= CHAIN_GOAL; level++) numbers += chainChance(level);
  return numbers * POCKET_VALUE + CHALLENGE_CHANCE * bowlValue(jackpot);
}

/** The chance that one spin leads to the jackpot: three sevens for a ball, a full run once it falls, then the jackpot's hole. */
export const JACKPOT_CHANCE = tierChance('seven') * BALL_JACKPOT_CHANCE;

/** Medals each line is worth on average with the jackpot at `jackpot`, counting a ball as the roulette it will start. */
export function tierValue(tier: Tier, jackpot: number): number {
  if (tier === 'miss') return 0;
  return tier === 'small' ? BOARD_VALUE : tier === 'big' ? CHEST_VALUE : rouletteValue(jackpot);
}

/** Medals one spin is worth on average with the jackpot at `jackpot`. */
export function spinValue(jackpot: number): number {
  return TIERS.reduce((sum, tier) => sum + tierChance(tier) * tierValue(tier, jackpot), 0);
}
