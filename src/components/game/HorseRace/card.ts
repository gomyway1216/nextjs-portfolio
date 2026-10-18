/**
 * The race card: which six horses run, the odds on the board, and the exact
 * chance of every way the race can end.
 *
 * ## The tickets
 *
 * As on the classic horse-racing medal machines, a race is six horses, and
 * two kinds of ticket are sold on it: a win ticket (単勝) on one horse, which
 * wins if that horse finishes first, and a quinella ticket (連複, 連勝複式) on
 * two, which wins if those two finish first and second in either order. Six
 * win tickets and fifteen quinellas: twenty-one in all. A winning ticket pays
 * its odds times the medals on it, the medals on it included. The odds are
 * whole numbers, from 2 up (a win at most 99, a quinella at most 999), so a
 * win is always whole medals.
 *
 * ## Odds first, and every ticket alike
 *
 * The board's odds are set first, from the horses' form, and the chances
 * follow from them: a win ticket's horse wins with a chance of R ÷ its odds,
 * where R, the race's return on win tickets, is 1 ÷ (the sum of 1 ÷ the
 * odds). So every win ticket on the race brings back exactly R of the medals
 * on it, and the six chances add up to one. The quinellas are set the same
 * way, with their own R. The odds are chosen so that R is at most 90% and at
 * least 89.5% on both kinds of ticket, in every race: the machine keeps
 * 10% to 10.5% of what is played on it, and no ticket is a better bet than
 * another.
 *
 * ## How a race is drawn
 *
 * The result is drawn before the gates open (race.ts only shows it):
 *
 * 1. The first and second, together, from the chance of every pair in order
 *    (`firstSecond`): the quinella pair's chance, shared between its two
 *    horses so that each horse wins with exactly its win chance. The share
 *    is the one the classic model of a race (Harville's: the second is the
 *    winner of the race among the rest) gives, moved as little as it can be
 *    so that both kinds of ticket come out exact.
 * 2. The rest, third to sixth, one place at a time, each from the horses
 *    left with a chance in proportion to their win chances (Harville's).
 *
 * Every chance is an exact fraction (fraction.ts); the tests add up all 720
 * ways a race can end and find each ticket's return exactly R.
 *
 * ## Whose races
 *
 * A player's races are numbered, and each number's card is worked out from
 * the number and the name of the medals' ledger on this device, so a page
 * that is reloaded shows the same race. The card's own numbers come from a
 * seeded generator, not from `Math.random`: only the draw of the result
 * uses that, at the moment START is pressed.
 */

import { add, compare, div, frac, mul, sub, sum, toNumber, ONE, ZERO, type Fraction } from './fraction';
import { STABLE, type Horse } from './stable';

/** Horses in a race. */
export const FIELD = 6;
/** The most any ticket brings back: 90%. */
export const RETURN_MOST = frac(9, 10);
/** The least: 89.5%. A card that would bring back less on either kind of ticket is not run. */
export const RETURN_LEAST = frac(179, 200);
/** The odds a ticket can have: whole numbers, two digits for a win and three for a quinella, as the board shows them. */
export const ODDS_LIMITS = { win: { least: 2, most: 99 }, quinella: { least: 2, most: 999 } } as const;
/** How much a horse's form can move its rating on the day, either way: up to e^0.5, about 1.65 times. */
export const FORM_SWING = 0.5;
/** The most a horse's fair chance may be: a horse fancied more than this would be priced under 2. */
export const FAVOURITE_MOST = 0.45;

export type TicketKind = 'win' | 'quinella';
/** A ticket: on one gate (1 to 6) to win, or on two (the lower first) to come first and second. */
export type Ticket = { kind: 'win'; gate: number } | { kind: 'quinella'; gates: readonly [number, number] };

/** The fifteen pairs of gates, as indexes (0 to 5), lower first, in the order the board lists them. */
export const PAIRS: readonly (readonly [number, number])[] = Array.from({ length: FIELD }, (_, i) => i).flatMap((i) =>
  Array.from({ length: FIELD - i - 1 }, (_, k) => [i, i + k + 1] as const),
);
const pairIndex = (a: number, b: number): number => PAIRS.findIndex(([i, j]) => i === Math.min(a, b) && j === Math.max(a, b));

/** Every ticket sold on a race, win tickets first. */
export const TICKETS: readonly Ticket[] = [
  ...Array.from({ length: FIELD }, (_, i): Ticket => ({ kind: 'win', gate: i + 1 })),
  ...PAIRS.map(([i, j]): Ticket => ({ kind: 'quinella', gates: [i + 1, j + 1] })),
];

/** A ticket's name: `win:3`, `quinella:2-5`. */
export const ticketKey = (ticket: Ticket): string => (ticket.kind === 'win' ? `win:${ticket.gate}` : `quinella:${ticket.gates[0]}-${ticket.gates[1]}`);

/** The ticket a name is for, or null when it is not one. */
export function ticketFrom(key: string): Ticket | null {
  return TICKETS.find((ticket) => ticketKey(ticket) === key) ?? null;
}

/** Whether a ticket wins when the horses finish in `order` (gates, first to last). */
export function ticketWins(ticket: Ticket, order: readonly number[]): boolean {
  if (ticket.kind === 'win') return order[0] === ticket.gate;
  const [a, b] = ticket.gates;
  return (order[0] === a && order[1] === b) || (order[0] === b && order[1] === a);
}

export interface RaceCard {
  /** The race's number in the player's sequence of races, from 1. */
  race: number;
  /** The horses, in gate order: the first is in gate 1. */
  field: readonly Horse[];
  /** The win odds, gate by gate. */
  winOdds: readonly number[];
  /** The quinella odds, pair by pair (`PAIRS`). */
  quinellaOdds: readonly number[];
  /** Each horse's chance to win: R ÷ its odds. */
  winChance: readonly Fraction[];
  /** Each pair's chance to finish first and second: R ÷ its odds. */
  pairChance: readonly Fraction[];
  /** The chance that gate i + 1 wins with gate j + 1 second, for every i ≠ j. */
  firstSecond: readonly (readonly Fraction[])[];
  /** What every win ticket brings back of its medals, and every quinella ticket. */
  winReturn: Fraction;
  quinellaReturn: Fraction;
}

// ── A seeded generator, for the cards ───────────────────────────────────────

/** A string's hash: FNV-1a, 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Numbers in [0, 1) from a seed (mulberry32): the same every time for the same seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Pricing ─────────────────────────────────────────────────────────────────

const reciprocalSum = (odds: readonly number[]): Fraction => sum(odds.map((o) => frac(1, o)));
const TEN_NINTHS = div(ONE, RETURN_MOST);

/**
 * Whole-number odds for tickets whose fair price (90% ÷ their chance) is
 * `fair`: each the price rounded down or up, within the limits, chosen so that
 * the return, 1 ÷ (the sum of 1 ÷ the odds), is as near 90% as it can be
 * without going over. Starting from every price rounded down, the one rounding
 * up that brings the return nearest 90% is made, again and again, while one fits.
 */
export function price(fair: readonly number[], least: number, most: number): number[] {
  const odds = fair.map((t) => Math.min(most, Math.max(least, Math.floor(t))));
  let total = reciprocalSum(odds);
  for (;;) {
    let best = -1;
    let bestTotal: Fraction | null = null;
    for (let i = 0; i < odds.length; i += 1) {
      if (odds[i] >= most || odds[i] >= Math.ceil(fair[i])) continue;
      const next = add(sub(total, frac(1, odds[i])), frac(1, odds[i] + 1));
      // The return stays at or under 90% while the sum of 1 ÷ the odds stays at or over 10/9; the smallest such sum is nearest.
      if (compare(next, TEN_NINTHS) < 0) continue;
      if (bestTotal === null || compare(next, bestTotal) < 0) {
        best = i;
        bestTotal = next;
      }
    }
    if (best < 0 || bestTotal === null) return odds;
    odds[best] += 1;
    total = bestTotal;
  }
}

// ── The chances of first and second ─────────────────────────────────────────

/**
 * Shares each pair's chance between its two horses, so that each horse wins
 * with exactly its win chance: the share Harville's model gives,
 * (1 − wⱼ) ÷ (2 − wᵢ − wⱼ) for horse i, moved by (μᵢ − μⱼ) ÷ 2, where μ is
 * the smallest move that does it (the weighted Laplacian of the pairs' chances
 * solved for what each horse's win chance still lacks). Null when a share
 * would not be a chance strictly between nothing and the whole pair.
 */
export function shareFirstSecond(win: readonly Fraction[], pair: readonly Fraction[]): Fraction[][] | null {
  const n = win.length;
  const two = frac(2);
  const base = PAIRS.map(([i, j]) => div(sub(ONE, win[j]), sub(sub(two, win[i]), win[j])));
  // What each horse's win chance lacks after the base shares.
  const lack = win.slice();
  PAIRS.forEach(([i, j], e) => {
    lack[i] = sub(lack[i], mul(pair[e], base[e]));
    lack[j] = sub(lack[j], mul(pair[e], sub(ONE, base[e])));
  });
  // L μ = 2 · lack, with the last μ at nothing (the Laplacian's rows add up to nothing; the last is left out).
  const size = n - 1;
  const rows: Fraction[][] = Array.from({ length: size }, () => Array.from({ length: size + 1 }, () => ZERO));
  PAIRS.forEach(([i, j], e) => {
    const q = pair[e];
    if (i < size) rows[i][i] = add(rows[i][i], q);
    if (j < size) rows[j][j] = add(rows[j][j], q);
    if (i < size && j < size) {
      rows[i][j] = sub(rows[i][j], q);
      rows[j][i] = sub(rows[j][i], q);
    }
  });
  for (let i = 0; i < size; i += 1) rows[i][size] = mul(two, lack[i]);
  // Gauss–Jordan; the matrix is positive definite, so no pivot is ever nothing.
  for (let c = 0; c < size; c += 1) {
    const pivot = rows[c][c];
    if (pivot.n === ZERO.n) return null;
    for (let r = 0; r < size; r += 1) {
      if (r === c || rows[r][c].n === ZERO.n) continue;
      const factor = div(rows[r][c], pivot);
      for (let k = c; k <= size; k += 1) rows[r][k] = sub(rows[r][k], mul(factor, rows[c][k]));
    }
  }
  const mu = [...rows.map((row, i) => div(row[size], row[i])), ZERO];
  const half = frac(1, 2);
  const shares = PAIRS.map(([i, j], e) => add(base[e], mul(half, sub(mu[i], mu[j]))));
  if (shares.some((share) => compare(share, ZERO) <= 0 || compare(share, ONE) >= 0)) return null;
  const table: Fraction[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ZERO));
  PAIRS.forEach(([i, j], e) => {
    table[i][j] = mul(pair[e], shares[e]);
    table[j][i] = mul(pair[e], sub(ONE, shares[e]));
  });
  return table;
}

// ── The card ────────────────────────────────────────────────────────────────

/** How many times a card is drawn again before the best of those drawn is run. It never needs as many. */
const ATTEMPTS = 400;

interface Priced {
  card: RaceCard;
  /** The lower of its two returns, to choose the best card when none reaches the least (it never happens). */
  worst: Fraction;
}

function priceField(race: number, field: Horse[], strengths: number[]): Priced | null {
  const total = strengths.reduce((a, b) => a + b, 0);
  const fair = strengths.map((s) => s / total);
  if (Math.max(...fair) > FAVOURITE_MOST) return null;
  const target = toNumber(RETURN_MOST);
  const winOdds = price(
    fair.map((p) => target / p),
    ODDS_LIMITS.win.least,
    ODDS_LIMITS.win.most,
  );
  const winReturn = div(ONE, reciprocalSum(winOdds));
  const winChance = winOdds.map((o) => div(winReturn, frac(o)));
  // The quinellas are priced from Harville's chance of each pair, from the win chances as the board has them.
  const w = winChance.map(toNumber);
  const harville = PAIRS.map(([i, j]) => (w[i] * w[j]) / (1 - w[i]) + (w[j] * w[i]) / (1 - w[j]));
  const quinellaOdds = price(
    harville.map((q) => target / q),
    ODDS_LIMITS.quinella.least,
    ODDS_LIMITS.quinella.most,
  );
  const quinellaReturn = div(ONE, reciprocalSum(quinellaOdds));
  // A price rounded up to the least odds can take a return over 90%: such a card is not run.
  if (compare(winReturn, RETURN_MOST) > 0 || compare(quinellaReturn, RETURN_MOST) > 0) return null;
  const pairChance = quinellaOdds.map((o) => div(quinellaReturn, frac(o)));
  const firstSecond = shareFirstSecond(winChance, pairChance);
  if (!firstSecond) return null;
  const card: RaceCard = { race, field, winOdds, quinellaOdds, winChance, pairChance, firstSecond, winReturn, quinellaReturn };
  return { card, worst: compare(winReturn, quinellaReturn) < 0 ? winReturn : quinellaReturn };
}

/**
 * The card of race number `race` in the sequence named `seed` (the medals'
 * ledger's name for this device): the same card every time it is asked for.
 */
export function raceCard(seed: string, race: number): RaceCard {
  const rng = seeded(hash(`${seed}:${race}`));
  let best: Priced | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    // Six of the stable, in the gates in the order they are drawn.
    const order = STABLE.map((_, i) => i);
    for (let i = 0; i < FIELD; i += 1) {
      const j = i + Math.floor(rng() * (order.length - i));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const field = order.slice(0, FIELD).map((i) => STABLE[i]);
    const strengths = field.map((horse) => horse.rating * Math.exp((rng() * 2 - 1) * FORM_SWING));
    const priced = priceField(race, field, strengths);
    if (!priced) continue;
    if (compare(priced.worst, RETURN_LEAST) >= 0) return priced.card;
    if (!best || compare(priced.worst, best.worst) > 0) best = priced;
  }
  if (best) return best.card;
  // Not one card of all those drawn could be priced (it never happens): six horses alike.
  return evenCard(race);
}

/** Six horses with the same chance, priced: the card run when no other can be (it never is). */
function evenCard(race: number): RaceCard {
  const field = STABLE.slice(0, FIELD);
  const priced = priceField(race, field, [5, 5, 5, 5, 5, 5.000001]);
  if (!priced) throw new Error('An even field cannot be priced');
  return priced.card;
}

// ── Odds, chances and the draw ──────────────────────────────────────────────

/** The odds of a ticket on a card. */
export function oddsOf(card: RaceCard, ticket: Ticket): number {
  if (ticket.kind === 'win') return card.winOdds[ticket.gate - 1];
  return card.quinellaOdds[pairIndex(ticket.gates[0] - 1, ticket.gates[1] - 1)];
}

/** The exact chance that a ticket wins. */
export function chanceOf(card: RaceCard, ticket: Ticket): Fraction {
  if (ticket.kind === 'win') return card.winChance[ticket.gate - 1];
  return card.pairChance[pairIndex(ticket.gates[0] - 1, ticket.gates[1] - 1)];
}

/** The exact chance of one finishing order (gates, first to last). */
export function orderChance(card: RaceCard, order: readonly number[]): Fraction {
  const gates = order.map((gate) => gate - 1);
  let chance = card.firstSecond[gates[0]][gates[1]];
  let left = gates.slice(2);
  for (const gate of gates.slice(2, FIELD - 1)) {
    const weight = sum(left.map((g) => card.winChance[g]));
    chance = mul(chance, div(card.winChance[gate], weight));
    left = left.filter((g) => g !== gate);
  }
  return chance;
}

/** A card's chances as ordinary numbers, for drawing: worked out once a card (the fractions can be long). */
const floats = new WeakMap<RaceCard, { pairs: { first: number; second: number; chance: number }[]; w: number[] }>();
function floatsOf(card: RaceCard) {
  let found = floats.get(card);
  if (!found) {
    const n = card.field.length;
    const pairs: { first: number; second: number; chance: number }[] = [];
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) if (i !== j) pairs.push({ first: i, second: j, chance: toNumber(card.firstSecond[i][j]) });
    found = { pairs, w: card.winChance.map(toNumber) };
    floats.set(card, found);
  }
  return found;
}

/**
 * Draws the finishing order (gates, first to last) from the card's chances,
 * with `random` (Math.random on the machine): four numbers, the first for the
 * first two together, one each for third, fourth and fifth.
 */
export function drawOrder(card: RaceCard, random: () => number): number[] {
  const n = card.field.length;
  const { pairs, w } = floatsOf(card);
  let u = random();
  let chosen = pairs[pairs.length - 1];
  for (const pair of pairs) {
    if (u < pair.chance) {
      chosen = pair;
      break;
    }
    u -= pair.chance;
  }
  const order = [chosen.first, chosen.second];
  let left = Array.from({ length: n }, (_, g) => g).filter((g) => g !== chosen.first && g !== chosen.second);
  while (left.length > 1) {
    const total = left.reduce((acc, g) => acc + w[g], 0);
    let v = random() * total;
    let pick = left[left.length - 1];
    for (const g of left) {
      if (v < w[g]) {
        pick = g;
        break;
      }
      v -= w[g];
    }
    order.push(pick);
    left = left.filter((g) => g !== pick);
  }
  order.push(left[0]);
  return order.map((g) => g + 1);
}

/** Every finishing order of the field, gates first to last: 720 of them. */
export function allOrders(n: number = FIELD): number[][] {
  const out: number[][] = [];
  const walk = (prefix: number[], left: number[]) => {
    if (left.length === 0) {
      out.push(prefix);
      return;
    }
    for (const gate of left) walk([...prefix, gate], left.filter((g) => g !== gate));
  };
  walk([], Array.from({ length: n }, (_, i) => i + 1));
  return out;
}
