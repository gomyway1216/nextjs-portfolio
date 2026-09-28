/**
 * Exact baccarat odds by enumerating every way the next hand's cards can come
 * out of a known shoe composition — no simulation, no approximation.
 *
 * Every hand is counted as an ordered draw of six cards (hands that use
 * fewer are multiplied by the ways the unused cards could fall), so all
 * outcomes share the denominator N·(N−1)·…·(N−5). For up to eight decks all
 * the counts are integers below 2^53, so plain numbers stay exact.
 */

import { RANKS, RANK_VALUES, bankerDraws, fullShoeCounts, playerDraws, type BetId, type Mode } from './engine';

export interface ExactOdds {
  /** Cards in the composition. */
  cards: number;
  /** Ordered six-card draws: N·(N−1)·…·(N−5). Every count below is out of this. */
  total: number;
  banker: number;
  player: number;
  tie: number;
  /** Banker wins with a three-card 7 (EZ Baccarat's Dragon 7). */
  dragon7: number;
  /** Player wins with a three-card 8 (EZ Baccarat's Panda 8). */
  panda8: number;
  natural: number;
  playerDraws: number;
  bankerDraws: number;
  /** Hands that used 4, 5 and 6 cards. */
  cardsUsed: [number, number, number];
  /** Either pair bet: the first two cards of a hand share a rank (out of `pairTotal`). */
  pair: number;
  pairTotal: number;
}

export function exactOdds(rankCounts: readonly number[]): ExactOdds {
  if (rankCounts.length !== RANKS.length || rankCounts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error('expected 13 non-negative rank counts');
  }
  const c = new Array<number>(10).fill(0);
  rankCounts.forEach((n, r) => (c[RANK_VALUES[r]] += n));
  const n = c.reduce((a, b) => a + b, 0);
  if (n < 6) throw new Error('a hand needs at least six cards in the shoe');
  const total = n * (n - 1) * (n - 2) * (n - 3) * (n - 4) * (n - 5);
  if (!Number.isSafeInteger(total)) throw new Error('shoe too large for exact integer counts');
  const rest4 = (n - 4) * (n - 5);
  const rest5 = n - 5;

  let banker = 0;
  let player = 0;
  let tie = 0;
  let dragon7 = 0;
  let panda8 = 0;
  let natural = 0;
  let pDraws = 0;
  let bDraws = 0;
  let four = 0;
  let five = 0;
  let six = 0;

  const score = (pt: number, bt: number, weight: number, playerThree: boolean, bankerThree: boolean) => {
    if (pt > bt) {
      player += weight;
      if (playerThree && pt === 8) panda8 += weight;
    } else if (bt > pt) {
      banker += weight;
      if (bankerThree && bt === 7) dragon7 += weight;
    } else {
      tie += weight;
    }
  };

  for (let p1 = 0; p1 < 10; p1++) {
    const w1 = c[p1];
    if (w1 === 0) continue;
    c[p1]--;
    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = c[b1];
      if (w2 === 0) continue;
      c[b1]--;
      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = c[p2];
        if (w3 === 0) continue;
        c[p2]--;
        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = c[b2];
          if (w4 === 0) continue;
          c[b2]--;
          const w = w1 * w2 * w3 * w4;
          const pt = (p1 + p2) % 10;
          const bt = (b1 + b2) % 10;
          if (pt >= 8 || bt >= 8) {
            const weight = w * rest4;
            natural += weight;
            four += weight;
            score(pt, bt, weight, false, false);
          } else if (playerDraws(pt)) {
            pDraws += w * rest4;
            for (let p3 = 0; p3 < 10; p3++) {
              const w5 = c[p3];
              if (w5 === 0) continue;
              c[p3]--;
              const pt3 = (pt + p3) % 10;
              if (bankerDraws(bt, p3)) {
                for (let b3 = 0; b3 < 10; b3++) {
                  const w6 = c[b3];
                  if (w6 === 0) continue;
                  const weight = w * w5 * w6;
                  bDraws += weight;
                  six += weight;
                  score(pt3, (bt + b3) % 10, weight, true, true);
                }
              } else {
                const weight = w * w5 * rest5;
                five += weight;
                score(pt3, bt, weight, true, false);
              }
              c[p3]++;
            }
          } else if (bankerDraws(bt, null)) {
            for (let b3 = 0; b3 < 10; b3++) {
              const w5 = c[b3];
              if (w5 === 0) continue;
              const weight = w * w5 * rest5;
              bDraws += weight;
              five += weight;
              score(pt, (bt + b3) % 10, weight, false, true);
            }
          } else {
            const weight = w * rest4;
            four += weight;
            score(pt, bt, weight, false, false);
          }
          c[b2]++;
        }
        c[p2]++;
      }
      c[b1]++;
    }
    c[p1]++;
  }

  // The pair bets look only at the first two cards of one hand, and any two
  // positions in a shuffled shoe are alike: Σ n_r(n_r − 1) / N(N − 1).
  const pair = rankCounts.reduce((sum, k) => sum + k * (k - 1), 0);
  return {
    cards: n,
    total,
    banker,
    player,
    tie,
    dragon7,
    panda8,
    natural,
    playerDraws: pDraws,
    bankerDraws: bDraws,
    cardsUsed: [four, five, six],
    pair,
    pairTotal: n * (n - 1),
  };
}

const cache = new Map<number, ExactOdds>();
/** Odds off the top of a fresh shoe (memoized per deck count). */
export function shoeOdds(decks: number): ExactOdds {
  let odds = cache.get(decks);
  if (!odds) {
    odds = exactOdds(fullShoeCounts(decks));
    cache.set(decks, odds);
  }
  return odds;
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

/** Every bet line the odds tab compares — both banker variants and both tie payouts. */
export const ODDS_BETS = ['banker', 'bankerEz', 'player', 'tie', 'tie9', 'pair', 'dragon7', 'panda8'] as const;
export type OddsBet = (typeof ODDS_BETS)[number];

export interface BetOdds {
  id: OddsBet;
  /** Profit per unit when the bet wins. */
  pays: number;
  win: number;
  push: number;
  lose: number;
  /** Expected profit per unit staked; the house edge is −ev. */
  ev: number;
}

export function betOdds(id: OddsBet, odds: ExactOdds): BetOdds {
  const p = (count: number) => count / odds.total;
  const make = (pays: number, win: number, push: number): BetOdds => {
    const lose = 1 - win - push;
    return { id, pays, win, push, lose, ev: pays * win - lose };
  };
  switch (id) {
    case 'banker':
      return make(0.95, p(odds.banker), p(odds.tie));
    case 'bankerEz':
      return make(1, p(odds.banker - odds.dragon7), p(odds.tie + odds.dragon7));
    case 'player':
      return make(1, p(odds.player), p(odds.tie));
    case 'tie':
      return make(8, p(odds.tie), 0);
    case 'tie9':
      return make(9, p(odds.tie), 0);
    case 'pair':
      return make(11, odds.pair / odds.pairTotal, 0);
    case 'dragon7':
      return make(40, p(odds.dragon7), 0);
    case 'panda8':
      return make(25, p(odds.panda8), 0);
  }
}

/** The odds-tab line that prices a table bet under the given commission mode. */
export function oddsBetFor(id: BetId, mode: Mode): OddsBet {
  if (id === 'banker') return mode === 'ez' ? 'bankerEz' : 'banker';
  if (id === 'playerPair' || id === 'bankerPair') return 'pair';
  return id;
}

/** Expected hands from one shoe: cards dealt before the cut card over cards per hand. */
export function expectedCardsPerHand(odds: ExactOdds): number {
  const [four, five, six] = odds.cardsUsed;
  return (4 * four + 5 * five + 6 * six) / odds.total;
}

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** A probability as a reduced fraction [numerator, denominator]. */
export function reduced(count: number, total: number): [number, number] {
  const g = gcd(count, total) || 1;
  return [count / g, total / g];
}
