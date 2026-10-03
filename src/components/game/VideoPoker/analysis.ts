/**
 * Exact video poker analysis — every number is a count of real card
 * combinations, nothing is simulated.
 *
 * The trick that makes it fast: for every set S of up to five cards, count how
 * many five-card hands containing S make each paying hand (`contains`). Then
 * the outcomes of holding H and discarding X from a dealt hand are the hands
 * that contain H but none of X, which inclusion–exclusion turns into a signed
 * sum of `contains` over the sets between H and the whole dealt hand — 32
 * table lookups per dealt hand instead of up to 1.5 million draws.
 *
 * The best hold is then found for one representative of each of the 134,459
 * suit-distinct dealt hands, weighted by how many of the 2,598,960 deals it
 * stands for.
 */

import { HANDS, rankHand, type HandRank, type PayTable } from './engine';

export const TOTAL_HANDS = 2_598_960;
/** Paying hand ranks 1…9 (rank 0, "nothing", is everything else). */
const PAYING = HANDS.length - 1;

/** Binomial coefficients C[n][k] for n ≤ 52, k ≤ 5. */
const C: number[][] = (() => {
  const c: number[][] = [];
  for (let n = 0; n <= 52; n++) {
    c.push([1, 0, 0, 0, 0, 0]);
    for (let k = 1; k <= 5; k++) c[n][k] = n === 0 ? 0 : c[n - 1][k - 1] + c[n - 1][k];
  }
  return c;
})();
export const choose = (n: number, k: number) => (k < 0 || k > n ? 0 : C[n][k]);

/** Number of k-card sets: 1, 52, 1326, 22100, 270725, 2598960. */
const SETS = [0, 1, 2, 3, 4, 5].map((k) => C[52][k]);

/** Colexicographic index of a sorted hand of five. */
export const handIndex = (c0: number, c1: number, c2: number, c3: number, c4: number) => C[c0][1] + C[c1][2] + C[c2][3] + C[c3][4] + C[c4][5];

/** Popcount and bit positions of the 32 subsets of five positions. */
const BITS: number[][] = Array.from({ length: 32 }, (_, m) => [0, 1, 2, 3, 4].filter((i) => m & (1 << i)));

export interface Tables {
  /** Rank of every five-card hand, by handIndex. */
  rank: Uint8Array;
  /**
   * contains[k][index · 9 + (rank − 1)]: five-card hands of that paying rank
   * that include the k-card set with that colex index (k = 0…4).
   */
  contains: Int32Array[];
  /** One sorted hand per suit-symmetry class (5 bytes each) and how many deals it represents. */
  classHands: Uint8Array;
  classWeights: Uint8Array;
  classes: number;
}

let cached: Tables | null = null;

/**
 * Builds the lookup tables as a generator that yields between slices of
 * work, so a browser can build them without freezing (see `tablesAsync`).
 */
function* build(): Generator<undefined, Tables> {
  const rank = new Uint8Array(TOTAL_HANDS);
  const contains = [0, 1, 2, 3, 4].map((k) => new Int32Array(SETS[k] * PAYING));
  const cards = [0, 0, 0, 0, 0];
  for (let c4 = 4; c4 < 52; c4++) {
    cards[4] = c4;
    for (let c3 = 3; c3 < c4; c3++) {
      cards[3] = c3;
      for (let c2 = 2; c2 < c3; c2++) {
        cards[2] = c2;
        for (let c1 = 1; c1 < c2; c1++) {
          cards[1] = c1;
          for (let c0 = 0; c0 < c1; c0++) {
            const r = rankHand(c0, c1, c2, c3, c4);
            if (r === 0) continue;
            rank[handIndex(c0, c1, c2, c3, c4)] = r;
            cards[0] = c0;
            // Credit this hand to each of its 31 proper subsets.
            for (let m = 0; m < 31; m++) {
              const bits = BITS[m];
              let idx = 0;
              for (let j = 0; j < bits.length; j++) idx += C[cards[bits[j]]][j + 1];
              contains[bits.length][idx * PAYING + r - 1]++;
            }
          }
        }
      }
      yield;
    }
  }

  // Suit-symmetry classes: walk every hand, and the first time a class is met
  // mark all of its (up to 24) suit relabelings as seen.
  const seen = new Uint8Array(TOTAL_HANDS);
  const reps: number[] = [];
  const weights: number[] = [];
  const perms = suitPermutations();
  const image = [0, 0, 0, 0, 0];
  for (let c4 = 4; c4 < 52; c4++) {
    for (let c3 = 3; c3 < c4; c3++) {
      for (let c2 = 2; c2 < c3; c2++) {
        for (let c1 = 1; c1 < c2; c1++) {
          for (let c0 = 0; c0 < c1; c0++) {
            if (seen[handIndex(c0, c1, c2, c3, c4)]) continue;
            let size = 0;
            for (const p of perms) {
              image[0] = p[(c0 / 13) | 0] * 13 + (c0 % 13);
              image[1] = p[(c1 / 13) | 0] * 13 + (c1 % 13);
              image[2] = p[(c2 / 13) | 0] * 13 + (c2 % 13);
              image[3] = p[(c3 / 13) | 0] * 13 + (c3 % 13);
              image[4] = p[(c4 / 13) | 0] * 13 + (c4 % 13);
              image.sort(ascending);
              const idx = handIndex(image[0], image[1], image[2], image[3], image[4]);
              if (!seen[idx]) {
                seen[idx] = 1;
                size++;
              }
            }
            reps.push(c0, c1, c2, c3, c4);
            weights.push(size);
          }
        }
      }
      yield;
    }
  }
  return { rank, contains, classHands: Uint8Array.from(reps), classWeights: Uint8Array.from(weights), classes: weights.length };
}

/** Builds (once) the lookup tables everything else reads. Takes about half a second. */
export function tables(): Tables {
  if (cached) return cached;
  const steps = build();
  let step = steps.next();
  while (!step.done) step = steps.next();
  cached = step.value;
  return cached;
}

let pending: Promise<Tables> | null = null;

/**
 * The same tables, built in slices of at most `budgetMs` with a pause between
 * them, so the page stays responsive while they are prepared.
 */
export function tablesAsync(budgetMs = 10): Promise<Tables> {
  if (cached) return Promise.resolve(cached);
  pending ??= new Promise<Tables>((resolve) => {
    const steps = build();
    const slice = () => {
      const until = Date.now() + budgetMs;
      let step = steps.next();
      while (!step.done && Date.now() < until) step = steps.next();
      if (step.done) {
        cached = step.value;
        resolve(cached);
      } else {
        setTimeout(slice, 0);
      }
    };
    slice();
  });
  return pending;
}

/** Whether the tables are ready to read without building them. */
export const tablesReady = () => cached !== null;

const ascending = (a: number, b: number) => a - b;

function suitPermutations(): number[][] {
  const out: number[][] = [];
  const walk = (prefix: number[]) => {
    if (prefix.length === 4) {
      out.push(prefix);
      return;
    }
    for (let s = 0; s < 4; s++) if (!prefix.includes(s)) walk([...prefix, s]);
  };
  walk([]);
  return out;
}

/** Draws that complete a hold of `kept` cards: C(47, 5 − kept). */
export const drawsFor = (kept: number) => C[47][5 - kept];

/**
 * For a dealt hand (sorted ascending) fills `out[mask · 9 + (rank − 1)]` with
 * the number of draws that end in each paying rank when the cards in `mask`
 * are held (bit i = the i-th lowest card).
 */
export function holdCounts(hand: readonly number[], out: Int32Array, t: Tables = tables()): Int32Array {
  // f[M] = hands of each rank containing the subset M of the dealt hand.
  for (let m = 0; m < 31; m++) {
    const bits = BITS[m];
    let idx = 0;
    for (let j = 0; j < bits.length; j++) idx += C[hand[bits[j]]][j + 1];
    const from = idx * PAYING;
    const table = t.contains[bits.length];
    for (let r = 0; r < PAYING; r++) out[m * PAYING + r] = table[from + r];
  }
  const dealt = t.rank[handIndex(hand[0], hand[1], hand[2], hand[3], hand[4])];
  for (let r = 0; r < PAYING; r++) out[31 * PAYING + r] = dealt === r + 1 ? 1 : 0;
  // Möbius inversion over supersets: hands containing M and nothing else from the deal.
  for (let bit = 1; bit < 32; bit <<= 1) {
    for (let m = 0; m < 32; m++) {
      if (m & bit) continue;
      const a = m * PAYING;
      const b = (m | bit) * PAYING;
      for (let r = 0; r < PAYING; r++) out[a + r] -= out[b + r];
    }
  }
  return out;
}

export interface HoldValue {
  /** Bit i set = the i-th card (in the order given) is held. */
  mask: number;
  /** Expected payout per coin wagered. */
  ev: number;
  /** Draws ending in each rank of HANDS (index 0 = nothing). */
  counts: number[];
  draws: number;
}

/**
 * The exact value of all 32 ways to play a dealt hand (any card order), best
 * first. Masks refer to the positions of `hand` as given.
 */
export function analyzeHand(hand: readonly number[], pays: PayTable): HoldValue[] {
  const order = [0, 1, 2, 3, 4].sort((a, b) => hand[a] - hand[b]);
  const sorted = order.map((i) => hand[i]);
  const counts = holdCounts(sorted, new Int32Array(32 * PAYING));
  const out: HoldValue[] = [];
  for (let m = 0; m < 32; m++) {
    const draws = drawsFor(BITS[m].length);
    let paid = 0;
    let hits = 0;
    const row = [0];
    for (let r = 0; r < PAYING; r++) {
      const n = counts[m * PAYING + r];
      row.push(n);
      hits += n;
      paid += n * pays[r + 1];
    }
    row[0] = draws - hits;
    // Translate the mask from sorted positions back to the caller's positions.
    let mask = 0;
    for (const j of BITS[m]) mask |= 1 << order[j];
    out.push({ mask, ev: paid / draws, counts: row, draws });
  }
  return out.sort((a, b) => b.ev - a.ev || BITS_COUNT[b.mask] - BITS_COUNT[a.mask]);
}

const BITS_COUNT = BITS.map((b) => b.length);

export interface GameAnalysis {
  /** Expected payout per coin with perfect play (five coins bet, so a royal pays 800). */
  payback: number;
  /** Probability of ending on each rank of HANDS with perfect play. */
  final: number[];
  /** Share of the payback that comes from each rank. */
  contribution: number[];
  /** Variance of the payout per coin. */
  variance: number;
  /** Probability of holding 0…5 cards with perfect play. */
  holdSizes: number[];
}

/** Perfect play for a pay table: the best hold for every suit-distinct deal. */
export function analyzeGame(pays: PayTable, t: Tables = tables()): GameAnalysis {
  const counts = new Int32Array(32 * PAYING);
  const hand = [0, 0, 0, 0, 0];
  let payback = 0;
  const final = new Array<number>(HANDS.length).fill(0);
  const holdSizes = [0, 0, 0, 0, 0, 0];
  for (let c = 0; c < t.classes; c++) {
    for (let i = 0; i < 5; i++) hand[i] = t.classHands[c * 5 + i];
    holdCounts(hand, counts, t);
    let best = -1;
    let bestMask = 0;
    for (let m = 0; m < 32; m++) {
      let paid = 0;
      for (let r = 0; r < PAYING; r++) paid += counts[m * PAYING + r] * pays[r + 1];
      const ev = paid / drawsFor(BITS_COUNT[m]);
      // Ties go to holding more cards (it changes nothing in expectation).
      if (ev > best + 1e-12 || (Math.abs(ev - best) <= 1e-12 && BITS_COUNT[m] > BITS_COUNT[bestMask])) {
        best = ev;
        bestMask = m;
      }
    }
    const w = t.classWeights[c] / TOTAL_HANDS;
    payback += w * best;
    holdSizes[BITS_COUNT[bestMask]] += w;
    const draws = drawsFor(BITS_COUNT[bestMask]);
    let hits = 0;
    for (let r = 0; r < PAYING; r++) {
      const n = counts[bestMask * PAYING + r];
      hits += n;
      final[r + 1] += (w * n) / draws;
    }
    final[0] += (w * (draws - hits)) / draws;
  }
  const contribution = final.map((p, r) => (p * pays[r]) / payback);
  const variance = final.reduce((sum, p, r) => sum + p * pays[r] * pays[r], 0) - payback * payback;
  return { payback, final, contribution, variance, holdSizes };
}

const gameCache = new Map<string, GameAnalysis>();
export function gameAnalysis(pays: PayTable): GameAnalysis {
  const key = pays.join(',');
  let a = gameCache.get(key);
  if (!a) {
    a = analyzeGame(pays);
    gameCache.set(key, a);
  }
  return a;
}

/** How the 2,598,960 deals rank before any draw. */
export function dealtCounts(t: Tables = tables()): number[] {
  const out = new Array<number>(HANDS.length).fill(0);
  for (let i = 0; i < TOTAL_HANDS; i++) out[t.rank[i]]++;
  return out;
}

export type { HandRank };
