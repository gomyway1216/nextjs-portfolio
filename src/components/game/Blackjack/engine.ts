/**
 * Simplified Blackjack engine for teaching Basic Strategy.
 *
 * Rules:
 * - Single deck, reshuffled every round (avoids needing card counting).
 * - Dealer stands on all 17 (S17). Blackjack pays 3:2.
 * - Player actions: Hit / Stand / Double. (Split and insurance omitted —
 *   the full split table adds a lot of complexity without changing the
 *   pedagogical message that Basic Strategy beats naive play by ~10-15% EV.)
 *
 * Basic strategy table embedded as data: hardLookup[playerTotal][dealerIdx],
 * softLookup[total][dealerIdx], where dealerIdx = upcard value 2..11 indexed
 * 0..9 (11 = Ace).
 */

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';
export interface Card { rank: Rank; suit: '♠' | '♥' | '♦' | '♣' }

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
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

export function isBlackjack(hand: Card[]): boolean {
  if (hand.length !== 2) return false;
  const v = handValue(hand);
  return v.total === 21;
}

// ---------- Basic Strategy ----------

export type Action = 'hit' | 'stand' | 'double';

/**
 * Returns 0-based index into a 10-entry [2,3,4,5,6,7,8,9,T,A] dealer upcard array.
 * Throws if `card` doesn't map (shouldn't happen with valid input).
 */
function dealerIdx(card: Card): number {
  if (card.rank === 'A') return 9;
  if (cardValue(card) === 10) return 8; // T/J/Q/K all map to 10
  return cardValue(card) - 2; // 2→0, ..., 9→7
}

/** "Double if allowed, else Hit". For consistency with strict double-only-on-first-two-cards. */
const D = 'double' as const;
const H = 'hit' as const;
const S = 'stand' as const;

// Hard totals 5-21 vs dealer 2-A. Standard S17 chart (no surrender).
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

// Soft totals 13 (A,2) through 20 (A,9). Soft 21 = blackjack (no decision).
const SOFT_TABLE: Record<number, readonly Action[]> = {
  // dealer:        2  3  4  5  6  7  8  9  T  A
  13: [H, H, H, D, D, H, H, H, H, H],
  14: [H, H, H, D, D, H, H, H, H, H],
  15: [H, H, D, D, D, H, H, H, H, H],
  16: [H, H, D, D, D, H, H, H, H, H],
  17: [H, D, D, D, D, H, H, H, H, H],
  18: [S, D, D, D, D, S, S, H, H, H],
  19: [S, S, S, S, S, S, S, S, S, S],
  20: [S, S, S, S, S, S, S, S, S, S],
};

/**
 * Basic-strategy decision for a player hand against a dealer upcard.
 * If `canDouble` is false (i.e., more than 2 cards), Double collapses to Hit.
 */
export function basicStrategyDecision(playerHand: Card[], dealerUp: Card, canDouble: boolean): Action {
  const v = handValue(playerHand);
  const di = dealerIdx(dealerUp);
  let raw: Action;
  if (v.soft && v.total >= 13 && v.total <= 20) {
    raw = SOFT_TABLE[v.total][di];
  } else if (v.total >= 5 && v.total <= 21) {
    raw = HARD_TABLE[v.total][di];
  } else {
    raw = H; // shouldn't happen for valid in-range totals
  }
  if (raw === 'double' && !canDouble) return 'hit';
  return raw;
}

// ---------- Round play ----------

/**
 * Dealer hits until total >= 17 (S17 rules). Mutates `dealer` in place.
 * `drawNext` returns the next card; callers should guard against an
 * exhausted draw source (returns undefined → loop bails to avoid pushing
 * undefined into the hand).
 */
export function playDealerTurn(dealer: Card[], drawNext: () => Card | undefined): void {
  while (true) {
    const v = handValue(dealer);
    if (v.total >= 17) break;
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
}

/**
 * Run one round with a given strategy callback. The strategy decides
 * actions one at a time based on the visible state.
 */
export function playRound(
  bet: number,
  strategy: (player: Card[], dealerUp: Card, canDouble: boolean) => Action,
  rng: () => number = Math.random,
): RoundResult {
  const deck = shuffle(newDeck(), rng);
  let cursor = 0;
  const draw = (): Card => deck[cursor++];

  const player: Card[] = [draw(), draw()];
  const dealer: Card[] = [draw(), draw()];

  let actualBet = bet;
  let doubled = false;

  if (isBlackjack(player)) {
    if (isBlackjack(dealer)) {
      return { player, dealer, outcome: 'push', bet, net: 0, doubled };
    }
    return { player, dealer, outcome: 'blackjack', bet, net: bet * 1.5, doubled };
  }
  // Dealer Blackjack with player non-BJ: round ends immediately. Without this
  // check the engine would let the player keep hitting against a guaranteed-21
  // dealer, exaggerating the house edge in the sim.
  if (isBlackjack(dealer)) {
    return { player, dealer, outcome: 'lose', bet, net: -bet, doubled };
  }

  // Player turn
  while (true) {
    const canDouble = player.length === 2;
    const action = strategy(player, dealer[0], canDouble);
    if (action === 'stand') break;
    if (action === 'double') {
      if (!canDouble) {
        // Strategy violated rule; treat as hit instead of failing.
        player.push(draw());
        if (isBust(player)) break;
        continue;
      }
      actualBet = bet * 2;
      doubled = true;
      player.push(draw());
      break;
    }
    // hit
    player.push(draw());
    if (isBust(player)) break;
  }

  if (isBust(player)) {
    return { player, dealer, outcome: 'lose', bet: actualBet, net: -actualBet, doubled };
  }

  playDealerTurn(dealer, draw);

  const pV = handValue(player).total;
  const dV = handValue(dealer).total;
  const dealerBust = dV > 21;
  if (dealerBust || pV > dV) {
    return { player, dealer, outcome: 'win', bet: actualBet, net: actualBet, doubled };
  }
  if (pV < dV) {
    return { player, dealer, outcome: 'lose', bet: actualBet, net: -actualBet, doubled };
  }
  return { player, dealer, outcome: 'push', bet: actualBet, net: 0, doubled };
}

// ---------- Strategies ----------

export type StrategyName = 'basic' | 'mimic-dealer' | 'always-stand';

export function strategyFor(name: StrategyName): (player: Card[], dealerUp: Card, canDouble: boolean) => Action {
  switch (name) {
    case 'basic':
      return basicStrategyDecision;
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
  rtp: number;            // return per unit wagered (so EV per round = (rtp - 1) * baseBet)
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
