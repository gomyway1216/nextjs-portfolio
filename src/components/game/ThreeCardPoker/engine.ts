/**
 * Three Card Poker: the deck, the three-card hand ranking, the dealer's
 * qualifying rule and the settlement of every bet.
 *
 * Everything is pure and takes the rng as a parameter, so the table, the
 * exact analysis, the simulation and the tests all run the same rules.
 */

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];
/** Ranks in poker order: deuce low, ace high. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const DECK_SIZE = 52;
export const HAND_SIZE = 3;

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])) as Record<Rank, number>;
const SUIT_INDEX = Object.fromEntries(SUITS.map((s, i) => [s, i])) as Record<Suit, number>;

/** 2 … 14, the ace counting 14 (it also plays low in A-2-3). */
export const rankValue = (rank: Rank): number => RANK_VALUE[rank];
export const rankOfValue = (value: number): Rank => RANKS[(value === 1 ? 14 : value) - 2];

/** A card as a number 0 … 51: four suits of deuces, then four treys, … */
export const cardIndex = (card: Card): number => (RANK_VALUE[card.rank] - 2) * 4 + SUIT_INDEX[card.suit];
export const cardAt = (index: number): Card => ({ rank: RANKS[index >> 2], suit: SUITS[index & 3] });

// ---------------------------------------------------------------------------
// Hand ranking
// ---------------------------------------------------------------------------

/**
 * Worst to best. With three cards a straight is rarer than a flush and three
 * of a kind rarer than a straight, so they rank the other way round from
 * five-card poker.
 */
export const CATEGORIES = ['highCard', 'pair', 'flush', 'straight', 'threeOfAKind', 'straightFlush'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * One integer that orders every hand: the category, then up to three rank
 * values that break ties inside it. A higher score is a better hand and equal
 * scores tie. `a`, `b`, `c` are rank values 2–14 in any order.
 */
export function scoreRanks(a: number, b: number, c: number, flush: boolean): number {
  let t: number;
  if (a < b) {
    t = a;
    a = b;
    b = t;
  }
  if (b < c) {
    t = b;
    b = c;
    c = t;
  }
  if (a < b) {
    t = a;
    a = b;
    b = t;
  }
  let category: number;
  if (a === c) {
    category = 4;
  } else if (a === b) {
    // Pairs compare by the pair first, then the kicker.
    category = 1;
    b = c;
    c = 0;
  } else if (b === c) {
    category = 1;
    b = a;
    a = c;
    c = 0;
  } else {
    // A-2-3 is the lowest straight: the ace plays low, so it ranks as 3-high.
    const wheel = a === 14 && b === 3 && c === 2;
    if (wheel) {
      a = 3;
      b = 2;
      c = 1;
    }
    const straight = wheel || (a - b === 1 && b - c === 1);
    category = straight ? (flush ? 5 : 3) : flush ? 2 : 0;
  }
  return (category << 12) | (a << 8) | (b << 4) | c;
}

export interface HandValue {
  category: Category;
  /** Rank values that break ties within the category, most significant first (0 = unused). */
  tiebreak: [number, number, number];
  /** Orders every hand: higher is better, equal ties. */
  score: number;
}

export const categoryOfScore = (score: number): Category => CATEGORIES[score >> 12];

export function evaluate(cards: readonly Card[]): HandValue {
  if (cards.length !== HAND_SIZE) throw new Error('a hand is exactly three cards');
  const [x, y, z] = cards;
  const score = scoreRanks(RANK_VALUE[x.rank], RANK_VALUE[y.rank], RANK_VALUE[z.rank], x.suit === y.suit && y.suit === z.suit);
  return { category: CATEGORIES[score >> 12], tiebreak: [(score >> 8) & 15, (score >> 4) & 15, score & 15], score };
}

/** Positive when `a` beats `b`, negative when it loses, 0 on a tie. */
export const compareHands = (a: readonly Card[], b: readonly Card[]): number => evaluate(a).score - evaluate(b).score;

/**
 * The dealer needs Queen-high or better to qualify. Every high-card hand led
 * by a queen scores above "a queen and nothing else", and Q-3-2 is the lowest
 * hand that does.
 */
export const QUALIFY_SCORE = 12 << 8;
export const dealerQualifies = (dealer: readonly Card[]): boolean => evaluate(dealer).score >= QUALIFY_SCORE;

// ---------------------------------------------------------------------------
// Pay tables
// ---------------------------------------------------------------------------

export type PayTable = Record<Category, number>;

/** Pair Plus, profit per unit: the common 1-3-6-30-40 table. */
export const PAIR_PLUS_PAYS: PayTable = { highCard: 0, pair: 1, flush: 3, straight: 6, threeOfAKind: 30, straightFlush: 40 };
/** The original, more generous table that paid 4:1 on a flush. */
export const PAIR_PLUS_PAYS_OLD: PayTable = { ...PAIR_PLUS_PAYS, flush: 4 };
export const PAIR_PLUS_TABLES = { standard: PAIR_PLUS_PAYS, old: PAIR_PLUS_PAYS_OLD } as const;
export type PairPlusTableId = keyof typeof PAIR_PLUS_TABLES;

/** Ante Bonus, paid on the Ante whenever the player plays — win or lose. */
export const ANTE_BONUS_PAYS: PayTable = { highCard: 0, pair: 0, flush: 0, straight: 1, threeOfAKind: 4, straightFlush: 5 };

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let i = 0; i < DECK_SIZE; i++) deck.push(cardAt(i));
  return deck;
}

export interface Deal {
  player: Card[];
  dealer: Card[];
}

/**
 * Shuffles one fresh 52-card deck and deals three cards each. Only the first
 * six cards are ever used, so the shuffle stops after placing them (a partial
 * Fisher–Yates): those six have exactly the distribution of a full shuffle.
 */
export function dealRound(rng: () => number = Math.random): Deal {
  const deck = freshDeck();
  for (let i = 0; i < 2 * HAND_SIZE; i++) {
    const j = i + Math.floor(rng() * (DECK_SIZE - i));
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  }
  return { player: deck.slice(0, HAND_SIZE), dealer: deck.slice(HAND_SIZE, 2 * HAND_SIZE) };
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export type Decision = 'play' | 'fold';

/** The lowest hand worth playing: Q-6-4 (analysis.ts proves it by enumeration). */
export const PLAY_THRESHOLD: readonly Rank[] = ['Q', '6', '4'];
export const PLAY_THRESHOLD_SCORE = scoreRanks(12, 6, 4, false);

export const STRATEGY_IDS = ['optimal', 'always', 'mimic'] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

/** Whether each strategy plays a hand with this score. */
export const STRATEGY_PLAYS: Record<StrategyId, (score: number) => boolean> = {
  /** Play Q-6-4 or better, fold anything worse. */
  optimal: (score) => score >= PLAY_THRESHOLD_SCORE,
  /** Never fold. */
  always: () => true,
  /** Play what the dealer needs to qualify: Queen-high or better. */
  mimic: (score) => score >= QUALIFY_SCORE,
};

export const decide = (id: StrategyId, player: readonly Card[]): Decision =>
  STRATEGY_PLAYS[id](evaluate(player).score) ? 'play' : 'fold';

// ---------------------------------------------------------------------------
// Bets and settlement
// ---------------------------------------------------------------------------

export interface Bets {
  /** Required to be dealt in. */
  ante: number;
  /** Optional side bet on the player's own three cards. */
  pairPlus: number;
}

export const NO_BETS: Bets = { ante: 0, pairPlus: 0 };

/** The lines a hand can settle. The Ante Bonus has no stake of its own: it is paid on the Ante. */
export const LINE_IDS = ['ante', 'play', 'anteBonus', 'pairPlus'] as const;
export type LineId = (typeof LINE_IDS)[number];
export type Outcome = 'win' | 'lose' | 'push';

export interface LineResult {
  id: LineId;
  stake: number;
  outcome: Outcome;
  /** Net profit on a win (0 on a push; the stake is lost on a loss). */
  profit: number;
  /** What goes back to the bankroll: stake + profit, the stake, or 0. */
  returned: number;
}

/** What decided the Ante and Play bets. */
export type Showdown = 'fold' | 'notQualified' | 'win' | 'lose' | 'tie';

export interface Settlement {
  decision: Decision;
  player: HandValue;
  dealer: HandValue;
  dealerQualifies: boolean;
  showdown: Showdown;
  lines: LineResult[];
  /** Everything put on the table: Ante, Pair Plus and the Play bet if it was made. */
  staked: number;
  /** What goes back to the bankroll. */
  returned: number;
  /** returned − staked. */
  net: number;
}

const line = (id: LineId, stake: number, outcome: Outcome, multiple = 0): LineResult => {
  const profit = outcome === 'win' ? stake * multiple : 0;
  return { id, stake, outcome, profit, returned: outcome === 'lose' ? 0 : stake + profit };
};

/**
 * Settles one hand. Folding forfeits the Ante and the Pair Plus bet. Playing
 * adds a Play bet equal to the Ante; then
 *  - the dealer doesn't qualify: the Ante pays 1:1 and the Play bet pushes;
 *  - the dealer qualifies: the higher hand wins both bets at 1:1 (a tie pushes both);
 *  - the Ante Bonus and Pair Plus pay on the player's own hand, whatever the dealer holds.
 */
export function settle(
  bets: Bets,
  decision: Decision,
  playerCards: readonly Card[],
  dealerCards: readonly Card[],
  pairPlusPays: PayTable = PAIR_PLUS_PAYS,
): Settlement {
  const { ante, pairPlus } = bets;
  if (!Number.isFinite(ante) || ante <= 0) throw new Error('the Ante is required');
  if (!Number.isFinite(pairPlus) || pairPlus < 0) throw new Error('the Pair Plus bet cannot be negative');
  const player = evaluate(playerCards);
  const dealer = evaluate(dealerCards);
  const qualifies = dealer.score >= QUALIFY_SCORE;
  const lines: LineResult[] = [];
  let showdown: Showdown;

  if (decision === 'fold') {
    showdown = 'fold';
    lines.push(line('ante', ante, 'lose'));
    if (pairPlus > 0) lines.push(line('pairPlus', pairPlus, 'lose'));
  } else {
    if (!qualifies) {
      showdown = 'notQualified';
      lines.push(line('ante', ante, 'win', 1), line('play', ante, 'push'));
    } else if (player.score > dealer.score) {
      showdown = 'win';
      lines.push(line('ante', ante, 'win', 1), line('play', ante, 'win', 1));
    } else if (player.score < dealer.score) {
      showdown = 'lose';
      lines.push(line('ante', ante, 'lose'), line('play', ante, 'lose'));
    } else {
      showdown = 'tie';
      lines.push(line('ante', ante, 'push'), line('play', ante, 'push'));
    }
    const bonus = ANTE_BONUS_PAYS[player.category];
    // No stake of its own: only the bonus itself comes back.
    if (bonus > 0) lines.push({ id: 'anteBonus', stake: 0, outcome: 'win', profit: ante * bonus, returned: ante * bonus });
    if (pairPlus > 0) {
      const pays = pairPlusPays[player.category];
      lines.push(pays > 0 ? line('pairPlus', pairPlus, 'win', pays) : line('pairPlus', pairPlus, 'lose'));
    }
  }

  const staked = ante + pairPlus + (decision === 'play' ? ante : 0);
  const returned = lines.reduce((sum, l) => sum + l.returned, 0);
  return { decision, player, dealer, dealerQualifies: qualifies, showdown, lines, staked, returned, net: returned - staked };
}
