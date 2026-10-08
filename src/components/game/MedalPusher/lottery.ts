/**
 * The digital half of the machine: the number slot on the centre screen and
 * the roulette a prize ball starts when it is pushed over the front. Unlike
 * the field, these are pure lotteries — the result is drawn first and the
 * reels only act it out — so their odds are exact and are listed on the Odds tab.
 */

export const TIERS = ['miss', 'small', 'big', 'seven'] as const;
export type Tier = (typeof TIERS)[number];

/** Chances out of 1,000 spins. */
export const SPIN_TABLE: Record<Tier, number> = { miss: 939, small: 40, big: 15, seven: 6 };
export const SPIN_TOTAL = 1000;

/** Medals a winning line pays onto the field; three sevens put a prize ball there instead. */
export const SPIN_PAYS: Record<Exclude<Tier, 'seven'>, number> = { miss: 0, small: 8, big: 20 };

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

/** Medals one spin is worth on average with the jackpot at `jackpot`, counting a ball as the roulette it will start. */
export function spinValue(jackpot: number): number {
  return tierChance('small') * SPIN_PAYS.small + tierChance('big') * SPIN_PAYS.big + tierChance('seven') * rouletteValue(jackpot);
}
