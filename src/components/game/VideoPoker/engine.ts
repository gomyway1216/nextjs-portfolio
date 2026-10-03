/**
 * Jacks or Better video poker: cards, hand ranking, pay tables and the deal /
 * draw of one game. Pure functions; the machine, the exact analysis and the
 * simulations all share them.
 *
 * Cards are numbers 0–51: `suit * 13 + rank`, rank 0 = deuce … 12 = ace.
 */

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];
export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export const rankOf = (card: number) => card % 13;
export const suitOf = (card: number) => (card / 13) | 0;
export const cardLabel = (card: number) => `${RANK_LABELS[rankOf(card)]}${SUITS[suitOf(card)]}`;
export const isRed = (card: number) => suitOf(card) === 1 || suitOf(card) === 2;

/** Final hands, weakest to strongest. `nothing` covers high cards and pairs below jacks. */
export const HANDS = [
  'nothing',
  'jacksOrBetter',
  'twoPair',
  'threeOfAKind',
  'straight',
  'flush',
  'fullHouse',
  'fourOfAKind',
  'straightFlush',
  'royalFlush',
] as const;
export type HandName = (typeof HANDS)[number];
/** Index into HANDS. */
export type HandRank = number;

const JACK = 9;
const ROYAL_MASK = 0b1111100000000;
const WHEEL_MASK = 0b1000000001111;

/** Ranks a five-card hand (returns an index into HANDS). */
export function rankHand(c0: number, c1: number, c2: number, c3: number, c4: number): HandRank {
  const r0 = c0 % 13;
  const r1 = c1 % 13;
  const r2 = c2 % 13;
  const r3 = c3 % 13;
  const r4 = c4 % 13;
  const mask = (1 << r0) | (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4);
  // Number of distinct ranks.
  let m = mask;
  let distinct = 0;
  while (m) {
    m &= m - 1;
    distinct++;
  }
  if (distinct === 5) {
    const s = (c0 / 13) | 0;
    const flush = s === ((c1 / 13) | 0) && s === ((c2 / 13) | 0) && s === ((c3 / 13) | 0) && s === ((c4 / 13) | 0);
    // Five consecutive bits (dividing by the lowest set bit leaves 11111), or the wheel A-2-3-4-5.
    const straight = mask / (mask & -mask) === 31 || mask === WHEEL_MASK;
    if (straight && flush) return mask === ROYAL_MASK ? 9 : 8;
    if (flush) return 5;
    return straight ? 4 : 0;
  }
  if (distinct === 4) {
    // One pair: find the rank that appears twice.
    const pair = r0 === r1 || r0 === r2 || r0 === r3 || r0 === r4 ? r0 : r1 === r2 || r1 === r3 || r1 === r4 ? r1 : r2 === r3 || r2 === r4 ? r2 : r3;
    return pair >= JACK ? 1 : 0;
  }
  // Two or three distinct ranks: count the most frequent rank.
  const n0 = 1 + (r0 === r1 ? 1 : 0) + (r0 === r2 ? 1 : 0) + (r0 === r3 ? 1 : 0) + (r0 === r4 ? 1 : 0);
  const n1 = 1 + (r1 === r0 ? 1 : 0) + (r1 === r2 ? 1 : 0) + (r1 === r3 ? 1 : 0) + (r1 === r4 ? 1 : 0);
  const n2 = 1 + (r2 === r0 ? 1 : 0) + (r2 === r1 ? 1 : 0) + (r2 === r3 ? 1 : 0) + (r2 === r4 ? 1 : 0);
  const top = Math.max(n0, n1, n2);
  if (distinct === 3) return top === 3 ? 3 : 2;
  return top === 4 ? 7 : 6;
}

export const rankCards = (cards: readonly number[]): HandRank => rankHand(cards[0], cards[1], cards[2], cards[3], cards[4]);

// ---------------------------------------------------------------------------
// Pay tables
// ---------------------------------------------------------------------------

/** Payout per coin for each hand in HANDS (the royal's 800 assumes a five-coin bet). */
export type PayTable = readonly number[];

/** "Full house / flush" names the two lines casinos change. */
export const PAY_TABLE_IDS = ['9/6', '9/5', '8/6', '8/5', '7/5', '6/5'] as const;
export type PayTableId = (typeof PAY_TABLE_IDS)[number];

const table = (fullHouse: number, flush: number): PayTable => [0, 1, 2, 3, 4, flush, fullHouse, 25, 50, 800];
export const PAY_TABLES: Record<PayTableId, PayTable> = {
  '9/6': table(9, 6),
  '9/5': table(9, 5),
  '8/6': table(8, 6),
  '8/5': table(8, 5),
  '7/5': table(7, 5),
  '6/5': table(6, 5),
};

export const MAX_COINS = 5;
/** A royal flush pays 250 per coin, except 4,000 on a five-coin bet. */
export const ROYAL_SHORT_PAY = 250;

/** Credits paid on a final hand for a bet of `coins`. */
export function payout(rank: HandRank, pays: PayTable, coins: number): number {
  if (rank === 9 && coins < MAX_COINS) return ROYAL_SHORT_PAY * coins;
  return pays[rank] * coins;
}

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

export interface Deal {
  /** The five cards dealt, in screen order. */
  hand: number[];
  /** The next five cards in the deck: replacements, used left to right. */
  stub: number[];
}

/** Shuffles a deck far enough to deal ten cards. */
export function deal(rng: () => number = Math.random): Deal {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < 10; i++) {
    const j = i + Math.floor(rng() * (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { hand: deck.slice(0, 5), stub: deck.slice(5, 10) };
}

/** Replaces every card that is not held with the next card from the stub. */
export function draw({ hand, stub }: Deal, held: readonly boolean[]): number[] {
  let next = 0;
  return hand.map((card, i) => (held[i] ? card : stub[next++]));
}

/** Bit i set = position i held. */
export const holdMask = (held: readonly boolean[]) => held.reduce((m, h, i) => (h ? m | (1 << i) : m), 0);
export const heldFromMask = (mask: number) => [0, 1, 2, 3, 4].map((i) => (mask & (1 << i)) !== 0);
