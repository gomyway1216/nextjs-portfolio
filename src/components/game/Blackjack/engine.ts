/**
 * Blackjack rules engine: the shoe, a round as a pure state machine (deal,
 * insurance, the dealer's peek, hit / stand / double / split, the dealer's
 * turn, settlement) and the published basic-strategy chart.
 *
 * Table rules, applied everywhere:
 * - Six decks, one card burned after the shuffle, reshuffled once the cut card
 *   (75% penetration) comes out.
 * - Dealer stands on all 17s (S17) and peeks for blackjack under an ace or a
 *   ten, so doubles and splits only ever meet a dealer without a natural.
 * - Blackjack pays 3:2; insurance pays 2:1.
 * - Double on any first two cards, double after split, split to four hands;
 *   split aces get one card each and can't be resplit. No surrender.
 *
 * Every function is pure — the table, the simulations and the tests all run
 * the same rules.
 */

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const DECKS = 6;
export const PENETRATION = 0.75;
export const MAX_HANDS = 4;
export const BLACKJACK_PAYS = 1.5;
export const INSURANCE_PAYS = 2;

/** Value of a card with an ace as 11 (hand totals soften it as needed). */
export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (card.rank === 'T' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export interface HandValue {
  total: number;
  /** An ace is being counted as 11. */
  soft: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBust = (cards: readonly Card[]) => handValue(cards).total > 21;
/** A natural: exactly two cards making 21. */
export const isBlackjack = (cards: readonly Card[]) => cards.length === 2 && handValue(cards).total === 21;
/** A splittable pair — by value, so any two ten-value cards count. */
export const isPair = (cards: readonly Card[]) => cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);

// ---------------------------------------------------------------------------
// The shoe
// ---------------------------------------------------------------------------

export interface Shoe {
  decks: number;
  cards: Card[];
  /** Index of the next card to deal. */
  next: number;
  /** Once `next` passes this, the shoe is shuffled before the next round. */
  cutIndex: number;
}

export function createShoe(decks: number = DECKS, rng: () => number = Math.random): Shoe {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  // The first card is burned face down.
  return { decks, cards, next: 1, cutIndex: Math.floor(cards.length * PENETRATION) };
}

export const needsShuffle = (shoe: Shoe) => shoe.next >= shoe.cutIndex;
export const cardsLeft = (shoe: Shoe) => shoe.cards.length - shoe.next;

// ---------------------------------------------------------------------------
// A round
// ---------------------------------------------------------------------------

export interface PlayerHand {
  cards: Card[];
  /** Stake on this hand (doubled hands carry twice the base bet). */
  bet: number;
  doubled: boolean;
  /** Came from a split (so a two-card 21 is not a blackjack). */
  split: boolean;
  /** A split ace: one card only. */
  splitAce: boolean;
  done: boolean;
}

export type Phase = 'insurance' | 'player' | 'done';
export type Action = 'hit' | 'stand' | 'double' | 'split';
export type HandOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface HandResult {
  outcome: HandOutcome;
  stake: number;
  /** Net profit (negative on a loss). */
  profit: number;
}

export interface RoundResult {
  hands: HandResult[];
  /** Insurance stake and its net profit, if insurance was taken. */
  insurance: { stake: number; profit: number } | null;
  dealerTotal: number;
  dealerBlackjack: boolean;
  dealerBust: boolean;
  /** Money back to the bankroll: every stake that wasn't lost, plus winnings. */
  returned: number;
  /** Net for the round across hands and insurance. */
  net: number;
}

export interface Round {
  shoe: Shoe;
  bet: number;
  dealer: Card[];
  hands: PlayerHand[];
  active: number;
  phase: Phase;
  /** Insurance stake (0 = declined or not offered). */
  insurance: number;
  result: RoundResult | null;
}

interface Draw {
  card: Card;
  shoe: Shoe;
}

function drawFrom(shoe: Shoe): Draw {
  if (shoe.next >= shoe.cards.length) throw new Error('the shoe ran out of cards');
  return { card: shoe.cards[shoe.next], shoe: { ...shoe, next: shoe.next + 1 } };
}

/** Deals player, dealer, player, dealer (the second dealer card is the hole card). */
export function startRound(shoe: Shoe, bet: number): Round {
  if (!(bet > 0)) throw new Error('bet must be positive');
  let s = shoe;
  const take = () => {
    const d = drawFrom(s);
    s = d.shoe;
    return d.card;
  };
  const p1 = take();
  const d1 = take();
  const p2 = take();
  const d2 = take();
  const round: Round = {
    shoe: s,
    bet,
    dealer: [d1, d2],
    hands: [{ cards: [p1, p2], bet, doubled: false, split: false, splitAce: false, done: false }],
    active: 0,
    phase: 'player',
    insurance: 0,
    result: null,
  };
  // Insurance is offered whenever the dealer shows an ace.
  if (d1.rank === 'A') return { ...round, phase: 'insurance' };
  return afterPeek(round);
}

/** Answers the insurance offer (half the bet, pays 2:1 if the dealer has blackjack). */
export function answerInsurance(round: Round, take: boolean): Round {
  if (round.phase !== 'insurance') throw new Error('insurance is not on offer');
  return afterPeek({ ...round, insurance: take ? round.bet / 2 : 0, phase: 'player' });
}

/** The dealer checks for blackjack; naturals end the round at once. */
function afterPeek(round: Round): Round {
  const dealerBj = isBlackjack(round.dealer);
  const playerBj = isBlackjack(round.hands[0].cards);
  if (dealerBj || playerBj) return settle({ ...round, hands: round.hands.map((h) => ({ ...h, done: true })) });
  return { ...round, phase: 'player' };
}

export interface Legal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
}

/** What the active hand may do (bankroll limits are the caller's business). */
export function legalActions(round: Round): Legal {
  const none = { hit: false, stand: false, double: false, split: false };
  if (round.phase !== 'player') return none;
  const hand = round.hands[round.active];
  if (!hand || hand.done) return none;
  const two = hand.cards.length === 2;
  return {
    hit: true,
    stand: true,
    double: two,
    split: two && isPair(hand.cards) && round.hands.length < MAX_HANDS && !hand.splitAce,
  };
}

/** Plays one action on the active hand and moves the round on. */
export function act(round: Round, action: Action): Round {
  const legal = legalActions(round);
  if (!legal[action]) throw new Error(`${action} is not allowed now`);
  let shoe = round.shoe;
  const take = () => {
    const d = drawFrom(shoe);
    shoe = d.shoe;
    return d.card;
  };
  const hands = round.hands.map((h) => ({ ...h, cards: [...h.cards] }));
  const hand = hands[round.active];

  switch (action) {
    case 'hit':
      hand.cards.push(take());
      // Bust or 21 ends the hand.
      if (handValue(hand.cards).total >= 21) hand.done = true;
      break;
    case 'stand':
      hand.done = true;
      break;
    case 'double':
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(take());
      hand.done = true;
      break;
    case 'split': {
      const aces = hand.cards[0].rank === 'A';
      const second: PlayerHand = { cards: [hand.cards[1]], bet: round.bet, doubled: false, split: true, splitAce: aces, done: false };
      hand.cards = [hand.cards[0], take()];
      hand.split = true;
      hand.splitAce = aces;
      hands.splice(round.active + 1, 0, second);
      if (aces) {
        // Each ace gets exactly one card.
        second.cards.push(take());
        hand.done = true;
        second.done = true;
      } else if (handValue(hand.cards).total === 21) {
        hand.done = true;
      }
      break;
    }
  }
  return advance({ ...round, shoe, hands });
}

/** Moves to the next unfinished hand (dealing a split hand its second card), or to the dealer. */
function advance(round: Round): Round {
  let shoe = round.shoe;
  const hands = round.hands;
  let i = round.active;
  while (i < hands.length && hands[i].done) i++;
  if (i < hands.length) {
    const hand = hands[i];
    if (hand.cards.length === 1) {
      const d = drawFrom(shoe);
      shoe = d.shoe;
      hands[i] = { ...hand, cards: [...hand.cards, d.card] };
      if (handValue(hands[i].cards).total === 21) {
        hands[i].done = true;
        return advance({ ...round, shoe, hands, active: i });
      }
    }
    return { ...round, shoe, hands, active: i };
  }
  return dealerTurn({ ...round, shoe, hands, active: hands.length - 1 });
}

/** The dealer draws to 17 (standing on soft 17) unless every hand has busted. */
function dealerTurn(round: Round): Round {
  let shoe = round.shoe;
  const dealer = [...round.dealer];
  if (round.hands.some((h) => !isBust(h.cards))) {
    while (handValue(dealer).total < 17) {
      const d = drawFrom(shoe);
      shoe = d.shoe;
      dealer.push(d.card);
    }
  }
  return settle({ ...round, shoe, dealer });
}

function settle(round: Round): Round {
  const dealerBj = isBlackjack(round.dealer);
  const dealer = handValue(round.dealer).total;
  const dealerBust = dealer > 21;
  const hands = round.hands.map((h): HandResult => {
    const stake = h.bet;
    const natural = !h.split && isBlackjack(h.cards);
    if (dealerBj) return natural ? { outcome: 'push', stake, profit: 0 } : { outcome: 'lose', stake, profit: -stake };
    if (natural) return { outcome: 'blackjack', stake, profit: stake * BLACKJACK_PAYS };
    const total = handValue(h.cards).total;
    if (total > 21) return { outcome: 'bust', stake, profit: -stake };
    if (dealerBust || total > dealer) return { outcome: 'win', stake, profit: stake };
    if (total < dealer) return { outcome: 'lose', stake, profit: -stake };
    return { outcome: 'push', stake, profit: 0 };
  });
  const insurance = round.insurance > 0 ? { stake: round.insurance, profit: dealerBj ? round.insurance * INSURANCE_PAYS : -round.insurance } : null;
  const results = [...hands, ...(insurance ? [{ stake: insurance.stake, profit: insurance.profit }] : [])];
  const returned = results.reduce((sum, r) => sum + (r.profit >= 0 ? r.stake + r.profit : 0), 0);
  const net = results.reduce((sum, r) => sum + r.profit, 0);
  return {
    ...round,
    hands: round.hands.map((h) => ({ ...h, done: true })),
    phase: 'done',
    result: { hands, insurance, dealerTotal: dealer, dealerBlackjack: dealerBj, dealerBust, returned, net },
  };
}

/** Total staked on the round so far (base bets, doubles, splits and insurance). */
export const totalStaked = (round: Round) => round.hands.reduce((sum, h) => sum + h.bet, 0) + round.insurance;

// ---------------------------------------------------------------------------
// Basic strategy — the standard chart for 4–8 decks, S17, double after split, no surrender
// ---------------------------------------------------------------------------

const D = 'double' as const;
const H = 'hit' as const;
const S = 'stand' as const;
const P = 'split' as const;

/** Columns: dealer 2, 3, 4, 5, 6, 7, 8, 9, 10, A. */
export const UPCARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const column = (dealerUp: Card) => UPCARDS.indexOf(cardValue(dealerUp) as (typeof UPCARDS)[number]);

export const HARD_CHART: Record<number, readonly Action[]> = {
  5: [H, H, H, H, H, H, H, H, H, H],
  6: [H, H, H, H, H, H, H, H, H, H],
  7: [H, H, H, H, H, H, H, H, H, H],
  8: [H, H, H, H, H, H, H, H, H, H],
  9: [H, D, D, D, D, H, H, H, H, H],
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

/** Soft totals 13 (A,2) to 21. */
export const SOFT_CHART: Record<number, readonly Action[]> = {
  12: [H, H, H, H, H, H, H, H, H, H],
  13: [H, H, H, D, D, H, H, H, H, H],
  14: [H, H, H, D, D, H, H, H, H, H],
  15: [H, H, D, D, D, H, H, H, H, H],
  16: [H, H, D, D, D, H, H, H, H, H],
  17: [H, D, D, D, D, H, H, H, H, H],
  18: [S, D, D, D, D, S, S, H, H, H],
  19: [S, S, S, S, S, S, S, S, S, S],
  20: [S, S, S, S, S, S, S, S, S, S],
  21: [S, S, S, S, S, S, S, S, S, S],
};

/** Pairs by card value (2–10, 11 = aces). */
export const PAIR_CHART: Record<number, readonly Action[]> = {
  2: [P, P, P, P, P, P, H, H, H, H],
  3: [P, P, P, P, P, P, H, H, H, H],
  4: [H, H, H, P, P, H, H, H, H, H],
  5: [D, D, D, D, D, D, D, D, H, H],
  6: [P, P, P, P, P, H, H, H, H, H],
  7: [P, P, P, P, P, P, H, H, H, H],
  8: [P, P, P, P, P, P, P, P, P, P],
  9: [P, P, P, P, P, S, P, P, S, S],
  10: [S, S, S, S, S, S, S, S, S, S],
  11: [P, P, P, P, P, P, P, P, P, P],
};

/**
 * The chart's play for a hand against the dealer's up card. A double the
 * hand can't make becomes a hit (a soft 18 stands instead), and a split it
 * can't make falls through to the hard / soft total.
 */
export function basicStrategy(cards: readonly Card[], dealerUp: Card, legal: Pick<Legal, 'double' | 'split'>): Action {
  const col = column(dealerUp);
  if (legal.split && isPair(cards)) {
    const play = PAIR_CHART[cardValue(cards[0])][col];
    if (play === 'split') return 'split';
  }
  const { total, soft } = handValue(cards);
  const play = soft && total >= 12 ? SOFT_CHART[total][col] : total <= 5 ? 'hit' : HARD_CHART[Math.min(total, 21)][col];
  if (play === 'double' && !legal.double) return soft && total === 18 ? 'stand' : 'hit';
  return play;
}

// ---------------------------------------------------------------------------
// Playing a whole round with a strategy
// ---------------------------------------------------------------------------

export type Decider = (hand: PlayerHand, dealerUp: Card, legal: Legal, round: Round) => Action;

export const STRATEGIES = {
  basic: ((hand, up, legal) => basicStrategy(hand.cards, up, legal)) as Decider,
  /** Play like the dealer: hit to 17, never double or split. */
  mimic: ((hand) => (handValue(hand.cards).total < 17 ? 'hit' : 'stand')) as Decider,
  /** Never risk a bust: stand on hard 12+, hit soft hands below 18. */
  neverBust: ((hand) => {
    const { total, soft } = handValue(hand.cards);
    return total <= 11 || (soft && total < 18) ? 'hit' : 'stand';
  }) as Decider,
};
export type StrategyId = keyof typeof STRATEGIES;

/** Deals and plays a full round (declining insurance), shuffling first if the cut card is out. */
export function playRound(shoe: Shoe, bet: number, decide: Decider, rng: () => number = Math.random): Round {
  let round = startRound(needsShuffle(shoe) ? createShoe(shoe.decks, rng) : shoe, bet);
  if (round.phase === 'insurance') round = answerInsurance(round, false);
  while (round.phase === 'player') {
    const legal = legalActions(round);
    let action = decide(round.hands[round.active], round.dealer[0], legal, round);
    if (!legal[action]) action = action === 'double' ? 'hit' : handValue(round.hands[round.active].cards).total >= 17 ? 'stand' : 'hit';
    round = act(round, action);
  }
  return round;
}
