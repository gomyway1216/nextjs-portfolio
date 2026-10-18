/**
 * The rules of Big Catch Harbor (大漁ハーバー), and their exact odds.
 *
 * A fishing medal machine of the kind every Japanese game center's medal
 * corner has: medals go in, the line is cast into a harbor where fish swim by
 * as shadows, a fish bites, it is reeled in or gets away, and a fish landed
 * pays its multiple of the medals bet. The big rare fish, a treasure chest
 * with a prize roulette inside, and the harbor's lord are the highlights.
 *
 * As on the real machines, a cast is a lottery shown through an animation.
 * Everything about it is drawn the moment the line is cast, from the fixed,
 * published chances below, and nothing the player does afterwards changes it:
 *
 * 1. **What bites**: one of `BITE_CELLS` (10,000) equally likely cells. Each
 *    fish holds as many cells as its `bites`; the cells no fish holds are a
 *    cast that nothing bites.
 * 2. **Landed or away**: a fish that bites is landed with its own chance
 *    (`lands`), smaller for the bigger fish, which fight harder.
 * 3. **The chest's prize**: a treasure chest landed opens on one of its
 *    prizes, each with its own chance out of `CHEST_CELLS` (20).
 *
 * Three random numbers in [0, 1) are drawn for every cast, always three and in
 * that order, whether or not the second and third are needed.
 *
 * The bet (1, 3 or 5 medals a cast, as a real machine's rod modes multiply
 * both what a cast takes and what it pays) changes the units, never the odds:
 * a fish pays its multiple times the bet. Exactly 90 of every 100 medals come
 * back, at every bet (`analyzeMachine`, enumerated in its tests).
 *
 * Everything here is arithmetic: nothing is drawn unless a `random` is passed.
 */

// ── The bet ─────────────────────────────────────────────────────────────────

/** Medals a cast can take: one, three or five, as a real fishing medal machine's rod modes (×1, ×3, ×5) take them. */
export const BET_OPTIONS = [1, 3, 5] as const;
export type Bet = (typeof BET_OPTIONS)[number];
export const isBet = (value: unknown): value is Bet => BET_OPTIONS.includes(value as Bet);
export const MAX_BET: Bet = 5;

// ── The fish ────────────────────────────────────────────────────────────────

/** How a fish's shadow looks in the water: its size class, as the real machines let a shadow hint at what it is. */
export type Shadow = 'small' | 'medium' | 'large' | 'chest' | 'lord';

export type FishId = 'fry' | 'goby' | 'sardine' | 'bream' | 'squid' | 'tuna' | 'marlin' | 'chest' | 'lord';

export interface Fish {
  id: FishId;
  /** What it pays, times the bet; null for the treasure chest, which pays the prize it opens on. */
  pays: number | null;
  /** The cells of `BITE_CELLS` it holds: its chance to be what bites a cast, out of 10,000. */
  bites: number;
  /** Its chance to be landed once it bites: `num` out of `den`. */
  lands: { num: number; den: number };
  shadow: Shadow;
}

/** The cells a cast's bite is drawn from: every cell as likely as any other. */
export const BITE_CELLS = 10_000;

/**
 * The fish of the harbor, smallest first, with what each pays, how often it
 * bites and how often it is landed. Every name and look is the machine's own.
 */
export const FISH: readonly Fish[] = [
  { id: 'fry', pays: 1, bites: 2_100, lands: { num: 19, den: 20 }, shadow: 'small' },
  { id: 'goby', pays: 2, bites: 1_100, lands: { num: 9, den: 10 }, shadow: 'small' },
  { id: 'sardine', pays: 3, bites: 600, lands: { num: 17, den: 20 }, shadow: 'small' },
  { id: 'bream', pays: 5, bites: 250, lands: { num: 4, den: 5 }, shadow: 'medium' },
  { id: 'squid', pays: 10, bites: 100, lands: { num: 7, den: 10 }, shadow: 'medium' },
  { id: 'tuna', pays: 20, bites: 45, lands: { num: 1, den: 2 }, shadow: 'large' },
  { id: 'marlin', pays: 50, bites: 20, lands: { num: 2, den: 5 }, shadow: 'large' },
  { id: 'chest', pays: null, bites: 40, lands: { num: 1, den: 2 }, shadow: 'chest' },
  { id: 'lord', pays: 300, bites: 10, lands: { num: 1, den: 8 }, shadow: 'lord' },
];

export const FISH_IDS: readonly FishId[] = FISH.map((fish) => fish.id);
export const fishOf = (id: FishId): Fish => FISH.find((fish) => fish.id === id)!;
export const isFishId = (value: unknown): value is FishId => typeof value === 'string' && (FISH_IDS as readonly string[]).includes(value);

/** The cells no fish holds: a cast that nothing bites. */
export const NO_BITE_CELLS = BITE_CELLS - FISH.reduce((sum, fish) => sum + fish.bites, 0);

// ── The treasure chest ──────────────────────────────────────────────────────

/** The cells a chest's prize is drawn from. */
export const CHEST_CELLS = 20;

/** What a treasure chest landed opens on: each prize times the bet, with the cells of `CHEST_CELLS` it holds. */
export const CHEST: readonly { pays: number; cells: number }[] = [
  { pays: 10, cells: 10 },
  { pays: 20, cells: 6 },
  { pays: 50, cells: 3 },
  { pays: 200, cells: 1 },
];

// ── A cast ──────────────────────────────────────────────────────────────────

/** What a cast comes to, drawn the moment it is cast. */
export interface Cast {
  /** The fish that bit, or null when nothing did. */
  fish: FishId | null;
  /** Whether it was landed (always false when nothing bit). */
  landed: boolean;
  /** For a treasure chest landed, the prize it opens on (an index of `CHEST`); null otherwise. */
  prize: number | null;
}

const cell = (r: number, cells: number): number => Math.min(cells - 1, Math.max(0, Math.floor(r * cells)));

/** The fish that bites, from a random number in [0, 1): the fish's cells in the order of `FISH`, then the cells nothing bites. */
export function biteFrom(r: number): FishId | null {
  let at = cell(r, BITE_CELLS);
  for (const fish of FISH) {
    if (at < fish.bites) return fish.id;
    at -= fish.bites;
  }
  return null;
}

/** Whether a fish that has bitten is landed, from a random number in [0, 1): the first `num` of its `den` equal parts. */
export const landedFrom = (fish: FishId, r: number): boolean => {
  const { num, den } = fishOf(fish).lands;
  return cell(r, den) < num;
};

/** The chest's prize, from a random number in [0, 1): an index of `CHEST`. */
export function prizeFrom(r: number): number {
  let at = cell(r, CHEST_CELLS);
  for (let i = 0; i < CHEST.length; i++) {
    if (at < CHEST[i].cells) return i;
    at -= CHEST[i].cells;
  }
  return CHEST.length - 1;
}

/** A cast from three random numbers in [0, 1): what bites, whether it is landed, and a chest's prize. */
export function castFrom(r1: number, r2: number, r3: number): Cast {
  const fish = biteFrom(r1);
  if (fish === null) return { fish: null, landed: false, prize: null };
  const landed = landedFrom(fish, r2);
  return { fish, landed, prize: landed && fish === 'chest' ? prizeFrom(r3) : null };
}

/** A cast, drawn: always three numbers, in order. Called when the CAST button is pressed. */
export function drawCast(random: () => number): Cast {
  const r1 = random();
  const r2 = random();
  const r3 = random();
  return castFrom(r1, r2, r3);
}

/** Whether a cast is one the machine could have drawn: a fish that is one, landed only if it bit, a prize only for a chest landed. */
export function isCast(value: unknown): value is Cast {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { fish, landed, prize } = value as Record<string, unknown>;
  if (typeof landed !== 'boolean') return false;
  if (fish === null) return !landed && prize === null;
  if (!isFishId(fish)) return false;
  if (fish === 'chest' && landed) return typeof prize === 'number' && Number.isInteger(prize) && prize >= 0 && prize < CHEST.length;
  return prize === null;
}

/** What a cast pays, times the bet: a fish landed its multiple, a chest landed its prize, anything else nothing. */
export function multipleOf(cast: Cast): number {
  if (!cast.landed || cast.fish === null) return 0;
  if (cast.fish === 'chest') return cast.prize === null ? 0 : CHEST[cast.prize].pays;
  return fishOf(cast.fish).pays ?? 0;
}

/** The named win a cast is to the medal floor: the harbor's lord, or a treasure chest. */
export type CastLabel = 'harbor-lord' | 'treasure';

export interface CastResult {
  cast: Cast;
  bet: Bet;
  /** Its multiple of the bet. */
  multiple: number;
  /** The medals it pays. */
  win: number;
  label: CastLabel | null;
}

export function resolveCast(cast: Cast, bet: Bet): CastResult {
  const multiple = multipleOf(cast);
  const label: CastLabel | null = multiple === 0 ? null : cast.fish === 'lord' ? 'harbor-lord' : cast.fish === 'chest' ? 'treasure' : null;
  return { cast, bet, multiple, win: multiple * bet, label };
}

/** The most a cast pays, times the bet: the lord, or the chest's top prize. */
export const TOP_MULTIPLE = Math.max(...FISH.map((fish) => fish.pays ?? 0), ...CHEST.map((prize) => prize.pays));
/** The most medals one cast can pay: the top multiple on the biggest bet. */
export const MOST_MEDALS = TOP_MULTIPLE * MAX_BET;

// ── Exact odds ──────────────────────────────────────────────────────────────

/** A fraction in lowest terms. */
export interface Fraction {
  num: number;
  den: number;
}

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
};
export const fraction = (num: number, den: number): Fraction => {
  const g = gcd(num, den) || 1;
  const sign = den < 0 ? -1 : 1;
  return { num: (sign * num) / g, den: (sign * den) / g };
};
export const add = (a: Fraction, b: Fraction): Fraction => {
  const g = gcd(a.den, b.den) || 1;
  return fraction(a.num * (b.den / g) + b.num * (a.den / g), (a.den / g) * b.den);
};
export const times = (a: Fraction, b: Fraction): Fraction => {
  const g1 = gcd(a.num, b.den) || 1;
  const g2 = gcd(b.num, a.den) || 1;
  return fraction((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1));
};
export const scale = (a: Fraction, by: number): Fraction => times(a, fraction(by, 1));
export const valueOf = (f: Fraction): number => f.num / f.den;
const ZERO: Fraction = { num: 0, den: 1 };
const sum = (values: readonly Fraction[]): Fraction => values.reduce(add, ZERO);

export interface FishOdds {
  id: FishId;
  pays: number | null;
  /** Its chance to bite a cast. */
  bite: Fraction;
  /** Its chance to be landed once it bites. */
  land: Fraction;
  /** Its chance, every cast, to be caught: to bite and be landed. */
  caught: Fraction;
  /** Its chance, every cast, to bite and get away. */
  away: Fraction;
  /** What it adds to the return: medals back per medal bet, from this fish alone. */
  share: Fraction;
}

export interface PrizeOdds {
  pays: number;
  cells: number;
  /** Its chance once a chest is landed. */
  inChest: Fraction;
  /** Its chance every cast. */
  perCast: Fraction;
  share: Fraction;
}

export interface MachineOdds {
  fish: FishOdds[];
  chest: PrizeOdds[];
  /** What a chest landed pays on average, times the bet. */
  chestMean: Fraction;
  /** Every cast: nothing bites. */
  noBite: Fraction;
  /** Every cast: something bites and gets away. */
  away: Fraction;
  /** Every cast: something is caught, and paid. */
  hit: Fraction;
  /** Medals back for every medal bet, on average: the same at every bet. */
  rtp: Fraction;
  /** The rest: medals the machine keeps, per medal bet. */
  edge: Fraction;
  /** The mean of what a cast pays, times the bet, squared: for the spread. */
  meanSquare: Fraction;
  /** How far what one cast pays, times the bet, spreads around its mean. */
  sd: number;
  /** How many casts it takes before what came back is within one point of 90%, 95 times in 100. */
  castsForOnePoint: number;
}

/**
 * The machine's exact odds, from its tables: each fish's chance to bite times
 * its chance to be landed, times what it pays, and the chest's prizes the
 * same way. Nothing is simulated.
 */
export function analyzeMachine(): MachineOdds {
  const chestMean = sum(CHEST.map((prize) => fraction(prize.pays * prize.cells, CHEST_CELLS)));
  const chestSquare = sum(CHEST.map((prize) => fraction(prize.pays * prize.pays * prize.cells, CHEST_CELLS)));
  const fish = FISH.map((f): FishOdds => {
    const bite = fraction(f.bites, BITE_CELLS);
    const land = fraction(f.lands.num, f.lands.den);
    const caught = times(bite, land);
    const away = times(bite, fraction(f.lands.den - f.lands.num, f.lands.den));
    const share = f.pays === null ? times(caught, chestMean) : scale(caught, f.pays);
    return { id: f.id, pays: f.pays, bite, land, caught, away, share };
  });
  const chestCaught = fish.find((f) => f.id === 'chest')!.caught;
  const chest = CHEST.map((prize): PrizeOdds => {
    const inChest = fraction(prize.cells, CHEST_CELLS);
    const perCast = times(chestCaught, inChest);
    return { pays: prize.pays, cells: prize.cells, inChest, perCast, share: scale(perCast, prize.pays) };
  });
  const rtp = sum(fish.map((f) => f.share));
  const meanSquare = sum(FISH.map((f, i) => (f.pays === null ? times(fish[i].caught, chestSquare) : scale(fish[i].caught, f.pays * f.pays))));
  const variance = valueOf(meanSquare) - valueOf(rtp) ** 2;
  const sd = Math.sqrt(variance);
  return {
    fish,
    chest,
    chestMean,
    noBite: fraction(NO_BITE_CELLS, BITE_CELLS),
    away: sum(fish.map((f) => f.away)),
    hit: sum(fish.map((f) => f.caught)),
    rtp,
    edge: fraction(rtp.den - rtp.num, rtp.den),
    meanSquare,
    sd,
    castsForOnePoint: Math.ceil(((1.96 * sd) / 0.01) ** 2),
  };
}

/** Every multiple a cast can pay and its exact chance, 0 (nothing) first. */
export function payoutsOf(): { multiple: number; chance: Fraction }[] {
  const odds = analyzeMachine();
  const chances = new Map<number, Fraction>();
  const put = (multiple: number, chance: Fraction) => chances.set(multiple, add(chances.get(multiple) ?? ZERO, chance));
  put(0, add(odds.noBite, odds.away));
  for (const f of odds.fish) if (f.pays !== null) put(f.pays, f.caught);
  for (const prize of odds.chest) put(prize.pays, prize.perCast);
  return [...chances.entries()].sort((a, b) => a[0] - b[0]).map(([multiple, chance]) => ({ multiple, chance }));
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

export interface SessionSummary {
  /** How many casts each session made, of one medal each. */
  casts: number;
  sessions: number;
  /** What each session ended with, less what it bet: medals ahead (above 0) or behind. */
  nets: number[];
  meanNet: number;
  /** Share of the sessions that ended with more medals than they bet. */
  ahead: number;
  /** Medals back per medal bet, over every session together. */
  rtp: number;
  /** Sessions that landed the lord at least once. */
  lords: number;
}

/** Plays `sessions` sessions of `casts` one-medal casts each, every cast as the machine draws it. */
export function simulateSessions(casts: number, sessions: number, random: () => number): SessionSummary {
  const nets: number[] = [];
  let back = 0;
  let lords = 0;
  for (let s = 0; s < sessions; s++) {
    let won = 0;
    let lord = false;
    for (let c = 0; c < casts; c++) {
      const cast = drawCast(random);
      won += multipleOf(cast);
      if (cast.fish === 'lord' && cast.landed) lord = true;
    }
    back += won;
    nets.push(won - casts);
    if (lord) lords += 1;
  }
  const meanNet = nets.reduce((total, net) => total + net, 0) / Math.max(1, sessions);
  return { casts, sessions, nets, meanNet, ahead: nets.filter((net) => net > 0).length / Math.max(1, sessions), rtp: back / Math.max(1, casts * sessions), lords };
}
