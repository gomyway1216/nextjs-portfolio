/**
 * Punto Banco baccarat: the shoe, the drawing rules (the "tableau"), bet
 * settlement and the casino scoreboards (bead plate and big road).
 *
 * Everything is pure and takes the rng as a parameter, so the table, the
 * exact analysis and the tests all run the same rules.
 */

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Winner = 'player' | 'banker' | 'tie';
export type Side = 'player' | 'banker';

/** Baccarat value of a rank: aces count 1, tens and faces 0. */
export const RANK_VALUES: readonly number[] = RANKS.map((r) => (r === 'A' ? 1 : /[TJQK]/.test(r) ? 0 : Number(r)));

const VALUE_OF = Object.fromEntries(RANKS.map((r, i) => [r, RANK_VALUES[i]])) as Record<Rank, number>;

export const cardValue = (card: Card): number => VALUE_OF[card.rank];

/** Only the last digit counts: 7 + 8 = 15 → 5. */
export const handTotal = (cards: readonly Card[]): number => cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;

/** Player draws on 0–5 and stands on 6–7 (8–9 is a natural and ends the hand). */
export const playerDraws = (playerTotal: number): boolean => playerTotal <= 5;

/**
 * The banker's rule. If the player stood, the banker draws on 0–5 like the
 * player. If the player drew, the banker's decision depends on the value of
 * the player's third card — the source of the banker's edge.
 */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThird !== 8;
    case 4:
      return playerThird >= 2 && playerThird <= 7;
    case 5:
      return playerThird >= 4 && playerThird <= 7;
    case 6:
      return playerThird === 6 || playerThird === 7;
    default:
      return false;
  }
}

export interface Hand {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  winner: Winner;
  /** Either side had 8 or 9 with its first two cards, so nobody drew. */
  natural: boolean;
}

/**
 * Plays one coup, drawing cards in table order: player, banker, player,
 * banker, then the player's and the banker's third cards when the rules call
 * for them.
 */
export function playRound(draw: () => Card): Hand {
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  let playerTotal = handTotal(player);
  let bankerTotal = handTotal(banker);
  const natural = playerTotal >= 8 || bankerTotal >= 8;
  if (!natural) {
    let playerThird: number | null = null;
    if (playerDraws(playerTotal)) {
      const card = draw();
      player.push(card);
      playerThird = cardValue(card);
      playerTotal = handTotal(player);
    }
    if (bankerDraws(bankerTotal, playerThird)) {
      banker.push(draw());
      bankerTotal = handTotal(banker);
    }
  }
  const winner: Winner = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';
  return { player, banker, playerTotal, bankerTotal, winner, natural };
}

/** Position of each card in the order it came out of the shoe (0 = first). */
export function dealOrder(hand: Hand): { player: number[]; banker: number[] } {
  const player = [0, 2];
  const banker = [1, 3];
  if (hand.player.length === 3) player.push(4);
  if (hand.banker.length === 3) banker.push(hand.player.length === 3 ? 5 : 4);
  return { player, banker };
}

export const cardsInHand = (hand: Hand) => hand.player.length + hand.banker.length;

export const isPair = (cards: readonly Card[]) => cards.length >= 2 && cards[0].rank === cards[1].rank;
/** EZ Baccarat: the banker wins with a three-card 7. */
export const isDragon7 = (hand: Hand) => hand.winner === 'banker' && hand.banker.length === 3 && hand.bankerTotal === 7;
/** EZ Baccarat: the player wins with a three-card 8. */
export const isPanda8 = (hand: Hand) => hand.winner === 'player' && hand.player.length === 3 && hand.playerTotal === 8;

// ---------------------------------------------------------------------------
// The shoe
// ---------------------------------------------------------------------------

export const DEFAULT_DECKS = 8;
/** The cut card sits this many cards from the end of the shoe. */
export const CUT_CARD_FROM_END = 16;

export interface Shoe {
  decks: number;
  cards: Card[];
  /** Index of the next card to deal. */
  next: number;
  /** Once `next` reaches this index the cut card has come out. */
  cutIndex: number;
  /** The first card is turned face up and decides how many cards are burned. */
  burnCard: Card;
  burned: number;
}

/** Cards burned after the exposed first card: its value, with tens and faces burning 10. */
export const burnCount = (card: Card): number => cardValue(card) || 10;

export function createShoe(decks: number = DEFAULT_DECKS, rng: () => number = Math.random): Shoe {
  if (!Number.isInteger(decks) || decks < 1 || decks > 8) throw new Error('decks must be an integer from 1 to 8');
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const burnCard = cards[0];
  const burned = burnCount(burnCard);
  return { decks, cards, next: 1 + burned, cutIndex: cards.length - CUT_CARD_FROM_END, burnCard, burned };
}

/** Deals the next coup. The shoe is not mutated; the returned one has moved on. */
export function dealHand(shoe: Shoe): { hand: Hand; shoe: Shoe } {
  let i = shoe.next;
  const hand = playRound(() => {
    if (i >= shoe.cards.length) throw new Error('the shoe ran out of cards');
    return shoe.cards[i++];
  });
  return { hand, shoe: { ...shoe, next: i } };
}

/** The cut card has come out: the hand just dealt was the last of this shoe. */
export const shoeFinished = (shoe: Shoe) => shoe.next >= shoe.cutIndex;

export const fullShoeCounts = (decks: number = DEFAULT_DECKS): number[] => RANKS.map(() => 4 * decks);

/**
 * Rank counts of the cards a player at the table has not seen: the whole shoe
 * minus the exposed burn card and every card dealt so far. The burned cards
 * went face down, so they still count as unknown.
 */
export function unseenCounts(shoe: Shoe): number[] {
  const counts = fullShoeCounts(shoe.decks);
  const seen = [shoe.burnCard, ...shoe.cards.slice(1 + shoe.burned, shoe.next)];
  for (const card of seen) counts[RANKS.indexOf(card.rank)]--;
  return counts;
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

export const BET_IDS = ['player', 'banker', 'tie', 'playerPair', 'bankerPair', 'dragon7', 'panda8'] as const;
export type BetId = (typeof BET_IDS)[number];
export type Bets = Partial<Record<BetId, number>>;

/**
 * `commission`: the classic game, a winning banker bet pays 19:20 (5% commission).
 * `ez`: no commission, but a banker win with a three-card 7 pushes; adds the
 * Dragon 7 and Panda 8 side bets.
 */
export type Mode = 'commission' | 'ez';

export const EZ_ONLY_BETS: readonly BetId[] = ['dragon7', 'panda8'];
export const betAvailable = (id: BetId, mode: Mode) => mode === 'ez' || !EZ_ONLY_BETS.includes(id);

/** Profit per unit staked on a win, as [to, for]. */
export const PAYS: Record<BetId, readonly [number, number]> = {
  player: [1, 1],
  banker: [1, 1],
  tie: [8, 1],
  playerPair: [11, 1],
  bankerPair: [11, 1],
  dragon7: [40, 1],
  panda8: [25, 1],
};
export const BANKER_COMMISSION = 0.05;

export type Outcome = 'win' | 'lose' | 'push';

export interface BetResult {
  id: BetId;
  stake: number;
  outcome: Outcome;
  /** Net profit on a win (0 on a push, the stake is lost on a loss). */
  profit: number;
  /** What goes back to the bankroll: stake + profit, the stake, or 0. */
  returned: number;
}

function outcomeOf(id: BetId, hand: Hand, mode: Mode): { outcome: Outcome; multiple: number } {
  const win = (multiple: number) => ({ outcome: 'win' as const, multiple });
  const lose = { outcome: 'lose' as const, multiple: 0 };
  const push = { outcome: 'push' as const, multiple: 0 };
  switch (id) {
    case 'player':
      return hand.winner === 'tie' ? push : hand.winner === 'player' ? win(1) : lose;
    case 'banker':
      if (hand.winner === 'tie') return push;
      if (hand.winner === 'player') return lose;
      if (mode === 'ez') return isDragon7(hand) ? push : win(1);
      return win(1 - BANKER_COMMISSION);
    case 'tie':
      return hand.winner === 'tie' ? win(PAYS.tie[0]) : lose;
    case 'playerPair':
      return isPair(hand.player) ? win(PAYS.playerPair[0]) : lose;
    case 'bankerPair':
      return isPair(hand.banker) ? win(PAYS.bankerPair[0]) : lose;
    case 'dragon7':
      return isDragon7(hand) ? win(PAYS.dragon7[0]) : lose;
    case 'panda8':
      return isPanda8(hand) ? win(PAYS.panda8[0]) : lose;
  }
}

export function settleBet(id: BetId, stake: number, hand: Hand, mode: Mode): BetResult {
  const { outcome, multiple } = outcomeOf(id, hand, mode);
  // Kept exact (a 5 banker win pays 4.75); amounts are rounded only for display.
  const profit = outcome === 'win' ? stake * multiple : 0;
  const returned = outcome === 'lose' ? 0 : stake + profit;
  return { id, stake, outcome, profit, returned };
}

export function settleBets(bets: Bets, hand: Hand, mode: Mode): { results: BetResult[]; returned: number } {
  const results = BET_IDS.filter((id) => (bets[id] ?? 0) > 0).map((id) => settleBet(id, bets[id]!, hand, mode));
  return { results, returned: results.reduce((sum, r) => sum + r.returned, 0) };
}

export const totalOnTable = (bets: Bets) => BET_IDS.reduce((sum, id) => sum + (bets[id] ?? 0), 0);

// ---------------------------------------------------------------------------
// Scoreboards
// ---------------------------------------------------------------------------

export interface RoadEntry {
  winner: Winner;
  playerPair: boolean;
  bankerPair: boolean;
  natural: boolean;
}

export const roadEntry = (hand: Hand): RoadEntry => ({
  winner: hand.winner,
  playerPair: isPair(hand.player),
  bankerPair: isPair(hand.banker),
  natural: hand.natural,
});

export const ROAD_ROWS = 6;

/** Bead plate: every hand in order, filling each six-high column top to bottom. */
export const beadPosition = (index: number) => ({ col: Math.floor(index / ROAD_ROWS), row: index % ROAD_ROWS });

export interface BigRoadCell extends Omit<RoadEntry, 'winner'> {
  col: number;
  row: number;
  winner: Side;
  /** Ties that came right after this hand (drawn as a slash through it). */
  ties: number;
}

/**
 * Big road: a new column for every change of winner, a streak running down
 * its column. A streak that hits the bottom — or a cell already taken by an
 * earlier streak — turns right and keeps going along that row (the "dragon
 * tail"). Ties don't get a cell; they are marked on the hand before them.
 */
export function bigRoad(entries: readonly RoadEntry[]): { cells: BigRoadCell[]; leadingTies: number } {
  const cells: BigRoadCell[] = [];
  const taken = new Set<string>();
  const key = (col: number, row: number) => `${col},${row}`;
  let leadingTies = 0;
  let startCol = -1;
  let col = 0;
  let row = 0;
  let turned = false;
  let previous: Side | null = null;

  for (const entry of entries) {
    if (entry.winner === 'tie') {
      if (cells.length === 0) leadingTies++;
      else cells[cells.length - 1].ties++;
      continue;
    }
    if (entry.winner !== previous) {
      startCol++;
      while (taken.has(key(startCol, 0))) startCol++;
      col = startCol;
      row = 0;
      turned = false;
    } else if (!turned && row + 1 < ROAD_ROWS && !taken.has(key(col, row + 1))) {
      row++;
    } else {
      turned = true;
      col++;
      while (taken.has(key(col, row))) col++;
    }
    taken.add(key(col, row));
    cells.push({
      col,
      row,
      winner: entry.winner,
      ties: 0,
      playerPair: entry.playerPair,
      bankerPair: entry.bankerPair,
      natural: entry.natural,
    });
    previous = entry.winner;
  }
  return { cells, leadingTies };
}
