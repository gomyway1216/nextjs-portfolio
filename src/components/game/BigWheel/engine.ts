/**
 * The rules of the Star Festival Big Wheel (星まつりビッグホイール), and their
 * exact odds.
 *
 * A big upright prize wheel of the kind a casino calls a Big Six and a medal
 * corner stands in the middle of its floor: medals go on the symbols on the
 * betting board, the wheel is spun, a leather flapper at the top clacks over
 * the pegs between its segments as it slows, and the symbol it stops on pays
 * its number in medals for every medal on it.
 *
 * ## The wheel
 *
 * 54 equal segments, as on a casino's Big Six: 50 carry a number, the medals
 * it pays back for every medal on it (the medal included), and 4 are BONUS
 * segments. Each number's segments times the number come to the same 40, so
 * that no symbol is a better bet than another:
 *
 *     ×2 on 20 segments, ×4 on 10, ×5 on 8, ×8 on 5, ×10 on 4, ×20 on 2, ×40 on 1.
 *
 * ## The bonus: the Milky Way Chance and a second chance
 *
 * A stop on a BONUS segment pays nothing at once. The medals stay on the board,
 * the ring of 16 star lamps in the wheel's hub runs round and stops on a
 * multiplier (×2 on 12 lamps, ×3 on 3, ×10 on 1), and the big wheel is spun
 * once more, its BONUS segments dark: the second chance stops on one of the 50
 * number segments, and the number it stops on pays its number times the
 * multiplier. A second chance can only stop on a number, so a spin is never
 * more than two turns of the wheel.
 *
 * ## The draw
 *
 * As on the real machines, a spin is a lottery the wheel then shows. Three
 * random numbers in [0, 1) are drawn the moment SPIN is pressed, always three
 * and in this order, whether or not the second and third are needed:
 *
 * 1. **The stop**: one of the 54 segments, each as likely as any other.
 * 2. **The lamp**: one of the 16 lamps, for a stop on BONUS.
 * 3. **The second chance**: one of the 50 number segments, for a stop on BONUS.
 *
 * So there are 54 × 16 × 50 = 43,200 equally likely ways a spin can be drawn,
 * and every medal on every symbol brings back exactly 9/10 of itself over them
 * (`analyzeWheel`; its tests add all 43,200 up).
 *
 * Everything here is arithmetic: nothing is drawn unless a `random` is passed.
 */

// ── The symbols ─────────────────────────────────────────────────────────────

/** The numbers on the wheel and on the betting board: each pays itself for every medal on it, the medal included. */
export const SPOTS = [2, 4, 5, 8, 10, 20, 40] as const;
export type Spot = (typeof SPOTS)[number];
export const isSpot = (value: unknown): value is Spot => SPOTS.includes(value as Spot);

/** A segment of the wheel: a number, or a BONUS segment. */
export type Segment = Spot | 'bonus';

/** How many segments the wheel has, as a casino's Big Six does. */
export const SEGMENT_COUNT = 54;

/**
 * The wheel's segments, clockwise from the one at the top when the wheel
 * stands at rest: the ×40 there, flanked by low numbers, and the four BONUS
 * segments a quarter of the wheel apart. Every number is spread round the
 * wheel, and no two of the same number above ×2 sit side by side.
 */
export const WHEEL: readonly Segment[] = [
  40, 2, 8, 4, 2, 5, 2, 'bonus', 4, 2, 8, 5, 2, 10, 2, 20, 2, 5, 4, 2, 'bonus', 5, 2, 4, 8, 2, 10, 4, 2, 5, 8, 2, 4, 2, 'bonus', 4, 2, 5, 10, 2, 8, 2, 20, 2,
  5, 4, 2, 'bonus', 4, 2, 10, 5, 2, 4,
];

/** How many segments carry each number. */
export const SEGMENTS_OF: Readonly<Record<Spot, number>> = { 2: 20, 4: 10, 5: 8, 8: 5, 10: 4, 20: 2, 40: 1 };
/** How many BONUS segments there are. */
export const BONUS_SEGMENTS = 4;
/** The segments that carry a number, in the wheel's order: what a second chance stops on. */
export const NUMBER_SEGMENTS: readonly number[] = WHEEL.flatMap((segment, index) => (segment === 'bonus' ? [] : [index]));
export const NUMBER_SEGMENT_COUNT = SEGMENT_COUNT - BONUS_SEGMENTS;

// ── The bonus lamps ─────────────────────────────────────────────────────────

/** A multiplier the hub's lamps can stop on. */
export type Multiplier = 2 | 3 | 10;

/** The 16 star lamps round the hub, clockwise from the top: ×10 on one, ×3 on three, ×2 on the rest. */
export const LAMPS: readonly Multiplier[] = [10, 2, 2, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2, 2];
export const LAMP_COUNT = 16;

// ── A spin ──────────────────────────────────────────────────────────────────

/** What a spin comes to, drawn the moment SPIN is pressed. */
export interface Spin {
  /** The segment the wheel stops on: an index of `WHEEL`. */
  stop: number;
  /** For a stop on BONUS, the lamp the hub stops on (an index of `LAMPS`); null otherwise. */
  lamp: number | null;
  /** For a stop on BONUS, the number segment the second chance stops on (an index of `WHEEL`); null otherwise. */
  second: number | null;
}

const cell = (r: number, cells: number): number => Math.min(cells - 1, Math.max(0, Math.floor(r * cells)));

/** A spin from three random numbers in [0, 1): the stop, and for a stop on BONUS the lamp and the second chance. */
export function spinFrom(r1: number, r2: number, r3: number): Spin {
  const stop = cell(r1, SEGMENT_COUNT);
  if (WHEEL[stop] !== 'bonus') return { stop, lamp: null, second: null };
  return { stop, lamp: cell(r2, LAMP_COUNT), second: NUMBER_SEGMENTS[cell(r3, NUMBER_SEGMENT_COUNT)] };
}

/** A spin, drawn: always three numbers, in order. Called in the SPIN button's press. */
export function drawSpin(random: () => number): Spin {
  const r1 = random();
  const r2 = random();
  const r3 = random();
  return spinFrom(r1, r2, r3);
}

const isIndex = (value: unknown, count: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;

/** Whether a spin is one the machine could have drawn: a lamp and a second chance exactly when it stopped on BONUS, the second on a number. */
export function isSpin(value: unknown): value is Spin {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { stop, lamp, second } = value as Record<string, unknown>;
  if (!isIndex(stop, SEGMENT_COUNT)) return false;
  if (WHEEL[stop] !== 'bonus') return lamp === null && second === null;
  return isIndex(lamp, LAMP_COUNT) && isIndex(second, SEGMENT_COUNT) && WHEEL[second] !== 'bonus';
}

/** What a spin comes to: the number that pays, and the multiplier it pays at. */
export interface SpinResult {
  spin: Spin;
  /** The number that pays: the stop's, or for a stop on BONUS the second chance's. */
  spot: Spot;
  /** 1, or the lamp's multiplier for a stop on BONUS. */
  multiplier: 1 | Multiplier;
  /** Whether the wheel stopped on BONUS first. */
  bonus: boolean;
}

export function resultOf(spin: Spin): SpinResult {
  const first = WHEEL[spin.stop];
  if (first !== 'bonus') return { spin, spot: first, multiplier: 1, bonus: false };
  const second = WHEEL[spin.second ?? NUMBER_SEGMENTS[0]] as Spot;
  return { spin, spot: second, multiplier: LAMPS[spin.lamp ?? 0], bonus: true };
}

/** Medals on each number of the betting board. */
export type Bets = Partial<Record<Spot, number>>;

/** What `bets` win back on a spin: the medals on the number that pays, times its number, times the multiplier. */
export function winOf(bets: Bets, spin: Spin): number {
  const { spot, multiplier } = resultOf(spin);
  return (bets[spot] ?? 0) * spot * multiplier;
}

/** The named win a spin is to the medal floor: the second chance's top (×10 on the ×40), or any other second-chance win. */
export type WheelLabel = 'wheel-400' | 'wheel-bonus';

export function labelOf(spin: Spin, won: number): WheelLabel | null {
  if (won <= 0) return null;
  const { spot, multiplier, bonus } = resultOf(spin);
  if (!bonus) return null;
  return spot === 40 && multiplier === 10 ? 'wheel-400' : 'wheel-bonus';
}

/** The most one medal can bring back: the second chance's ×10 on the ×40. */
export const TOP_MULTIPLE = Math.max(...SPOTS) * Math.max(...LAMPS);

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

export interface LampOdds {
  multiplier: Multiplier;
  lamps: number;
  /** Its chance once the hub's lamps run. */
  chance: Fraction;
}

export interface SpotOdds {
  spot: Spot;
  segments: number;
  /** Its chance to be where the wheel stops first. */
  first: Fraction;
  /** Its chance to be paid on a second chance (after BONUS), each multiplier together. */
  second: Fraction;
  /** Its chance to be paid at all, a spin: first or on a second chance. */
  hit: Fraction;
  /** Medals back for every medal on it, on average. */
  rtp: Fraction;
  /** The share of that from the second chance. */
  bonusShare: Fraction;
  /** How far what one medal on it brings back spreads round its mean. */
  sd: number;
  /** How many spins it takes before what came back is within one point of 90%, 95 times in 100. */
  spinsForOnePoint: number;
  /** Every amount one medal on it can bring back and its chance, nothing first. */
  pays: { multiple: number; chance: Fraction }[];
}

export interface WheelOdds {
  spots: SpotOdds[];
  lamps: LampOdds[];
  /** A spin's chance to stop on BONUS first. */
  bonus: Fraction;
  /** What the lamps multiply by, on average. */
  lampMean: Fraction;
  /** Medals back for every medal played, on average: the same on every number. */
  rtp: Fraction;
  /** The rest: medals the machine keeps, for every medal played. */
  edge: Fraction;
  /** The chance a spin ends ×10 on the ×40. */
  top: Fraction;
}

/**
 * The wheel's exact odds, from its segments and its lamps: a number's chance
 * to be the stop, plus BONUS's chance times its chance to be the second
 * chance, times what it pays. Nothing is simulated.
 */
export function analyzeWheel(): WheelOdds {
  const bonus = fraction(BONUS_SEGMENTS, SEGMENT_COUNT);
  const lamps: LampOdds[] = ([2, 3, 10] as const).map((multiplier) => {
    const count = LAMPS.filter((lamp) => lamp === multiplier).length;
    return { multiplier, lamps: count, chance: fraction(count, LAMP_COUNT) };
  });
  const lampMean = sum(lamps.map((lamp) => scale(lamp.chance, lamp.multiplier)));
  const lampSquare = sum(lamps.map((lamp) => scale(lamp.chance, lamp.multiplier * lamp.multiplier)));
  const spots = SPOTS.map((spot): SpotOdds => {
    const segments = WHEEL.filter((segment) => segment === spot).length;
    const first = fraction(segments, SEGMENT_COUNT);
    const onSecond = fraction(segments, NUMBER_SEGMENT_COUNT);
    const second = times(bonus, onSecond);
    const hit = add(first, second);
    const fromFirst = scale(first, spot);
    const fromSecond = scale(times(second, lampMean), spot);
    const rtp = add(fromFirst, fromSecond);
    const meanSquare = add(scale(first, spot * spot), scale(times(second, lampSquare), spot * spot));
    const sd = Math.sqrt(valueOf(meanSquare) - valueOf(rtp) ** 2);
    const pays = new Map<number, Fraction>();
    const put = (multiple: number, chance: Fraction) => pays.set(multiple, add(pays.get(multiple) ?? ZERO, chance));
    put(spot, first);
    for (const lamp of lamps) put(spot * lamp.multiplier, times(second, lamp.chance));
    const paid = sum([...pays.values()]);
    put(0, fraction(paid.den - paid.num, paid.den));
    return {
      spot,
      segments,
      first,
      second,
      hit,
      rtp,
      bonusShare: times(fromSecond, fraction(rtp.den, rtp.num)),
      sd,
      spinsForOnePoint: Math.ceil(((1.96 * sd) / 0.01) ** 2),
      pays: [...pays.entries()].sort((a, b) => a[0] - b[0]).map(([multiple, chance]) => ({ multiple, chance })),
    };
  });
  const rtp = spots[0].rtp;
  const top = times(times(bonus, fraction(1, NUMBER_SEGMENT_COUNT)), lamps.find((lamp) => lamp.multiplier === 10)!.chance);
  return { spots, lamps, bonus, lampMean, rtp, edge: fraction(rtp.den - rtp.num, rtp.den), top };
}

/** The number of equally likely ways a spin can be drawn: every stop, every lamp, every second chance. */
export const DRAWS = SEGMENT_COUNT * LAMP_COUNT * NUMBER_SEGMENT_COUNT;

/**
 * Every one of the `DRAWS` equally likely ways a spin can be drawn, by the
 * same function the machine draws with: each cell of each of the three
 * numbers, taken at its middle.
 */
export function* everyDraw(): Generator<Spin> {
  for (let a = 0; a < SEGMENT_COUNT; a++)
    for (let b = 0; b < LAMP_COUNT; b++)
      for (let c = 0; c < NUMBER_SEGMENT_COUNT; c++) yield spinFrom((a + 0.5) / SEGMENT_COUNT, (b + 0.5) / LAMP_COUNT, (c + 0.5) / NUMBER_SEGMENT_COUNT);
}

// ── Sessions, for the Odds tab ──────────────────────────────────────────────

/** A random number generator with a seed, so that a check can be run again and come out the same (mulberry32). */
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

/** A number for a seed from any text: the same text, the same number (FNV-1a). */
export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface CheckResult {
  spins: number;
  /** For each number, the medals one medal on it every spin brought back, per medal. */
  back: Record<Spot, number>;
  /** How many spins stopped on BONUS first. */
  bonuses: number;
  /** How many spins ended ×10 on the ×40. */
  tops: number;
}

/** Spins the wheel `spins` times, each spin as the machine draws it, with one medal on every number. */
export function checkSpins(spins: number, random: () => number): CheckResult {
  const won = Object.fromEntries(SPOTS.map((spot) => [spot, 0])) as Record<Spot, number>;
  let bonuses = 0;
  let tops = 0;
  for (let i = 0; i < spins; i++) {
    const result = resultOf(drawSpin(random));
    won[result.spot] += result.spot * result.multiplier;
    if (result.bonus) bonuses += 1;
    if (result.bonus && result.spot === 40 && result.multiplier === 10) tops += 1;
  }
  const back = Object.fromEntries(SPOTS.map((spot) => [spot, won[spot] / Math.max(1, spins)])) as Record<Spot, number>;
  return { spins, back, bonuses, tops };
}
