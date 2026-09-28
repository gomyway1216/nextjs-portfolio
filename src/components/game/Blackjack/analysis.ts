/**
 * Exact blackjack expectations for an infinite deck: every card is drawn with
 * the same probabilities (1/13 for each rank, 4/13 for a ten-value card), so a
 * hand's expectation depends only on its total and softness. Six- and
 * eight-deck shoes differ from these numbers by about a tenth of a percent.
 *
 * Everything here is computed, nothing is simulated: the dealer's final-total
 * distribution by recursion, then the expected value of standing, hitting,
 * doubling, splitting (with resplits) and surrendering for every hand.
 */

/** Card values 2..11 (11 = ace). */
export const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export type Value = (typeof VALUES)[number];
/** Probability of each value from an infinite deck. */
export const P: Record<Value, number> = { 2: 1 / 13, 3: 1 / 13, 4: 1 / 13, 5: 1 / 13, 6: 1 / 13, 7: 1 / 13, 8: 1 / 13, 9: 1 / 13, 10: 4 / 13, 11: 1 / 13 };

export interface Rules {
  /** Dealer hits soft 17 (H17) instead of standing (S17). */
  hitSoft17: boolean;
  /** Profit per unit on a natural: 1.5 for 3:2, 1.2 for 6:5. */
  blackjackPays: number;
  doubleAfterSplit: boolean;
  /** Most hands a player can split to. */
  maxHands: number;
  /** Late surrender: give up half the bet after the dealer checks for blackjack. */
  surrender: boolean;
}

/** The rules of this table. */
export const TABLE_RULES: Rules = { hitSoft17: false, blackjackPays: 1.5, doubleAfterSplit: true, maxHands: 4, surrender: false };

// ---------------------------------------------------------------------------
// Hand arithmetic
// ---------------------------------------------------------------------------

export interface Total {
  total: number;
  /** An ace is being counted as 11. */
  soft: boolean;
}

/** Total of a list of card values, counting one ace as 11 when it fits. */
export function totalOf(values: readonly Value[]): Total {
  let t = 0;
  let aces = 0;
  for (const v of values) {
    t += v;
    if (v === 11) aces++;
  }
  while (t > 21 && aces > 0) {
    t -= 10;
    aces--;
  }
  return { total: t, soft: aces > 0 };
}

// ---------------------------------------------------------------------------
// Dealer
// ---------------------------------------------------------------------------

/** Dealer outcome probabilities: final 17–21, bust, and blackjack. */
export interface DealerOutcome {
  17: number;
  18: number;
  19: number;
  20: number;
  21: number;
  bust: number;
  blackjack: number;
}

const DEALER_KEYS = [17, 18, 19, 20, 21] as const;

const dealerStands = ({ total, soft }: Total, rules: Rules) => total >= 18 || (total === 17 && !(soft && rules.hitSoft17));

/** Distribution of the dealer's final total from a hand of two or more cards. */
function dealerFrom(hand: Total, rules: Rules, memo: Map<string, number[]>): number[] {
  if (hand.total > 21) return [0, 0, 0, 0, 0, 1];
  if (dealerStands(hand, rules)) {
    const out = [0, 0, 0, 0, 0, 0];
    out[hand.total - 17] = 1;
    return out;
  }
  const key = `${hand.total},${hand.soft}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const out = [0, 0, 0, 0, 0, 0];
  for (const v of VALUES) {
    const next = dealerFrom(addValue(hand, v), rules, memo);
    for (let i = 0; i < 6; i++) out[i] += P[v] * next[i];
  }
  memo.set(key, out);
  return out;
}

/** Adds a card to a total, treating an ace as 11 only while it fits. */
export function addValue(hand: Total, v: Value): Total {
  let total = hand.total + v;
  let aces = hand.soft ? 1 : 0;
  if (v === 11) aces++;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

/** The dealer's outcome distribution given the up card (hole card still unknown). */
export function dealerOutcome(up: Value, rules: Rules = TABLE_RULES): DealerOutcome {
  const memo = new Map<string, number[]>();
  const out: DealerOutcome = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0, blackjack: 0 };
  const upTotal: Total = { total: up, soft: up === 11 };
  for (const hole of VALUES) {
    const p = P[hole];
    if ((up === 11 && hole === 10) || (up === 10 && hole === 11)) {
      out.blackjack += p;
      continue;
    }
    const dist = dealerFrom(addValue(upTotal, hole), rules, memo);
    DEALER_KEYS.forEach((k, i) => (out[k] += p * dist[i]));
    out.bust += p * dist[5];
  }
  return out;
}

/** Same, given the dealer has checked and does not have blackjack. */
export function dealerOutcomeNoBlackjack(up: Value, rules: Rules = TABLE_RULES): DealerOutcome {
  const d = dealerOutcome(up, rules);
  const keep = 1 - d.blackjack;
  return { 17: d[17] / keep, 18: d[18] / keep, 19: d[19] / keep, 20: d[20] / keep, 21: d[21] / keep, bust: d.bust / keep, blackjack: 0 };
}

export const dealerBlackjackChance = (up: Value) => (up === 11 ? P[10] : up === 10 ? P[11] : 0);

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export type Action = 'stand' | 'hit' | 'double' | 'split' | 'surrender';

/** Expected values of each action for one situation (undefined = not allowed). */
export type ActionEvs = Partial<Record<Action, number>>;

export const bestAction = (evs: ActionEvs): Action =>
  (Object.entries(evs) as [Action, number][]).reduce((best, cur) => (cur[1] > best[1] + 1e-12 ? cur : best))[0];

/**
 * Expectations against one dealer up card, after the dealer has checked for
 * blackjack (the table peeks, so doubles and splits only ever meet a dealer
 * without a natural).
 */
export class UpcardAnalysis {
  readonly dealer: DealerOutcome;
  private readonly standMemo = new Map<number, number>();
  private readonly hitMemo = new Map<string, number>();

  constructor(
    readonly up: Value,
    readonly rules: Rules = TABLE_RULES,
  ) {
    this.dealer = dealerOutcomeNoBlackjack(up, rules);
  }

  /** Standing on a total (a bust hand loses). */
  stand(total: number): number {
    if (total > 21) return -1;
    let ev = this.standMemo.get(total);
    if (ev !== undefined) return ev;
    const d = this.dealer;
    ev = d.bust;
    for (const k of DEALER_KEYS) ev += total > k ? d[k] : total < k ? -d[k] : 0;
    this.standMemo.set(total, ev);
    return ev;
  }

  /** Best of hitting and standing once doubling is off the table. */
  hitOrStand(hand: Total): number {
    return Math.max(this.stand(hand.total), this.hit(hand));
  }

  /** Taking one card, then playing on as well as possible (no doubling). */
  hit(hand: Total): number {
    if (hand.total > 21) return -1;
    const key = `${hand.total},${hand.soft}`;
    let ev = this.hitMemo.get(key);
    if (ev !== undefined) return ev;
    ev = 0;
    for (const v of VALUES) {
      const next = addValue(hand, v);
      ev += P[v] * (next.total > 21 ? -1 : this.hitOrStand(next));
    }
    this.hitMemo.set(key, ev);
    return ev;
  }

  /** Doubling: twice the stake, exactly one more card. */
  double(hand: Total): number {
    let ev = 0;
    for (const v of VALUES) ev += P[v] * this.stand(addValue(hand, v).total);
    return 2 * ev;
  }

  /** A two-card hand's options (no split), optionally without doubling. */
  twoCard(hand: Total, canDouble = true): ActionEvs {
    const evs: ActionEvs = { stand: this.stand(hand.total), hit: this.hit(hand) };
    if (canDouble) evs.double = this.double(hand);
    return evs;
  }

  private bestTwoCard(hand: Total, canDouble: boolean): number {
    return Math.max(...Object.values(this.twoCard(hand, canDouble)));
  }

  /**
   * Splitting a pair of `v`s, with resplits up to `maxHands` and double after
   * split if allowed. Split aces get one card each and can't be resplit.
   * Hands are independent in expectation, so the total is the expected sum of
   * each hand's value, with the resplit decision made optimally.
   */
  split(v: Value): number {
    const pair = P[v];
    const start: Total = { total: v, soft: v === 11 };
    if (v === 11) {
      // One card on each ace; A + A is just soft 12.
      let hand = 0;
      for (const c of VALUES) hand += P[c] * this.stand(addValue(start, c).total);
      return 2 * hand;
    }
    const das = this.rules.doubleAfterSplit;
    // Expected value of a split hand whose second card is not another `v`.
    let other = 0;
    for (const c of VALUES) if (c !== v) other += P[c] * this.bestTwoCard(addValue(start, c), das);
    const asPair = this.bestTwoCard(addValue(start, v), das);
    const maxHands = this.rules.maxHands;
    const memo = new Map<string, number>();
    // value(hands, pending): expected sum over the `pending` hands still waiting for a second card.
    const value = (hands: number, pending: number): number => {
      if (pending === 0) return 0;
      const key = `${hands},${pending}`;
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      const rest = value(hands, pending - 1);
      const keep = asPair + rest;
      const again = hands < maxHands ? Math.max(keep, value(hands + 1, pending + 1)) : keep;
      const ev = other + (1 - pair) * rest + pair * again;
      memo.set(key, ev);
      return ev;
    };
    return value(2, 2);
  }

  /** Every option for the first two cards (values c1, c2). */
  initial(c1: Value, c2: Value): ActionEvs {
    const hand = addValue({ total: c1, soft: c1 === 11 }, c2);
    const evs = this.twoCard(hand, true);
    if (c1 === c2) evs.split = this.split(c1);
    if (this.rules.surrender) evs.surrender = -0.5;
    return evs;
  }
}

const analysisCache = new Map<string, UpcardAnalysis>();
export function upcard(up: Value, rules: Rules = TABLE_RULES): UpcardAnalysis {
  const key = `${up}|${JSON.stringify(rules)}`;
  let a = analysisCache.get(key);
  if (!a) {
    a = new UpcardAnalysis(up, rules);
    analysisCache.set(key, a);
  }
  return a;
}

// ---------------------------------------------------------------------------
// The whole game
// ---------------------------------------------------------------------------

export interface GameValue {
  /** Expected profit per initial unit bet, playing every hand optimally. */
  ev: number;
  /** −ev. */
  houseEdge: number;
  playerBlackjack: number;
  dealerBlackjack: number;
}

/**
 * The game's expectation with perfect (total-dependent, infinite-deck) play:
 * every up card, every two-card start, never insurance.
 */
export function gameValue(rules: Rules = TABLE_RULES): GameValue {
  let ev = 0;
  const bj = 2 * P[11] * P[10];
  let dealerBj = 0;
  for (const up of VALUES) {
    const a = upcard(up, rules);
    const dBj = dealerBlackjackChance(up);
    dealerBj += P[up] * dBj;
    let evUp = 0;
    for (const c1 of VALUES) {
      for (const c2 of VALUES) {
        const p = P[c1] * P[c2];
        const natural = (c1 === 11 && c2 === 10) || (c1 === 10 && c2 === 11);
        if (natural) {
          evUp += p * (1 - dBj) * rules.blackjackPays;
        } else {
          const best = Math.max(...Object.values(a.initial(c1, c2)));
          evUp += p * (dBj * -1 + (1 - dBj) * best);
        }
      }
    }
    ev += P[up] * evUp;
  }
  return { ev, houseEdge: -ev, playerBlackjack: bj, dealerBlackjack: dealerBj };
}

/**
 * The expectation of a fixed hit/stand policy that never doubles or splits
 * (and never takes insurance) — e.g. "play like the dealer".
 */
export function policyValue(shouldHit: (hand: Total) => boolean, rules: Rules = TABLE_RULES): number {
  let ev = 0;
  for (const up of VALUES) {
    const a = upcard(up, rules);
    const dBj = dealerBlackjackChance(up);
    const memo = new Map<string, number>();
    const play = (hand: Total): number => {
      if (hand.total > 21) return -1;
      const key = `${hand.total},${hand.soft}`;
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      let v: number;
      if (shouldHit(hand)) {
        v = 0;
        for (const c of VALUES) v += P[c] * play(addValue(hand, c));
      } else {
        v = a.stand(hand.total);
      }
      memo.set(key, v);
      return v;
    };
    let evUp = 0;
    for (const c1 of VALUES) {
      for (const c2 of VALUES) {
        const p = P[c1] * P[c2];
        const natural = (c1 === 11 && c2 === 10) || (c1 === 10 && c2 === 11);
        if (natural) evUp += p * (1 - dBj) * rules.blackjackPays;
        else evUp += p * (-dBj + (1 - dBj) * play(addValue({ total: c1, soft: c1 === 11 }, c2)));
      }
    }
    ev += P[up] * evUp;
  }
  return ev;
}

/** One cell of a strategy chart: the best play and every option's expectation. */
export interface ChartCell {
  best: Action;
  evs: ActionEvs;
}

/**
 * The best play for every starting hand against every up card (infinite deck,
 * after the dealer checks for blackjack): hard 5–20, soft 13–20 and pairs.
 */
export function optimalChart(rules: Rules = TABLE_RULES) {
  const hard: Record<number, ChartCell[]> = {};
  const soft: Record<number, ChartCell[]> = {};
  const pairs: Record<number, ChartCell[]> = {};
  for (const up of VALUES) {
    const a = upcard(up, rules);
    for (let t = 5; t <= 20; t++) {
      const evs = a.twoCard({ total: t, soft: false });
      if (rules.surrender) evs.surrender = -0.5;
      (hard[t] ??= []).push({ best: bestAction(evs), evs });
    }
    for (let t = 13; t <= 20; t++) {
      const evs = a.twoCard({ total: t, soft: true });
      if (rules.surrender) evs.surrender = -0.5;
      (soft[t] ??= []).push({ best: bestAction(evs), evs });
    }
    for (const v of VALUES) {
      const evs = a.initial(v, v);
      (pairs[v] ??= []).push({ best: bestAction(evs), evs });
    }
  }
  return { hard, soft, pairs };
}
