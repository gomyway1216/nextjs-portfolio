/**
 * The digital half of the machine: the number slot on the centre screen and
 * the three games it leads to — a sugoroku board, a choice of treasure chests,
 * and the roulette a prize ball starts when it is pushed over the front.
 * Unlike the field, these are pure lotteries — every result is drawn first and
 * the screen only acts it out — so their odds are exact and are listed on the
 * Odds tab.
 */

export const TIERS = ['miss', 'small', 'big', 'seven'] as const;
export type Tier = (typeof TIERS)[number];

/** Chances out of 1,000 spins. */
export const SPIN_TABLE: Record<Tier, number> = { miss: 939, small: 40, big: 15, seven: 6 };
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

/** One pocket of the roulette: the jackpot, or a fixed number of medals. */
export type Pocket = 'jackpot' | number;

/** The twelve pockets in the order they sit on the wheel. Each is equally likely. */
export const ROULETTE: readonly Pocket[] = ['jackpot', 30, 50, 30, 100, 50, 30, 100, 50, 30, 100, 50];

/** The jackpot starts here and grows by one medal for every `JACKPOT_STEP` medals played. */
export const JACKPOT_START = 300;
export const JACKPOT_STEP = 40;

/** A roulette prize this large or larger is stacked as towers; a smaller one is thrown on loose. */
export const TOWERS_FROM = 50;

export const drawPocket = (rng: () => number): number => Math.min(ROULETTE.length - 1, Math.floor(rng() * ROULETTE.length));

/** Medals a pocket pays when the jackpot stands at `jackpot`. */
export const pocketPays = (pocket: Pocket, jackpot: number): number => (pocket === 'jackpot' ? jackpot : pocket);

// ── Exact odds ──────────────────────────────────────────────────────────────

/** The chance of each tier on one spin. */
export const tierChance = (tier: Tier): number => SPIN_TABLE[tier] / SPIN_TOTAL;

/** The average roulette prize when the jackpot stands at `jackpot`. */
export function rouletteValue(jackpot: number): number {
  return ROULETTE.reduce<number>((sum, pocket) => sum + pocketPays(pocket, jackpot), 0) / ROULETTE.length;
}

/** The chance that one spin leads to the jackpot itself: three sevens for a ball, then the one pocket once it falls. */
export const JACKPOT_CHANCE = tierChance('seven') * (ROULETTE.filter((pocket) => pocket === 'jackpot').length / ROULETTE.length);

/** Medals each line is worth on average with the jackpot at `jackpot`, counting a ball as the roulette it will start. */
export function tierValue(tier: Tier, jackpot: number): number {
  if (tier === 'miss') return 0;
  return tier === 'small' ? BOARD_VALUE : tier === 'big' ? CHEST_VALUE : rouletteValue(jackpot);
}

/** Medals one spin is worth on average with the jackpot at `jackpot`. */
export function spinValue(jackpot: number): number {
  return TIERS.reduce((sum, tier) => sum + tierChance(tier) * tierValue(tier, jackpot), 0);
}
