/**
 * Blackjack engine for teaching Basic Strategy.
 *
 * House rules (stated once, applied everywhere):
 * - 6-deck shoe, reshuffled every round (so card counting gives no edge; the
 *   Monte-Carlo edge reflects pure Basic Strategy, not deck composition).
 * - Dealer STANDS on all 17, including soft 17 (S17).
 * - Blackjack (natural 21 on the first two cards) pays 3:2.
 * - Player may Double on any first two cards, and Double After Split (DAS) is
 *   allowed.
 * - Splitting: pairs may be split (up to 4 hands / 3 re-splits). Split Aces
 *   receive exactly one card each and cannot be re-split or hit.
 * - Insurance is offered when the dealer shows an Ace and pays 2:1; Basic
 *   Strategy never takes it (it is a -EV side bet), so the advisor always
 *   recommends declining.
 *
 * The Basic Strategy tables below are the standard published charts for
 * 4-8 deck, S17, DAS, no surrender.
 */

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';
export interface Card { rank: Rank; suit: '♠' | '♥' | '♦' | '♣' }

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];

/** Number of 52-card decks in the shoe. */
export const DECK_COUNT = 6;

/** A single 52-card deck (used by unit tests and as the shoe building block). */
export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
}

/** A full multi-deck shoe. */
export function newShoe(decks: number = DECK_COUNT): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) shoe.push(...newDeck());
  return shoe;
}

export function shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Numeric value of a single card. Ace counts as 11 here; soft-handling happens in handValue. */
export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (card.rank === 'T' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export interface HandValue {
  total: number;
  /** True if at least one ace is counted as 11. */
  soft: boolean;
}

export function handValue(hand: Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else total += cardValue(c);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBust(hand: Card[]): boolean {
  return handValue(hand).total > 21;
}

/** A natural: exactly two cards totalling 21. */
export function isBlackjack(hand: Card[]): boolean {
  if (hand.length !== 2) return false;
  return handValue(hand).total === 21;
}

/** True when a two-card hand is a splittable pair (by rank value, so T/J/Q/K pair). */
export function isPair(hand: Card[]): boolean {
  if (hand.length !== 2) return false;
  return cardValue(hand[0]) === cardValue(hand[1]);
}

// ---------- Basic Strategy ----------

export type Action = 'hit' | 'stand' | 'double' | 'split';

/**
 * Returns 0-based index into a 10-entry [2,3,4,5,6,7,8,9,T,A] dealer upcard array.
 */
function dealerIdx(card: Card): number {
  if (card.rank === 'A') return 9;
  if (cardValue(card) === 10) return 8; // T/J/Q/K all map to 10
  return cardValue(card) - 2; // 2→0, ..., 9→7
}

const D = 'double' as const;
const H = 'hit' as const;
const S = 'stand' as const;
const P = 'split' as const;

// Hard totals 5-21 vs dealer 2-A. 4-8 deck, S17, DAS, no surrender.
const HARD_TABLE: Record<number, readonly Action[]> = {
  // dealer:        2  3  4  5  6  7  8  9  T  A
  5:  [H, H, H, H, H, H, H, H, H, H],
  6:  [H, H, H, H, H, H, H, H, H, H],
  7:  [H, H, H, H, H, H, H, H, H, H],
  8:  [H, H, H, H, H, H, H, H, H, H],
  9:  [H, D, D, D, D, H, H, H, H, H],
  10: [D, D, D, D, D, D, D, D, H, H],
  11: [D, D, D, D, D, D, D, D, D, H],
  12: [H, H, S, S, S, H, H, H, H, H],
  13: [S, S, S, S, S, H, H, H, H, H],
  14: [S, S, S, S, S, H, H, H, H, H],
  15: [S, S, S, S, S, H, H, H, H, H],
  16: [S, S, S, S, S, H, H, H, H, H],
  17: [S, S, S, S, S, S, S, S, S, S],
  18: [S, S, S, S, S, S, S, S, S, S],
  19: [S, S, S, S, S, S, S, S, S, S],
  20: [S, S, S, S, S, S, S, S, S, S],
  21: [S, S, S, S, S, S, S, S, S, S],
};

// Soft totals 13 (A,2) .. 20 (A,9). S17, DAS.
const SOFT_TABLE: Record<number, readonly Action[]> = {
  // dealer:        2  3  4  5  6  7  8  9  T  A
  13: [H, H, H, D, D, H, H, H, H, H],
  14: [H, H, H, D, D, H, H, H, H, H],
  15: [H, H, D, D, D, H, H, H, H, H],
  16: [H, H, D, D, D, H, H, H, H, H],
  17: [H, D, D, D, D, H, H, H, H, H],
  18: [S, D, D, D, D, S, S, H, H, H],
  19: [S, S, S, S, D, S, S, S, S, S], // A,8 doubles vs 6 under S17
  20: [S, S, S, S, S, S, S, S, S, S],
};

// Pair splitting, keyed by the single-card value of the pair (2..11; 11 = Aces,
// 10 = any two ten-value cards). 4-8 deck, DAS. "P" = split.
const PAIR_TABLE: Record<number, readonly Action[]> = {
  // dealer:        2  3  4  5  6  7  8  9  T  A
  2:  [P, P, P, P, P, P, H, H, H, H],
  3:  [P, P, P, P, P, P, H, H, H, H],
  4:  [H, H, H, P, P, H, H, H, H, H], // 4,4 splits only vs 5-6 (DAS)
  5:  [D, D, D, D, D, D, D, D, H, H], // never split; play as hard 10
  6:  [P, P, P, P, P, H, H, H, H, H],
  7:  [P, P, P, P, P, P, H, H, H, H],
  8:  [P, P, P, P, P, P, P, P, P, P], // always split 8s
  9:  [P, P, P, P, P, S, P, P, S, S], // stand vs 7, T, A
  10: [S, S, S, S, S, S, S, S, S, S], // never split tens
  11: [P, P, P, P, P, P, P, P, P, P], // always split Aces
};

export interface StrategyContext {
  canDouble?: boolean;
  canSplit?: boolean;
}

/**
 * Basic-strategy decision for a player hand vs a dealer upcard.
 * - `canDouble` false (e.g. more than 2 cards, or funds/rule bar it) →
 *   Double collapses to Hit.
 * - `canSplit` false → Split collapses to the correct hard/soft play.
 */
export function basicStrategyDecision(
  playerHand: Card[],
  dealerUp: Card,
  canDouble: boolean = playerHand.length === 2,
  canSplit: boolean = false,
): Action {
  const di = dealerIdx(dealerUp);

  // Pair splitting is evaluated first (only on a true two-card pair).
  if (canSplit && isPair(playerHand)) {
    const pairKey = cardValue(playerHand[0]); // 2..11
    const rec = PAIR_TABLE[pairKey][di];
    if (rec === 'split') return 'split';
    // Non-split recommendation for a pair falls through to hard/soft logic
    // below (e.g. 5,5 → double as 10; 10,10 → stand).
  }

  const v = handValue(playerHand);
  let raw: Action;
  if (v.soft && v.total >= 13 && v.total <= 20) {
    raw = SOFT_TABLE[v.total][di];
  } else if (v.total >= 5 && v.total <= 21) {
    raw = HARD_TABLE[v.total][di];
  } else {
    raw = H;
  }
  if (raw === 'double' && !canDouble) return 'hit';
  return raw;
}

/**
 * Insurance advice. Basic Strategy always declines insurance regardless of the
 * player hand, because it is an independent -EV bet at 2:1 (breaks even only
 * when the dealer has a ten in the hole more than 1/3 of the time).
 */
export function shouldTakeInsurance(): boolean {
  return false;
}

// ---------- Round play ----------

/**
 * Dealer hits until reaching a hard or soft total of 17 or more (S17).
 * Mutates `dealer` in place. `drawNext` returns the next card; the loop bails
 * if the draw source is exhausted.
 */
export function playDealerTurn(dealer: Card[], drawNext: () => Card | undefined): void {
  while (true) {
    const v = handValue(dealer);
    if (v.total >= 17) break; // S17: stand on all 17 (soft or hard)
    const card = drawNext();
    if (!card) break;
    dealer.push(card);
  }
}

export type Outcome = 'win' | 'lose' | 'push' | 'blackjack';

export interface RoundResult {
  player: Card[];
  dealer: Card[];
  outcome: Outcome;
  bet: number;
  /** Net change to bankroll (positive = profit). */
  net: number;
  doubled: boolean;
  split?: boolean;
}

/**
 * Compare a finished (non-natural) player hand against the finished dealer hand.
 * Returns the net multiple of `bet` (win = +bet, lose = -bet, push = 0).
 */
function settleHand(player: Card[], dealer: Card[], bet: number): { net: number; outcome: Outcome } {
  if (isBust(player)) return { net: -bet, outcome: 'lose' };
  const pV = handValue(player).total;
  const dV = handValue(dealer).total;
  if (dV > 21 || pV > dV) return { net: bet, outcome: 'win' };
  if (pV < dV) return { net: -bet, outcome: 'lose' };
  return { net: 0, outcome: 'push' };
}

/**
 * Run one round with a given strategy callback, including splitting. The
 * strategy decides actions one at a time based on the visible state.
 *
 * Splits are supported for the Monte-Carlo simulation: each split hand is
 * played out with the same strategy, then all hands are settled against a
 * single dealer hand. `net` is the summed bankroll change across all hands;
 * `bet` is the total amount wagered (base bet × number of hands, doubled
 * where applicable). The returned `player` array is the first hand (for
 * display); `split` flags a multi-hand round.
 */
export function playRound(
  bet: number,
  strategy: (player: Card[], dealerUp: Card, canDouble: boolean, canSplit: boolean) => Action,
  rng: () => number = Math.random,
): RoundResult {
  const shoe = shuffle(newShoe(), rng);
  let cursor = 0;
  const draw = (): Card => shoe[cursor++];

  const player: Card[] = [draw(), draw()];
  const dealer: Card[] = [draw(), draw()];

  if (isBlackjack(player)) {
    if (isBlackjack(dealer)) {
      return { player, dealer, outcome: 'push', bet, net: 0, doubled: false };
    }
    return { player, dealer, outcome: 'blackjack', bet, net: bet * 1.5, doubled: false };
  }
  // Dealer natural with a non-natural player: the round ends immediately.
  if (isBlackjack(dealer)) {
    return { player, dealer, outcome: 'lose', bet, net: -bet, doubled: false };
  }

  const MAX_HANDS = 4;
  // Each entry: the cards of one player hand plus its wager and whether it can
  // still act (split-Aces get exactly one card).
  interface SubHand { cards: Card[]; wager: number; done: boolean; fromSplitAces: boolean; }
  const hands: SubHand[] = [{ cards: player, wager: bet, done: false, fromSplitAces: false }];
  let didSplit = false;
  let didDouble = false;

  for (let hi = 0; hi < hands.length; hi++) {
    const hand = hands[hi];
    if (hand.fromSplitAces) {
      // One card already dealt on split; no further action.
      continue;
    }
    while (!hand.done) {
      const canDouble = hand.cards.length === 2;
      const canSplit = hand.cards.length === 2 && isPair(hand.cards) && hands.length < MAX_HANDS;
      const action = strategy(hand.cards, dealer[0], canDouble, canSplit);

      if (action === 'split' && canSplit) {
        didSplit = true;
        const splitAces = cardValue(hand.cards[0]) === 11;
        const cardA = hand.cards[0];
        const cardB = hand.cards[1];
        // First hand keeps cardA + one new card; new hand gets cardB + one new card.
        hand.cards = [cardA, draw()];
        const newHand: SubHand = { cards: [cardB, draw()], wager: bet, done: false, fromSplitAces: splitAces };
        hands.push(newHand);
        if (splitAces) {
          hand.fromSplitAces = true;
          hand.done = true;
        }
        continue;
      }

      if (action === 'double' && canDouble) {
        didDouble = true;
        hand.wager = hand.wager * 2;
        hand.cards.push(draw());
        hand.done = true;
        break;
      }

      if (action === 'stand') {
        hand.done = true;
        break;
      }

      // hit (also the fallback when split/double are recommended but not allowed)
      hand.cards.push(draw());
      if (isBust(hand.cards)) {
        hand.done = true;
        break;
      }
    }
  }

  // Dealer only draws if at least one player hand is still live (not all bust).
  const anyLive = hands.some((h) => !isBust(h.cards));
  if (anyLive) playDealerTurn(dealer, draw);

  let totalNet = 0;
  let totalWager = 0;
  let anyWin = false;
  let anyLoss = false;
  for (const h of hands) {
    const { net } = settleHand(h.cards, dealer, h.wager);
    totalNet += net;
    totalWager += h.wager;
    if (net > 0) anyWin = true;
    if (net < 0) anyLoss = true;
  }

  let outcome: Outcome;
  if (totalNet > 0) outcome = 'win';
  else if (totalNet < 0) outcome = 'lose';
  else outcome = anyWin || anyLoss ? 'push' : 'push';

  return {
    player: hands[0].cards,
    dealer,
    outcome,
    bet: totalWager,
    net: totalNet,
    doubled: didDouble,
    split: didSplit,
  };
}

// ---------- Strategies ----------

export type StrategyName = 'basic' | 'mimic-dealer' | 'always-stand';

type Decider = (player: Card[], dealerUp: Card, canDouble: boolean, canSplit: boolean) => Action;

export function strategyFor(name: StrategyName): Decider {
  switch (name) {
    case 'basic':
      return (player, dealerUp, canDouble, canSplit) =>
        basicStrategyDecision(player, dealerUp, canDouble, canSplit);
    case 'mimic-dealer':
      return (player) => {
        const v = handValue(player);
        return v.total < 17 ? 'hit' : 'stand';
      };
    case 'always-stand':
      return () => 'stand';
  }
}

// ---------- Monte Carlo ----------

export interface SimSummary {
  strategy: StrategyName;
  hands: number;
  totalNet: number;
  rtp: number;            // return per unit wagered (EV per round = (rtp - 1) * baseBet)
  edge: number;           // house edge = 1 - rtp (negative if player edge)
  winCount: number;
  pushCount: number;
  loseCount: number;
  blackjackCount: number;
  /** Bankroll trajectory sampled every `sampleEvery` rounds. */
  trajectory: number[];
  trajectoryX: number[];
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  chunkSize?: number;
  startingBankroll?: number;
  baseBet?: number;
  sampleEvery?: number;
}

export async function runBlackjackSimAsync(
  strategy: StrategyName,
  hands: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<SimSummary | null> {
  if (!Number.isInteger(hands) || hands <= 0) {
    throw new Error('runBlackjackSimAsync: hands must be a positive integer');
  }
  const chunkSize = options.chunkSize ?? 5000;
  const startingBankroll = options.startingBankroll ?? 1000;
  const baseBet = options.baseBet ?? 1;
  const sampleEvery = options.sampleEvery ?? Math.max(1, Math.floor(hands / 200));
  const decide = strategyFor(strategy);

  let bankroll = startingBankroll;
  let totalWagered = 0;
  let totalNet = 0;
  let wins = 0, pushes = 0, losses = 0, blackjacks = 0;
  const traj: number[] = [bankroll];
  const trajX: number[] = [0];

  for (let i = 0; i < hands; i += chunkSize) {
    const end = Math.min(i + chunkSize, hands);
    for (let j = i; j < end; j++) {
      const r = playRound(baseBet, decide, rng);
      bankroll += r.net;
      totalWagered += r.bet;
      totalNet += r.net;
      if (r.outcome === 'win') wins++;
      else if (r.outcome === 'push') pushes++;
      else if (r.outcome === 'lose') losses++;
      else if (r.outcome === 'blackjack') { wins++; blackjacks++; }
      const n = j + 1;
      if (n % sampleEvery === 0 || n === hands) {
        traj.push(bankroll);
        trajX.push(n);
      }
    }
    options.onProgress?.(end, hands);
    if (options.signal?.aborted) return null;
    if (end < hands) await new Promise<void>((res) => setTimeout(res, 0));
  }

  const rtp = totalWagered === 0 ? 1 : (totalWagered + totalNet) / totalWagered;
  return {
    strategy,
    hands,
    totalNet,
    rtp,
    edge: 1 - rtp,
    winCount: wins,
    pushCount: pushes,
    loseCount: losses,
    blackjackCount: blackjacks,
    trajectory: traj,
    trajectoryX: trajX,
  };
}
