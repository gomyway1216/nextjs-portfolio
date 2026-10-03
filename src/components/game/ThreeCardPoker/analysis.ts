/**
 * Exact Three Card Poker odds by enumeration — no simulation, no approximation.
 *
 * A player hand is one of C(52,3) = 22,100 and the dealer then holds one of
 * the C(49,3) = 18,424 hands left: 407,170,400 combinations in all. Suits are
 * interchangeable, so player hands are grouped into orbits under the 24 suit
 * permutations (1,755 of them) and only one representative of each is played
 * against every dealer hand; each result is weighted by the size of its
 * orbit. Hand strengths are precomputed once into a typed array, so the whole
 * game takes about 32 million table look-ups. Every count is a plain integer
 * far below 2^53.
 */

import {
  ANTE_BONUS_PAYS,
  CATEGORIES,
  DECK_SIZE,
  PAIR_PLUS_PAYS,
  QUALIFY_SCORE,
  STRATEGY_PLAYS,
  cardIndex,
  categoryOfScore,
  rankValue,
  scoreRanks,
  type Card,
  type Category,
  type Decision,
  type PayTable,
  type Rank,
  type StrategyId,
} from './engine';

/** C(52,3): three-card hands. */
export const HAND_COUNT = 22_100;
/** C(49,3): dealer hands once the player's three cards are out of the deck. */
export const DEALER_HANDS = 18_424;
/** Player hand × dealer hand combinations. */
export const TOTAL_COMBINATIONS = HAND_COUNT * DEALER_HANDS;

/** Folding gives up the Ante: −1 ante, always. */
export const EV_FOLD = -1;

/** C(n,2) and C(n,3) for n = 0 … 51, as integer arrays so the hot loop indexes with plain ints. */
const C2 = Int32Array.from({ length: DECK_SIZE }, (_, n) => (n * (n - 1)) / 2);
const C3 = Int32Array.from({ length: DECK_SIZE }, (_, n) => (n * (n - 1) * (n - 2)) / 6);

/** Position of the hand {c0 < c1 < c2} (card indices 0–51) among all 22,100 hands. */
export const handIndex = (c0: number, c1: number, c2: number): number => C3[c2] + C2[c1] + c0;

interface Tables {
  /** Strength of every hand, by hand index. */
  scores: Uint16Array;
  /** The three card indices of every hand, ascending. */
  cards: Uint8Array;
}

let tables: Tables | null = null;

function getTables(): Tables {
  if (tables) return tables;
  const scores = new Uint16Array(HAND_COUNT);
  const cards = new Uint8Array(HAND_COUNT * 3);
  for (let c2 = 2; c2 < DECK_SIZE; c2++) {
    for (let c1 = 1; c1 < c2; c1++) {
      for (let c0 = 0; c0 < c1; c0++) {
        const h = C3[c2] + C2[c1] + c0;
        const flush = (c0 & 3) === (c1 & 3) && (c1 & 3) === (c2 & 3);
        scores[h] = scoreRanks((c0 >> 2) + 2, (c1 >> 2) + 2, (c2 >> 2) + 2, flush);
        cards[3 * h] = c0;
        cards[3 * h + 1] = c1;
        cards[3 * h + 2] = c2;
      }
    }
  }
  tables = { scores, cards };
  return tables;
}

// ---------------------------------------------------------------------------
// Hand frequencies and Pair Plus
// ---------------------------------------------------------------------------

let categoryCounts: Record<Category, number> | null = null;

/** How many of the 22,100 hands fall in each category. */
export function handCounts(): Record<Category, number> {
  if (!categoryCounts) {
    const counts = CATEGORIES.map(() => 0);
    const { scores } = getTables();
    for (let h = 0; h < HAND_COUNT; h++) counts[scores[h] >> 12]++;
    categoryCounts = Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i]])) as Record<Category, number>;
  }
  return categoryCounts;
}

let qualifyingCount: number | null = null;

/** Hands that are Queen-high or better (out of 22,100): what the dealer needs to qualify. */
export function qualifyingHands(): number {
  if (qualifyingCount === null) {
    const { scores } = getTables();
    let n = 0;
    for (let h = 0; h < HAND_COUNT; h++) if (scores[h] >= QUALIFY_SCORE) n++;
    qualifyingCount = n;
  }
  return qualifyingCount;
}

export interface PairPlusRow {
  category: Category;
  count: number;
  /** Profit per unit; 0 for the losing high-card hands. */
  pays: number;
  /** This row's share of the expected profit per unit bet. */
  contribution: number;
}

export interface PairPlusOdds {
  rows: PairPlusRow[];
  /** Units won minus units lost over all 22,100 hands, betting one unit on each. */
  net: number;
  /** Expected profit per unit; the house edge is −ev. */
  ev: number;
  /** Probability that the bet is paid. */
  win: number;
}

export function pairPlusOdds(pays: PayTable = PAIR_PLUS_PAYS): PairPlusOdds {
  const counts = handCounts();
  let net = 0;
  let wins = 0;
  const rows = CATEGORIES.map((category): PairPlusRow => {
    const count = counts[category];
    const profit = pays[category] > 0 ? count * pays[category] : -count;
    net += profit;
    if (pays[category] > 0) wins += count;
    return { category, count, pays: pays[category], contribution: profit / HAND_COUNT };
  });
  return { rows, net, ev: net / HAND_COUNT, win: wins / HAND_COUNT };
}

// ---------------------------------------------------------------------------
// One player hand against every dealer hand
// ---------------------------------------------------------------------------

/** Cards left in the deck once the player's three are out. */
const REST = DECK_SIZE - 3;
const QUALIFY = QUALIFY_SCORE;
/** Scratch space for the hot loop: those 49 cards and C(card,3) of each. */
const restCards = new Int32Array(REST);
const restC3 = new Int32Array(REST);

/**
 * Plays the hand {c0, c1, c2} against all 18,424 dealer hands from the other
 * 49 cards. Returns [dealer doesn't qualify, player wins, tie, dealer wins].
 */
function versusDealer(c0: number, c1: number, c2: number, playerScore: number, scores: Uint16Array): [number, number, number, number] {
  // Locals, not imported bindings: this loop runs 32 million times.
  const n = REST;
  const qualify = QUALIFY;
  let k = 0;
  for (let card = 0; card < n + 3; card++) {
    if (card === c0 || card === c1 || card === c2) continue;
    restCards[k] = card;
    restC3[k] = C3[card];
    k++;
  }
  // Branch-free tallies: for two scores below 2^31, (x − y) >>> 31 is 1 exactly when x < y.
  let notQualified = 0;
  let below = 0;
  let above = 0;
  for (let i = 0; i < n - 2; i++) {
    const a = restCards[i];
    for (let j = i + 1; j < n - 1; j++) {
      const base = C2[restCards[j]] + a;
      for (let m = j + 1; m < n; m++) {
        const dealer = scores[restC3[m] + base];
        notQualified += (dealer - qualify) >>> 31;
        below += (dealer - playerScore) >>> 31;
        above += (playerScore - dealer) >>> 31;
      }
    }
  }
  // A hand below Queen-high can't beat (or tie) a dealer who qualifies.
  if (playerScore < qualify) return [notQualified, 0, 0, DEALER_HANDS - notQualified];
  return [notQualified, below - notQualified, DEALER_HANDS - below - above, above];
}

/**
 * Antes won by playing, summed over the 18,424 dealer hands: +1 when the
 * dealer doesn't qualify (Ante paid, Play pushed), ±2 on a showdown, plus the
 * Ante Bonus every time.
 */
const playNet = (notQualified: number, win: number, lose: number, bonus: number): number =>
  notQualified + 2 * win - 2 * lose + bonus * DEALER_HANDS;

export interface HandOdds {
  /** Dealer hands (out of 18,424) that don't qualify, lose to, tie with and beat this hand. */
  notQualified: number;
  win: number;
  tie: number;
  lose: number;
  /** The Ante Bonus this hand earns, in antes. */
  bonus: number;
  /** Antes won by playing over all 18,424 dealer hands: evPlay × 18,424, an integer. */
  playNet: number;
  /** Expected profit of playing, in antes, Ante Bonus included. */
  evPlay: number;
  /** Expected profit of folding: always −1. */
  evFold: number;
  best: Decision;
}

/** The exact value of playing or folding the three cards in front of the player. */
export function handOdds(cards: readonly Card[]): HandOdds {
  if (cards.length !== 3) throw new Error('a hand is exactly three cards');
  const [c0, c1, c2] = cards.map(cardIndex).sort((x, y) => x - y);
  if (c0 === c1 || c1 === c2) throw new Error('the three cards must be different');
  const { scores } = getTables();
  const score = scores[handIndex(c0, c1, c2)];
  const [notQualified, win, tie, lose] = versusDealer(c0, c1, c2, score, scores);
  const bonus = ANTE_BONUS_PAYS[categoryOfScore(score)];
  const net = playNet(notQualified, win, lose, bonus);
  return {
    notQualified,
    win,
    tie,
    lose,
    bonus,
    playNet: net,
    evPlay: net / DEALER_HANDS,
    evFold: EV_FOLD,
    best: net > EV_FOLD * DEALER_HANDS ? 'play' : 'fold',
  };
}

// ---------------------------------------------------------------------------
// The whole game, by suit symmetry
// ---------------------------------------------------------------------------

/** Every way to relabel the four suits. */
const SUIT_PERMUTATIONS: number[][] = (() => {
  const out: number[][] = [];
  const walk = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) out.push(prefix);
    rest.forEach((s, i) => walk([...prefix, s], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  walk([], [0, 1, 2, 3]);
  return out;
})();

/** All player hands that are the same hand up to a relabeling of the suits. */
export interface Orbit {
  /** Hand index of the representative that was actually played out. */
  hand: number;
  /** Hands in the orbit: 4, 12 or 24. */
  weight: number;
  score: number;
  /** Dealer hands out of 18,424, for any hand of the orbit. */
  notQualified: number;
  win: number;
  tie: number;
  lose: number;
  bonus: number;
  /** Antes won by playing over the 18,424 dealer hands. */
  playNet: number;
}

let orbitCache: Orbit[] | null = null;

/** One representative per suit-symmetry class, played against every dealer hand. */
export function orbits(): Orbit[] {
  if (orbitCache) return orbitCache;
  const { scores, cards } = getTables();
  const visited = new Uint8Array(HAND_COUNT);
  const out: Orbit[] = [];
  for (let h = 0; h < HAND_COUNT; h++) {
    if (visited[h]) continue;
    const c0 = cards[3 * h];
    const c1 = cards[3 * h + 1];
    const c2 = cards[3 * h + 2];
    // Mark every suit relabeling of this hand; the distinct ones are its orbit.
    let weight = 0;
    for (const perm of SUIT_PERMUTATIONS) {
      let x = (c0 & ~3) | perm[c0 & 3];
      let y = (c1 & ~3) | perm[c1 & 3];
      let z = (c2 & ~3) | perm[c2 & 3];
      let t: number;
      if (x > y) {
        t = x;
        x = y;
        y = t;
      }
      if (y > z) {
        t = y;
        y = z;
        z = t;
      }
      if (x > y) {
        t = x;
        x = y;
        y = t;
      }
      const image = C3[z] + C2[y] + x;
      if (visited[image] === 0) {
        visited[image] = 1;
        weight++;
      }
    }
    const score = scores[h];
    const [notQualified, win, tie, lose] = versusDealer(c0, c1, c2, score, scores);
    const bonus = ANTE_BONUS_PAYS[categoryOfScore(score)];
    out.push({ hand: h, weight, score, notQualified, win, tie, lose, bonus, playNet: playNet(notQualified, win, lose, bonus) });
  }
  orbitCache = out;
  return out;
}

/** The cards of an orbit's representative hand, as card indices 0–51. */
export function orbitCards(orbit: Orbit): [number, number, number] {
  const { cards } = getTables();
  return [cards[3 * orbit.hand], cards[3 * orbit.hand + 1], cards[3 * orbit.hand + 2]];
}

export interface PolicyOdds {
  /** Player hands played, out of 22,100. */
  played: number;
  /** Combinations (out of 407,170,400) by how the Ante and Play bets end. */
  fold: number;
  notQualified: number;
  win: number;
  tie: number;
  lose: number;
  /** Antes paid as Ante Bonus over every combination, by hand category. */
  bonus: Record<Category, number>;
  /** Antes won minus antes lost over every combination: ev × 407,170,400, an integer. */
  net: number;
  /** Expected profit per hand, in antes. */
  ev: number;
  /** −ev: the usual "house edge", relative to the Ante. */
  houseEdge: number;
  playRate: number;
  /** Average amount put at risk per hand, in antes: the Ante plus the Play bet when made. */
  averageWager: number;
  /** House edge per unit actually wagered. */
  elementOfRisk: number;
}

/** Exact results of any rule that decides play / fold from the player's own hand. */
export function policyOdds(plays: (orbit: Orbit) => boolean): PolicyOdds {
  const bonus = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let played = 0;
  let fold = 0;
  let notQualified = 0;
  let win = 0;
  let tie = 0;
  let lose = 0;
  let net = 0;
  for (const o of orbits()) {
    if (plays(o)) {
      played += o.weight;
      notQualified += o.weight * o.notQualified;
      win += o.weight * o.win;
      tie += o.weight * o.tie;
      lose += o.weight * o.lose;
      bonus[categoryOfScore(o.score)] += o.weight * o.bonus * DEALER_HANDS;
      net += o.weight * o.playNet;
    } else {
      fold += o.weight * DEALER_HANDS;
      net += o.weight * EV_FOLD * DEALER_HANDS;
    }
  }
  const ev = net / TOTAL_COMBINATIONS;
  const playRate = played / HAND_COUNT;
  const averageWager = 1 + playRate;
  return { played, fold, notQualified, win, tie, lose, bonus, net, ev, houseEdge: -ev, playRate, averageWager, elementOfRisk: -ev / averageWager };
}

/** Plays exactly the hands whose expected value beats folding. */
export const playsOptimally = (orbit: Orbit): boolean => orbit.playNet > EV_FOLD * DEALER_HANDS;

const strategyCache = new Map<StrategyId, PolicyOdds>();

/**
 * Exact odds of the three strategies the Simulation tab plays. `optimal` is
 * decided hand by hand from the expected values (it turns out to be exactly
 * "Q-6-4 or better"); the other two are the fixed rules of the engine.
 */
export function strategyOdds(id: StrategyId): PolicyOdds {
  let odds = strategyCache.get(id);
  if (!odds) {
    odds = policyOdds(id === 'optimal' ? playsOptimally : (o) => STRATEGY_PLAYS[id](o.score));
    strategyCache.set(id, odds);
  }
  return odds;
}

// ---------------------------------------------------------------------------
// Hands around the threshold
// ---------------------------------------------------------------------------

export interface ScoreOdds {
  score: number;
  /** Hands with this exact strength (60 suit combinations for an unsuited high-card hand). */
  hands: number;
  /** Dealer hands summed over those hands: out of hands × 18,424. */
  notQualified: number;
  win: number;
  tie: number;
  lose: number;
  /** Expected profit of playing, averaged over the suit combinations. */
  evPlay: number;
  /** The worst and best suit combination — which cards are gone changes the dealer's hands a little. */
  evMin: number;
  evMax: number;
}

/** Everything about the hands of one exact strength (e.g. every unsuited Q-6-4). */
export function scoreOdds(score: number): ScoreOdds {
  const out: ScoreOdds = { score, hands: 0, notQualified: 0, win: 0, tie: 0, lose: 0, evPlay: 0, evMin: Infinity, evMax: -Infinity };
  let net = 0;
  for (const o of orbits()) {
    if (o.score !== score) continue;
    out.hands += o.weight;
    out.notQualified += o.weight * o.notQualified;
    out.win += o.weight * o.win;
    out.tie += o.weight * o.tie;
    out.lose += o.weight * o.lose;
    net += o.weight * o.playNet;
    const ev = o.playNet / DEALER_HANDS;
    out.evMin = Math.min(out.evMin, ev);
    out.evMax = Math.max(out.evMax, ev);
  }
  if (out.hands === 0) throw new Error('no hand has that score');
  out.evPlay = net / (out.hands * DEALER_HANDS);
  return out;
}

/** The unsuited hand made of three different ranks, e.g. Q-6-4. */
export const ranksOdds = (ranks: readonly Rank[]): ScoreOdds =>
  scoreOdds(scoreRanks(rankValue(ranks[0]), rankValue(ranks[1]), rankValue(ranks[2]), false));

export interface CurvePoint {
  score: number;
  evPlay: number;
}

/** EV of playing every unsuited high-card hand, from the worst (5-3-2) to the best (A-K-J). */
export function highCardCurve(): CurvePoint[] {
  const sums = new Map<number, { net: number; hands: number }>();
  for (const o of orbits()) {
    if (o.score >> 12 !== 0) continue;
    const s = sums.get(o.score) ?? { net: 0, hands: 0 };
    s.net += o.weight * o.playNet;
    s.hands += o.weight;
    sums.set(o.score, s);
  }
  return [...sums.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([score, s]) => ({ score, evPlay: s.net / (s.hands * DEALER_HANDS) }));
}

/** The three rank values a high-card / flush score was built from, high to low. */
export const scoreRanksOf = (score: number): [number, number, number] => [(score >> 8) & 15, (score >> 4) & 15, score & 15];
