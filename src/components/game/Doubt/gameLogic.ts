/**
 * Doubt (ダウト) - Core Rules
 *
 * Rules implemented:
 * - Standard 52-card deck, dealt evenly
 * - Turns follow a fixed rank sequence: A,2,3,...,K, A,...
 * - On your play turn, place 1–4 cards face-down and declare them as the required rank
 * - The next player may either Accept (no challenge) or Doubt
 * - If Doubt is called:
 *   - If the claim was truthful, the doubter takes the whole pile
 *   - If the claim was a lie, the claimant takes the whole pile
 *   - The pile taker plays next
 * - A player can only be considered "finished" when they have 0 cards and their last claim is accepted / proven truthful
 * - The game ends when all players are finished, or when only one player remains (auto-finished last)
 */

import type { Card, CardRank, CardSuit } from './types';
import { MAX_RANK, MIN_RANK, SUITS } from './types';
import type { DoubtAction, DoubtLogEntry, DoubtNetworkState } from './multiplayerTypes';

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDeck(options?: { deckId?: string }): Card[] {
  const deckId = options?.deckId ?? createId('deck');
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      deck.push({ id: `${deckId}_${suit}_${rank}`, suit, rank });
    }
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
  const suitOrder: Record<CardSuit, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...hand].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

export function dealHands(deck: Card[], playerOrder: string[]): Record<string, Card[]> {
  const hands: Record<string, Card[]> = {};
  for (const pid of playerOrder) hands[pid] = [];

  deck.forEach((card, idx) => {
    const pid = playerOrder[idx % playerOrder.length];
    hands[pid]!.push(card);
  });

  for (const pid of playerOrder) {
    hands[pid] = sortHand(hands[pid] ?? []);
  }

  return hands;
}

export function getNextPlayerId(playerOrder: string[], fromPlayerId: string): string {
  const idx = playerOrder.indexOf(fromPlayerId);
  if (idx === -1) return playerOrder[0] ?? fromPlayerId;
  return playerOrder[(idx + 1) % playerOrder.length] ?? fromPlayerId;
}

function isFinished(state: DoubtNetworkState, playerId: string): boolean {
  return state.finishedOrder.includes(playerId);
}

function getNextActivePlayerId(state: DoubtNetworkState, fromPlayerId: string): string | null {
  let current = fromPlayerId;
  for (let step = 0; step < state.playerOrder.length * 2; step++) {
    current = getNextPlayerId(state.playerOrder, current);
    if (isFinished(state, current)) continue;
    return current;
  }
  return null;
}

export function nextRank(rank: CardRank): CardRank {
  if (rank >= MAX_RANK) return MIN_RANK;
  return rank + 1;
}

function computeRanks(playerOrder: string[], finishedOrder: string[]): Record<string, number> {
  const ranks: Record<string, number> = {};
  finishedOrder.forEach((pid, idx) => {
    ranks[pid] = idx + 1;
  });
  // Fallback (shouldn't happen)
  playerOrder.forEach((pid) => {
    if (!ranks[pid]) ranks[pid] = finishedOrder.length + 1;
  });
  return ranks;
}

function maybeFinishGame(state: DoubtNetworkState, timestamp: number): DoubtNetworkState {
  if (state.finished) return state;

  const remaining = state.playerOrder.filter(pid => !state.finishedOrder.includes(pid));
  if (remaining.length > 1) return state;

  let finishedOrder = state.finishedOrder;
  if (remaining.length === 1 && !finishedOrder.includes(remaining[0]!)) {
    finishedOrder = [...finishedOrder, remaining[0]!];
  }

  const winnerId = finishedOrder[0] ?? null;
  const ranks = computeRanks(state.playerOrder, finishedOrder);

  const log: DoubtLogEntry[] = [...state.log, {
    id: createId('log'),
    type: 'finish',
    playerId: winnerId ?? state.currentTurnPlayerId,
    detail: 'Game finished',
    timestamp,
  }];

  return {
    ...state,
    phase: 'finished',
    finished: true,
    winnerId,
    ranks,
    finishedOrder,
    log,
    lastUpdate: Date.now(),
  };
}

export function createInitialDoubtState(playerOrder: string[]): DoubtNetworkState {
  const startedAt = Date.now();
  const deck = shuffleDeck(createDeck());
  const hands = dealHands(deck, playerOrder);

  const startIndex = Math.floor(Math.random() * Math.max(1, playerOrder.length));
  const currentTurnPlayerId = playerOrder[startIndex] ?? (playerOrder[0] ?? '');

  const log: DoubtLogEntry[] = [{
    id: createId('log'),
    type: 'start',
    playerId: currentTurnPlayerId,
    detail: 'Game started',
    timestamp: startedAt,
  }];

  return {
    version: 1,
    phase: 'play',
    playerOrder,
    hands,
    pile: [],
    pendingClaim: null,
    currentTurnPlayerId,
    requiredRank: MIN_RANK,
    finishedOrder: [],
    finished: false,
    winnerId: null,
    ranks: null,
    startedAt,
    log,
    lastUpdate: startedAt,
  };
}

function ensureUnique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function markFinished(state: DoubtNetworkState, playerId: string, timestamp: number): DoubtNetworkState {
  if (state.finishedOrder.includes(playerId)) return state;
  const next = { ...state, finishedOrder: [...state.finishedOrder, playerId] };
  const entry: DoubtLogEntry = {
    id: createId('log'),
    type: 'resolve',
    playerId,
    detail: 'Player finished',
    timestamp,
  };
  return { ...next, log: [...next.log, entry], lastUpdate: Date.now() };
}

export function applyAction(
  state: DoubtNetworkState,
  action: DoubtAction
): { ok: true; state: DoubtNetworkState } | { ok: false; error: string } {
  if (state.finished || state.phase === 'finished') return { ok: false, error: 'Game is finished' };
  if (action.playerId !== state.currentTurnPlayerId) return { ok: false, error: 'Not your turn' };
  if (isFinished(state, action.playerId)) return { ok: false, error: 'Player is finished' };

  if (state.phase === 'play') {
    if (action.type !== 'play') return { ok: false, error: 'Expected play action' };
    const cardIds = action.cardIds ?? [];
    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 4) {
      return { ok: false, error: 'Select 1–4 cards' };
    }
    if (!ensureUnique(cardIds)) return { ok: false, error: 'Duplicate cards' };

    const hand = state.hands[action.playerId] ?? [];
    const selected = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean) as Card[];
    if (selected.length !== cardIds.length) return { ok: false, error: 'Card not in hand' };

    const remaining = sortHand(hand.filter(c => !cardIds.includes(c.id)));
    const wentOut = remaining.length === 0;

    const nextHands = { ...state.hands, [action.playerId]: remaining };
    const declaredRank = state.requiredRank;
    const nextRequiredRank = nextRank(state.requiredRank);

    const nextPile = [...state.pile, ...selected];

    const nextStateBase: DoubtNetworkState = {
      ...state,
      hands: nextHands,
      pile: nextPile,
      pendingClaim: {
        playerId: action.playerId,
        declaredRank,
        cardIds,
        cardCount: cardIds.length,
        wentOut,
        timestamp: action.timestamp,
      },
      requiredRank: nextRequiredRank,
      phase: 'challenge',
      lastUpdate: Date.now(),
      log: [...state.log, {
        id: createId('log'),
        type: 'play',
        playerId: action.playerId,
        declaredRank,
        count: cardIds.length,
        timestamp: action.timestamp,
      }],
    };

    const challengerId = getNextActivePlayerId(nextStateBase, action.playerId);
    if (!challengerId) {
      // Nobody left to challenge; auto-accept and finish the last player(s).
      const acceptedState: DoubtNetworkState = {
        ...nextStateBase,
        phase: 'play',
        currentTurnPlayerId: action.playerId,
        pendingClaim: null,
        log: [...nextStateBase.log, {
          id: createId('log'),
          type: 'accept',
          playerId: action.playerId,
          detail: 'Auto-accepted (no challengers)',
          timestamp: action.timestamp,
        }],
        lastUpdate: Date.now(),
      };

      const withFinish = wentOut ? markFinished(acceptedState, action.playerId, action.timestamp) : acceptedState;
      return { ok: true, state: maybeFinishGame(withFinish, action.timestamp) };
    }

    return { ok: true, state: { ...nextStateBase, currentTurnPlayerId: challengerId } };
  }

  // challenge phase
  if (!state.pendingClaim) return { ok: false, error: 'No claim to challenge' };

  if (action.type === 'accept') {
    const claim = state.pendingClaim;
    let nextState: DoubtNetworkState = {
      ...state,
      phase: 'play',
      pendingClaim: null,
      log: [...state.log, {
        id: createId('log'),
        type: 'accept',
        playerId: action.playerId,
        declaredRank: claim.declaredRank,
        count: claim.cardCount,
        timestamp: action.timestamp,
      }],
      lastUpdate: Date.now(),
    };

    if (claim.wentOut) {
      nextState = markFinished(nextState, claim.playerId, action.timestamp);
    }

    return { ok: true, state: maybeFinishGame(nextState, action.timestamp) };
  }

  if (action.type !== 'doubt') return { ok: false, error: 'Expected accept or doubt' };

  const claim = state.pendingClaim;
  const claimCards = claim.cardIds
    .map(id => state.pile.find(c => c.id === id))
    .filter(Boolean) as Card[];

  // If something is inconsistent, treat as invalid.
  if (claimCards.length !== claim.cardIds.length) return { ok: false, error: 'Invalid claim cards' };

  const truth = claimCards.every(c => c.rank === claim.declaredRank);
  const pileTakerId = truth ? action.playerId : claim.playerId;

  const takerHand = sortHand([...(state.hands[pileTakerId] ?? []), ...state.pile]);
  const nextHands = { ...state.hands, [pileTakerId]: takerHand };

  let nextState: DoubtNetworkState = {
    ...state,
    hands: nextHands,
    pile: [],
    pendingClaim: null,
    phase: 'play',
    currentTurnPlayerId: pileTakerId,
    log: [...state.log, {
      id: createId('log'),
      type: 'doubt',
      playerId: action.playerId,
      declaredRank: claim.declaredRank,
      count: claim.cardCount,
      timestamp: action.timestamp,
    }, {
      id: createId('log'),
      type: 'resolve',
      playerId: claim.playerId,
      declaredRank: claim.declaredRank,
      count: claim.cardCount,
      claimTruth: truth,
      pileTakerId,
      detail: truth ? 'Truth (doubter takes pile)' : 'Lie (claimant takes pile)',
      timestamp: action.timestamp,
    }],
    lastUpdate: Date.now(),
  };

  if (truth && claim.wentOut) {
    nextState = markFinished(nextState, claim.playerId, action.timestamp);
  }

  return { ok: true, state: maybeFinishGame(nextState, action.timestamp) };
}

