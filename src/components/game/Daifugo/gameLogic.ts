/**
 * Daifugo (大富豪) - Core Rules
 *
 * Supported:
 * - 階段 (straight): same suit, 3+ consecutive ranks
 * - 革命: any play of 4+ cards toggles revolution
 * - 親: ♦3 holder starts each round
 * - 8切り: 8 clears the table
 * - イレブンバック (ジャックダウン): J toggles temporary reverse until the table clears (not in 階段)
 * - しばり: consecutive identical suit-signature locks suits until the table clears
 * - あがり禁止札: Joker, 2 (normal), 3 (reversed), 8 (when 8切り enabled) penalize ranking
 * - 都落ち: previous 大富豪 becomes 大貧民 if they don't finish 1st
 * - スペードの3: 3♠ beats a single Joker
 * - 5スキップ: 5 skips the next player
 * - 7渡し: 7 gives card(s) to the next player (auto-selects lowest cards if not provided)
 * - Multi-round ranking + card exchange (2nd round+)
 */

import type { Card } from './types';
import { isJoker, JOKER_RANK, SUITS, TWO_RANK } from './types';
import type { CardSuit } from './types';
import type { DaifugoAction, DaifugoLogEntry, DaifugoNetworkState, DaifugoPile, DaifugoRank } from './multiplayerTypes';

export interface DaifugoRules {
  eightCut: boolean;
  elevenBack: boolean;
  shibari: boolean;
  gekishiba: boolean; // 激縛り: same suit + consecutive rank locks to exact sequence
  spade3BeatsJoker: boolean;
  revolutionByFour: boolean;
  agariKinshi: boolean;
  capitalFall: boolean;
  fiveSkip: boolean;
  sevenGive: boolean;
  tenDiscard: boolean; // 10捨て: playing 10 lets you discard cards
}

export const DEFAULT_RULES: DaifugoRules = {
  eightCut: true,
  elevenBack: true,
  shibari: true,
  gekishiba: true,
  spade3BeatsJoker: true,
  revolutionByFour: true,
  agariKinshi: true,
  capitalFall: true,
  fiveSkip: true,
  sevenGive: true,
  tenDiscard: true,
};

export type DaifugoPlayShape =
  | {
    kind: 'group';
    count: number;
    rankKey: number;
    signature: string | null;
    isJokerSingle: boolean;
    isSpade3Single: boolean;
    containsEight: boolean;
    containsJack: boolean;
    containsFive: boolean;
    containsSeven: boolean;
    containsTen: boolean;
  }
  | {
    kind: 'straight';
    count: number;
    rankKey: number; // highest rank in the straight
    suit: Exclude<CardSuit, 'J'>;
    startRank: number;
    endRank: number;
    signature: string;
    containsEight: boolean;
    containsJack: boolean;
    containsFive: boolean;
    containsSeven: boolean;
    containsTen: boolean;
  };

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDeck(options?: { includeJoker?: boolean; deckId?: string }): Card[] {
  const includeJoker = options?.includeJoker ?? true;
  const deckId = options?.deckId ?? createId('deck');
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (let rank = 3; rank <= TWO_RANK; rank++) {
      deck.push({
        id: `${deckId}_${suit}_${rank}`,
        suit,
        rank,
      });
    }
  }

  if (includeJoker) {
    deck.push({
      id: `${deckId}_J_${JOKER_RANK}`,
      suit: 'J',
      rank: JOKER_RANK,
    });
  }

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<string, number> = { S: 0, H: 1, D: 2, C: 3, J: 4 };
  return [...hand].sort((a, b) => {
    const ra = isJoker(a) ? JOKER_RANK : a.rank;
    const rb = isJoker(b) ? JOKER_RANK : b.rank;
    if (ra !== rb) return ra - rb;
    return (suitOrder[a.suit] ?? 9) - (suitOrder[b.suit] ?? 9);
  });
}

export function dealHands(deck: Card[], playerOrder: string[]): Record<string, Card[]> {
  const hands: Record<string, Card[]> = {};
  for (const playerId of playerOrder) hands[playerId] = [];

  deck.forEach((card, index) => {
    const playerId = playerOrder[index % playerOrder.length];
    hands[playerId]!.push(card);
  });

  for (const playerId of playerOrder) {
    hands[playerId] = sortHand(hands[playerId] ?? []);
  }

  return hands;
}

function isSameSuit(cards: Card[]): cards is (Card & { suit: Exclude<CardSuit, 'J'> })[] {
  if (cards.length === 0) return false;
  const suit = cards[0]!.suit;
  if (suit === 'J') return false;
  return cards.every(c => c.suit === suit);
}

function toSuitSignature(cards: Card[]): string | null {
  if (cards.some(isJoker)) return null;
  const suits = cards.map(c => c.suit).sort();
  return suits.join('');
}

function isConsecutive(ranksAsc: number[]): boolean {
  for (let i = 1; i < ranksAsc.length; i++) {
    if (ranksAsc[i]! !== ranksAsc[i - 1]! + 1) return false;
  }
  return true;
}

export function getPlayShape(cards: Card[]): DaifugoPlayShape | null {
  if (cards.length === 0) return null;

  const containsEight = cards.some(c => !isJoker(c) && c.rank === 8);
  const containsJack = cards.some(c => !isJoker(c) && c.rank === 11);
  const containsFive = cards.some(c => !isJoker(c) && c.rank === 5);
  const containsSeven = cards.some(c => !isJoker(c) && c.rank === 7);
  const containsTen = cards.some(c => !isJoker(c) && c.rank === 10);

  if (cards.length === 1) {
    const card = cards[0]!;
    if (isJoker(card)) {
      return {
        kind: 'group',
        count: 1,
        rankKey: JOKER_RANK,
        signature: null,
        isJokerSingle: true,
        isSpade3Single: false,
        containsEight,
        containsJack,
        containsFive,
        containsSeven,
        containsTen,
      };
    }

    const isSpade3Single = card.suit === 'S' && card.rank === 3;
    return {
      kind: 'group',
      count: 1,
      rankKey: card.rank,
      signature: card.suit,
      isJokerSingle: false,
      isSpade3Single,
      containsEight,
      containsJack,
      containsFive,
      containsSeven,
      containsTen,
    };
  }

  // Group (same rank)
  if (!cards.some(isJoker) && cards.every(c => c.rank === cards[0]!.rank)) {
    return {
      kind: 'group',
      count: cards.length,
      rankKey: cards[0]!.rank,
      signature: toSuitSignature(cards),
      isJokerSingle: false,
      isSpade3Single: false,
      containsEight,
      containsJack,
      containsFive,
      containsSeven,
      containsTen,
    };
  }

  // Straight (階段): same suit, 3+ consecutive
  if (cards.length >= 3 && !cards.some(isJoker) && isSameSuit(cards)) {
    const ranksAsc = [...cards].map(c => c.rank).sort((a, b) => a - b);
    // Prevent duplicates (shouldn't happen in a standard deck for same suit)
    if (new Set(ranksAsc).size === ranksAsc.length && isConsecutive(ranksAsc)) {
      const suit = cards[0]!.suit as Exclude<CardSuit, 'J'>;
      const startRank = ranksAsc[0]!;
      const endRank = ranksAsc[ranksAsc.length - 1]!;
      return {
        kind: 'straight',
        count: cards.length,
        rankKey: endRank,
        suit,
        startRank,
        endRank,
        signature: suit.repeat(cards.length),
        containsEight,
        containsJack,
        containsFive,
        containsSeven,
        containsTen,
      };
    }
  }

  return null;
}

function findDiamond3Holder(hands: Record<string, Card[]>): string | null {
  for (const [playerId, hand] of Object.entries(hands)) {
    if (hand.some(c => c.suit === 'D' && c.rank === 3)) return playerId;
  }
  return null;
}

function effectiveReversed(state: DaifugoNetworkState): boolean {
  return state.revolution !== state.jackBack;
}

function compareRank(a: number, b: number, reversed: boolean): number {
  // Joker is always strongest (handled by callers).
  if (!reversed) return a - b;
  return b - a;
}

function moveIdsToEnd(order: string[], ids: string[]): string[] {
  const idSet = new Set(ids);
  const kept = order.filter(id => !idSet.has(id));
  const moved = order.filter(id => idSet.has(id));
  return [...kept, ...moved];
}

function computeRanksFromOrder(order: string[]): Record<string, DaifugoRank> {
  const n = order.length;
  const ranks: Record<string, DaifugoRank> = {};

  if (n === 2) {
    ranks[order[0]!] = 'daifugo';
    ranks[order[1]!] = 'daihinmin';
    return ranks;
  }

  if (n === 3) {
    ranks[order[0]!] = 'daifugo';
    ranks[order[1]!] = 'heimin';
    ranks[order[2]!] = 'daihinmin';
    return ranks;
  }

  if (n === 4) {
    ranks[order[0]!] = 'daifugo';
    ranks[order[1]!] = 'fugo';
    ranks[order[2]!] = 'hinmin';
    ranks[order[3]!] = 'daihinmin';
    return ranks;
  }

  // 5+
  ranks[order[0]!] = 'daifugo';
  ranks[order[1]!] = 'fugo';
  ranks[order[n - 2]!] = 'hinmin';
  ranks[order[n - 1]!] = 'daihinmin';

  for (let i = 2; i <= n - 3; i++) {
    ranks[order[i]!] = 'heimin';
  }

  return ranks;
}

function getStartDaifugoId(previousRanks?: Record<string, DaifugoRank> | null): string | null {
  if (!previousRanks) return null;
  const entry = Object.entries(previousRanks).find(([, rank]) => rank === 'daifugo');
  return entry?.[0] ?? null;
}

function isForbiddenFinish(
  cards: Card[],
  reversed: boolean,
  rules: DaifugoRules
): boolean {
  if (!rules.agariKinshi) return false;
  const hasJoker = cards.some(isJoker);
  if (hasJoker) return true;

  const hasTwo = cards.some(c => !isJoker(c) && c.rank === TWO_RANK);
  const hasThree = cards.some(c => !isJoker(c) && c.rank === 3);
  const hasEight = cards.some(c => !isJoker(c) && c.rank === 8);

  if (!reversed && hasTwo) return true;
  if (reversed && hasThree) return true;
  if (rules.eightCut && hasEight) return true;

  return false;
}

function pickExchangeStrengthKey(card: Card): number {
  if (isJoker(card)) return 999;
  return card.rank;
}

function pickWorstCards(hand: Card[], count: number): Card[] {
  return [...hand]
    .sort((a, b) => pickExchangeStrengthKey(a) - pickExchangeStrengthKey(b))
    .slice(0, Math.max(0, Math.min(count, hand.length)));
}

function pickBestCards(hand: Card[], count: number): Card[] {
  return [...hand]
    .sort((a, b) => pickExchangeStrengthKey(b) - pickExchangeStrengthKey(a))
    .slice(0, Math.max(0, Math.min(count, hand.length)));
}

function removeCardsById(hand: Card[], ids: Set<string>): Card[] {
  return hand.filter(c => !ids.has(c.id));
}

function applyCardExchange(
  hands: Record<string, Card[]>,
  previousRanks: Record<string, DaifugoRank>
): Record<string, Card[]> {
  const getByRank = (rank: DaifugoRank): string | null => (
    Object.entries(previousRanks).find(([, r]) => r === rank)?.[0] ?? null
  );

  const daifugoId = getByRank('daifugo');
  const daiHinminId = getByRank('daihinmin');
  const fugoId = getByRank('fugo');
  const hinminId = getByRank('hinmin');

  const nextHands: Record<string, Card[]> = { ...hands };

  const swap = (highId: string, lowId: string, count: number) => {
    const highHand = nextHands[highId] ?? [];
    const lowHand = nextHands[lowId] ?? [];
    if (highHand.length === 0 || lowHand.length === 0) return;

    const highGive = pickWorstCards(highHand, count);
    const lowGive = pickBestCards(lowHand, count);

    const highGiveIds = new Set(highGive.map(c => c.id));
    const lowGiveIds = new Set(lowGive.map(c => c.id));

    nextHands[highId] = sortHand([...removeCardsById(highHand, highGiveIds), ...lowGive]);
    nextHands[lowId] = sortHand([...removeCardsById(lowHand, lowGiveIds), ...highGive]);
  };

  if (daifugoId && daiHinminId) {
    swap(daifugoId, daiHinminId, 2);
  }
  if (fugoId && hinminId) {
    swap(fugoId, hinminId, 1);
  }

  return nextHands;
}

export function createInitialDaifugoState(
  playerOrder: string[],
  options?: { round?: number; previousRanks?: Record<string, DaifugoRank> | null }
): DaifugoNetworkState {
  const round = options?.round ?? 1;
  const deck = shuffleDeck(createDeck({ includeJoker: true }));
  const dealtHands = dealHands(deck, playerOrder);
  const hands = options?.previousRanks ? applyCardExchange(dealtHands, options.previousRanks) : dealtHands;

  const parentId = findDiamond3Holder(hands) ?? playerOrder[0] ?? '';

  const startedAt = Date.now();
  const startDaifugoId = getStartDaifugoId(options?.previousRanks ?? null);

  const log: DaifugoLogEntry[] = round === 1
    ? []
    : [{
      id: createId('log'),
      type: 'next_round',
      playerId: parentId,
      detail: `Round ${round} started`,
      timestamp: startedAt,
    }];

  return {
    version: 2,
    round,
    playerOrder,
    hands,
    currentTurnPlayerId: parentId,
    pile: null,
    passes: [],
    lastPlayedBy: null,
    finished: false,
    winnerId: null,
    finishedOrder: [],
    forbiddenFinishers: [],
    ranks: null,
    startDaifugoId,
    revolution: false,
    jackBack: false,
    lockSignature: null,
    lastPlaySignature: null,
    gekishibaNextRank: null,
    startedAt,
    log,
    lastUpdate: startedAt,
  };
}

export function getPlayerHand(state: DaifugoNetworkState, playerId: string): Card[] {
  return state.hands[playerId] ?? [];
}

export function getNextPlayerId(playerOrder: string[], fromPlayerId: string): string {
  const idx = playerOrder.indexOf(fromPlayerId);
  if (idx === -1) return playerOrder[0] ?? fromPlayerId;
  return playerOrder[(idx + 1) % playerOrder.length] ?? fromPlayerId;
}

export function getSelectedCards(hand: Card[], cardIds: string[]): Card[] | null {
  const byId = new Map(hand.map(c => [c.id, c]));
  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = byId.get(id);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

function isPlayerOut(state: DaifugoNetworkState, playerId: string): boolean {
  return state.finishedOrder.includes(playerId);
}

function getActivePlayers(state: DaifugoNetworkState): string[] {
  return state.playerOrder.filter(pid => !isPlayerOut(state, pid));
}

function getNextActivePlayerId(
  state: DaifugoNetworkState,
  fromPlayerId: string,
  options?: { skipPassed?: boolean; skipCount?: number }
): string {
  const skipPassed = options?.skipPassed ?? false;
  const skipCount = Math.max(0, options?.skipCount ?? 0);

  let current = fromPlayerId;
  for (let step = 0; step < state.playerOrder.length * 2; step++) {
    current = getNextPlayerId(state.playerOrder, current);
    if (isPlayerOut(state, current)) continue;
    if (skipPassed && state.pile && state.passes.includes(current)) continue;

    if (skipCount > 0) {
      return getNextActivePlayerId(state, current, { skipPassed, skipCount: skipCount - 1 });
    }
    return current;
  }
  return fromPlayerId;
}

function canPlayOnPile(
  state: DaifugoNetworkState,
  pile: DaifugoPile | null,
  play: DaifugoPlayShape,
  rules: DaifugoRules
): { ok: true } | { ok: false; error: string } {
  if (state.pile && state.passes.includes(state.currentTurnPlayerId)) {
    return { ok: false, error: 'Already passed' };
  }

  if (!pile) return { ok: true };
  if (play.count !== pile.count) return { ok: false, error: `Need ${pile.count} card(s)` };
  if (play.kind !== pile.kind) return { ok: false, error: 'Must play the same type' };

  // しばり (suit lock)
  if (rules.shibari && state.lockSignature && play.signature !== state.lockSignature) {
    // Joker ignores shibari
    if (!(play.kind === 'group' && play.isJokerSingle)) {
      return { ok: false, error: 'Shibari: suit locked' };
    }
  }

  // 激縛り (gekishiba) - must play exact next rank
  if (rules.gekishiba && state.gekishibaNextRank !== null) {
    // Joker cannot satisfy gekishiba
    if (play.kind === 'group' && play.isJokerSingle) {
      return { ok: false, error: '激縛り中はジョーカーは出せません' };
    }
    if (play.rankKey !== state.gekishibaNextRank) {
      return { ok: false, error: `激縛り: ${state.gekishibaNextRank}のみ出せます` };
    }
  }

  // Group compare
  if (play.kind === 'group') {
    const pileIsJoker = pile.kind === 'group' && pile.rankKey === JOKER_RANK;
    const pileIsSpade3 = pile.kind === 'group' && pile.rankKey === 3 && pile.cards.length === 1 && pile.cards[0]?.suit === 'S';

    if (play.isJokerSingle) {
      if (pileIsSpade3 && rules.spade3BeatsJoker) return { ok: false, error: '3♠ beats Joker' };
      return { ok: true };
    }

    if (pileIsJoker) {
      if (rules.spade3BeatsJoker && play.isSpade3Single) return { ok: true };
      return { ok: false, error: 'Only 3♠ can beat Joker' };
    }

    if (pileIsSpade3 && rules.spade3BeatsJoker) {
      return { ok: false, error: 'Nothing beats 3♠' };
    }

    const reversed = effectiveReversed(state);
    if (compareRank(play.rankKey, pile.rankKey, reversed) <= 0) return { ok: false, error: 'Too low' };
    return { ok: true };
  }

  // Straight compare
  const reversed = effectiveReversed(state);
  if (compareRank(play.rankKey, pile.rankKey, reversed) <= 0) return { ok: false, error: 'Too low' };
  return { ok: true };
}

export function applyAction(
  state: DaifugoNetworkState,
  action: DaifugoAction,
  rulesOverride?: Partial<DaifugoRules>
): { ok: true; state: DaifugoNetworkState } | { ok: false; error: string } {
  const rules: DaifugoRules = { ...DEFAULT_RULES, ...(rulesOverride ?? {}) };

  if (state.finished) return { ok: false, error: 'Round finished' };
  if (action.playerId !== state.currentTurnPlayerId) return { ok: false, error: 'Not your turn' };
  if (isPlayerOut(state, action.playerId)) return { ok: false, error: 'Player already finished' };

  if (action.type === 'pass') {
    if (!state.pile) return { ok: false, error: 'Cannot pass on an empty table' };
    if (!state.lastPlayedBy) return { ok: false, error: 'Invalid state' };

    const alreadyPassed = state.passes.includes(action.playerId);
    const newPasses = alreadyPassed ? state.passes : [...state.passes, action.playerId];

    // Trick ends when everyone except lastPlayedBy has passed
    const activePlayers = getActivePlayers(state);
    const playersToPass = activePlayers.filter(pid => pid !== state.lastPlayedBy);
    const trickShouldEnd = playersToPass.every(pid => newPasses.includes(pid));

    const logEntry: DaifugoLogEntry = {
      id: createId('log'),
      type: 'pass',
      playerId: action.playerId,
      timestamp: action.timestamp,
    };

    if (trickShouldEnd) {
      const trickEndEntry: DaifugoLogEntry = {
        id: createId('log'),
        type: 'trick_end',
        playerId: state.lastPlayedBy,
        timestamp: action.timestamp,
      };

      const nextLeader = isPlayerOut(state, state.lastPlayedBy)
        ? getNextActivePlayerId(state, state.lastPlayedBy)
        : state.lastPlayedBy;

      return {
        ok: true,
        state: {
          ...state,
          pile: null,
          passes: [],
          currentTurnPlayerId: nextLeader,
          jackBack: false,
          lockSignature: null,
          lastPlaySignature: null,
          gekishibaNextRank: null,
          log: [...state.log, logEntry, trickEndEntry],
          lastUpdate: Date.now(),
        },
      };
    }

    const next = getNextActivePlayerId(state, action.playerId, { skipPassed: true });
    return {
      ok: true,
      state: {
        ...state,
        passes: newPasses,
        currentTurnPlayerId: next,
        log: [...state.log, logEntry],
        lastUpdate: Date.now(),
      },
    };
  }

  // play
  const hand = getPlayerHand(state, action.playerId);
  const selectedCards = getSelectedCards(hand, action.cardIds);
  if (!selectedCards) return { ok: false, error: 'Card not in hand' };

  const shape = getPlayShape(selectedCards);
  if (!shape) return { ok: false, error: 'Invalid combination' };

  const pileCheck = canPlayOnPile(state, state.pile, shape, rules);
  if (!pileCheck.ok) return pileCheck;

  const beforeJackBack = state.jackBack;
  const beforeRevolution = state.revolution;

  // Remove played cards
  const remainingHandRaw = hand.filter(c => !action.cardIds.includes(c.id));
  let remainingHand = sortHand(remainingHandRaw);
  const newHands: Record<string, Card[]> = { ...state.hands, [action.playerId]: remainingHand };

  // 7渡し (give to next player)
  if (rules.sevenGive && shape.kind === 'group' && shape.rankKey === 7 && remainingHand.length > 0) {
    const giveCount = Math.min(shape.count, remainingHand.length);
    const toPlayerId = getNextActivePlayerId(state, action.playerId);
    const giveIds = action.giveCardIds?.length
      ? action.giveCardIds
      : pickWorstCards(remainingHand, giveCount).map(c => c.id);

    if (giveIds.length < giveCount) {
      return { ok: false, error: `Select ${giveCount} card(s) to give` };
    }

    const selectedGiveCards = getSelectedCards(remainingHand, giveIds.slice(0, giveCount));
    if (!selectedGiveCards) return { ok: false, error: 'Give card not in hand' };

    const giveSet = new Set(selectedGiveCards.map(c => c.id));
    remainingHand = sortHand(removeCardsById(remainingHand, giveSet));
    newHands[action.playerId] = remainingHand;
    newHands[toPlayerId] = sortHand([...(newHands[toPlayerId] ?? []), ...selectedGiveCards]);
  }

  // 10捨て (ten discard): playing 10 lets you discard cards equal to the number of 10s
  if (rules.tenDiscard && shape.containsTen && shape.kind === 'group' && remainingHand.length > 0) {
    const discardCount = Math.min(shape.count, remainingHand.length);
    const discardIds = action.discardCardIds?.slice(0, discardCount) ?? [];

    if (discardIds.length > 0) {
      const discardCards = getSelectedCards(remainingHand, discardIds);
      if (discardCards) {
        const discardSet = new Set(discardCards.map(c => c.id));
        remainingHand = sortHand(removeCardsById(remainingHand, discardSet));
        newHands[action.playerId] = remainingHand;
      }
    }
  }

  // Determine pile + signatures
  const nextPile: DaifugoPile = {
    kind: shape.kind,
    cards: selectedCards,
    count: shape.count,
    rankKey: shape.rankKey,
    signature: shape.signature,
    playedBy: action.playerId,
  };

  // しばり detection - Fixed logic
  let lockSignature = state.lockSignature;
  let lastPlaySignature = state.lastPlaySignature;

  if (!state.pile) {
    // First play of the trick - start tracking signature
    lockSignature = null;
    lastPlaySignature = shape.signature; // Track the first play's signature
  } else if (rules.shibari && shape.signature) {
    // Subsequent play - check for shibari
    if (lastPlaySignature && lastPlaySignature === shape.signature) {
      // Two consecutive plays with same signature = lock!
      lockSignature = shape.signature;
    }
    lastPlaySignature = shape.signature;
  } else if (shape.signature) {
    // Not shibari rule but still track signature
    lastPlaySignature = shape.signature;
  }

  // 激縛り (gekishiba) detection - same suit + consecutive rank
  let gekishibaNextRank: number | null = null;
  if (!state.pile) {
    // First play - no gekishiba yet
    gekishibaNextRank = null;
  } else if (rules.gekishiba && shape.signature && shape.signature === state.pile.signature) {
    // Same suit as pile - check if consecutive
    const reversedForGekishiba = state.revolution !== state.jackBack;
    const step = reversedForGekishiba ? -1 : 1;
    const isConsecutive = shape.rankKey === state.pile.rankKey + step;

    if (isConsecutive) {
      // Consecutive! Gekishiba activates or continues
      gekishibaNextRank = shape.rankKey + step;
      // Also ensure suit is locked
      lockSignature = shape.signature;
    }
  }

  // Apply revolution / eleven-back
  let revolution = state.revolution;
  let jackBack = state.jackBack;
  if (rules.revolutionByFour && shape.count >= 4) {
    revolution = !revolution;
  }
  if (rules.elevenBack && shape.kind !== 'straight' && shape.containsJack) {
    jackBack = true;
  }

  const afterPlayStateBase: DaifugoNetworkState = {
    ...state,
    hands: newHands,
    pile: nextPile,
    lastPlayedBy: action.playerId,
    lockSignature,
    lastPlaySignature,
    gekishibaNextRank,
    revolution,
    jackBack,
  };

  const reversedNow = effectiveReversed(afterPlayStateBase);

  // Finish detection + forbidden finish tracking
  let finishedOrder = state.finishedOrder;
  let forbiddenFinishers = state.forbiddenFinishers;
  let winnerId = state.winnerId;

  const playerHandAfter = newHands[action.playerId] ?? [];
  if (playerHandAfter.length === 0 && !finishedOrder.includes(action.playerId)) {
    finishedOrder = [...finishedOrder, action.playerId];
    if (!winnerId) winnerId = action.playerId;

    if (isForbiddenFinish(selectedCards, reversedNow, rules)) {
      forbiddenFinishers = forbiddenFinishers.includes(action.playerId)
        ? forbiddenFinishers
        : [...forbiddenFinishers, action.playerId];
    }
  }

  // 8切り: clear the table immediately
  const eightCutTriggered = rules.eightCut && shape.containsEight;
  const fiveSkipCount = rules.fiveSkip && shape.containsFive ? 1 : 0;

  // Determine next turn (or trick end)
  let pile: DaifugoPile | null = nextPile;
  let passes = state.passes;
  let currentTurnPlayerId = state.currentTurnPlayerId;
  let lastPlayedBy = action.playerId;

  const activePlayersAfter = state.playerOrder.filter(pid => !finishedOrder.includes(pid));

  const roundShouldEnd = activePlayersAfter.length <= 1;
  let ranks: Record<string, DaifugoRank> | null = null;
  let finished = false;
  let log = state.log;

  const playEntry: DaifugoLogEntry = {
    id: createId('log'),
    type: 'play',
    playerId: action.playerId,
    playKind: shape.kind,
    cardCount: shape.count,
    rankKey: shape.rankKey,
    signature: shape.signature,
    timestamp: action.timestamp,
  };

  log = [...log, playEntry];

  const clearTable = (leaderCandidate: string) => {
    pile = null;
    passes = [];
    lockSignature = null;
    lastPlaySignature = null;
    gekishibaNextRank = null;
    jackBack = false;

    currentTurnPlayerId = finishedOrder.includes(leaderCandidate)
      ? getNextActivePlayerId({ ...afterPlayStateBase, finishedOrder }, leaderCandidate)
      : leaderCandidate;
  };

  if (roundShouldEnd) {
    // Add last remaining player as the last finisher
    const lastRemaining = state.playerOrder.find(pid => !finishedOrder.includes(pid)) ?? null;
    const fullOrder = lastRemaining ? [...finishedOrder, lastRemaining] : [...finishedOrder];

    const actualWinnerId = winnerId ?? fullOrder[0] ?? null;
    let adjustedOrder = [...fullOrder];

    // Penalty: あがり禁止札 -> move to end
    if (rules.agariKinshi && forbiddenFinishers.length) {
      adjustedOrder = moveIdsToEnd(adjustedOrder, forbiddenFinishers);
    }

    // Penalty: 都落ち (capital fall)
    if (rules.capitalFall && state.startDaifugoId && actualWinnerId && actualWinnerId !== state.startDaifugoId) {
      adjustedOrder = moveIdsToEnd(adjustedOrder, [state.startDaifugoId]);
    }

    ranks = computeRanksFromOrder(adjustedOrder);
    finished = true;

    const roundEndEntry: DaifugoLogEntry = {
      id: createId('log'),
      type: 'round_end',
      playerId: actualWinnerId ?? action.playerId,
      detail: 'Round finished',
      timestamp: Date.now(),
    };

    log = [...log, roundEndEntry];

    pile = null;
    passes = [];
    lockSignature = null;
    lastPlaySignature = null;
    gekishibaNextRank = null;
    jackBack = false;
    currentTurnPlayerId = actualWinnerId ?? action.playerId;
    lastPlayedBy = action.playerId;

    return {
      ok: true,
      state: {
        ...afterPlayStateBase,
        pile,
        passes,
        currentTurnPlayerId,
        lastPlayedBy,
        finished: true,
        winnerId: actualWinnerId,
        finishedOrder: fullOrder,
        forbiddenFinishers,
        ranks,
        jackBack,
        lockSignature,
        lastPlaySignature,
        gekishibaNextRank,
        log,
        lastUpdate: Date.now(),
      },
    };
  }

  if (eightCutTriggered) {
    clearTable(action.playerId);
  }

  if (pile) {
    // If everyone else has already passed, the trick ends immediately.
    const activePlayers = getActivePlayers({ ...afterPlayStateBase, finishedOrder });
    const others = activePlayers.filter(pid => pid !== action.playerId);
    const everyoneElsePassed = others.length > 0 && others.every(pid => passes.includes(pid));
    if (everyoneElsePassed) {
      clearTable(action.playerId);
    } else {
      currentTurnPlayerId = getNextActivePlayerId(
        { ...afterPlayStateBase, finishedOrder, pile, passes },
        action.playerId,
        { skipPassed: true, skipCount: fiveSkipCount }
      );
    }
  }

  // Track finish order changes
  const newState: DaifugoNetworkState = {
    ...afterPlayStateBase,
    pile,
    passes,
    currentTurnPlayerId,
    lastPlayedBy,
    finished,
    winnerId,
    finishedOrder,
    forbiddenFinishers,
    ranks,
    jackBack,
    lockSignature,
    lastPlaySignature,
    gekishibaNextRank,
    log,
    lastUpdate: Date.now(),
  };

  // If revolution or jackBack changed, log it lightly
  if (beforeRevolution !== newState.revolution) {
    newState.log = [...newState.log, {
      id: createId('log'),
      type: 'play',
      playerId: action.playerId,
      detail: 'Revolution toggled',
      timestamp: Date.now(),
    }];
  }
  if (beforeJackBack !== newState.jackBack && newState.jackBack) {
    newState.log = [...newState.log, {
      id: createId('log'),
      type: 'play',
      playerId: action.playerId,
      detail: 'Eleven-back active',
      timestamp: Date.now(),
    }];
  }

  return { ok: true, state: newState };
}
