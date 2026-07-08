/**
 * Shichinarabe (七並べ) - Core Rules
 *
 * Default rules:
 * - 7 of each suit is placed at start (removed from hands)
 * - Each turn, play exactly 1 card adjacent to the current run for that suit
 * - You may pass up to `maxPasses` times; hitting the limit eliminates you
 * - Game ends when everyone is finished or eliminated
 */

import type { Card, CardSuit } from './types';
import { MAX_RANK, MIN_RANK, SEVEN_RANK, SUITS } from './types';
import type { ShichinarabeAction, ShichinarabeLogEntry, ShichinarabeNetworkState } from './multiplayerTypes';

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDeck(options?: { deckId?: string }): Card[] {
  const deckId = options?.deckId ?? createId('deck');
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      deck.push({
        id: `${deckId}_${suit}_${rank}`,
        suit,
        rank,
      });
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
    const ra = a.rank;
    const rb = b.rank;
    if (ra !== rb) return ra - rb;
    return suitOrder[a.suit] - suitOrder[b.suit];
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

export function getNextPlayerId(playerOrder: string[], fromPlayerId: string): string {
  const idx = playerOrder.indexOf(fromPlayerId);
  if (idx === -1) return playerOrder[0] ?? fromPlayerId;
  return playerOrder[(idx + 1) % playerOrder.length] ?? fromPlayerId;
}

function isDone(state: ShichinarabeNetworkState, playerId: string): boolean {
  return state.finishedOrder.includes(playerId) || state.eliminatedOrder.includes(playerId);
}

function getNextActivePlayerId(state: ShichinarabeNetworkState, fromPlayerId: string): string {
  let current = fromPlayerId;
  for (let step = 0; step < state.playerOrder.length * 2; step++) {
    current = getNextPlayerId(state.playerOrder, current);
    if (isDone(state, current)) continue;
    return current;
  }
  return fromPlayerId;
}

/**
 * When a player is eliminated (pass limit), their remaining hand is revealed and
 * placed onto the table. Cards are placed at their proper positions as soon as they
 * become adjacent to their suit's run; we iterate because placing one card can open
 * up the next. Cards whose neighbour is still held by an active player remain as gaps
 * and get filled in naturally later (this matches real 七並べ table dynamics).
 *
 * Mutates the provided `hands` and `table` copies. Returns the cards that were placed
 * (in placement order) so callers can log them.
 */
export function redistributeEliminatedHand(
  hands: Record<string, Card[]>,
  table: Record<CardSuit, { low: number; high: number }>,
  eliminatedPlayerId: string
): { suit: CardSuit; rank: number }[] {
  const placed: { suit: CardSuit; rank: number }[] = [];
  let remaining = hands[eliminatedPlayerId] ?? [];

  let progressed = true;
  while (progressed && remaining.length > 0) {
    progressed = false;
    const stillHeld: Card[] = [];
    for (const card of remaining) {
      const bounds = table[card.suit];
      if (bounds && (card.rank === bounds.low - 1 || card.rank === bounds.high + 1)) {
        if (card.rank === bounds.low - 1) bounds.low = card.rank;
        else bounds.high = card.rank;
        placed.push({ suit: card.suit, rank: card.rank });
        progressed = true;
      } else {
        stillHeld.push(card);
      }
    }
    remaining = stillHeld;
  }

  hands[eliminatedPlayerId] = sortHand(remaining);
  return placed;
}

/**
 * Reveal any eliminated cards that have since become placeable. Eliminated players
 * never take turns, so a card they hold whose neighbour toward 7 was still in an
 * active hand at elimination time must be flushed here once that neighbour is played
 * — otherwise the suit run stays permanently blocked. Runs across every eliminated
 * hand and re-iterates (placing one eliminated card can unlock another eliminated
 * card in the same or a different hand) until nothing more can be placed.
 *
 * Mutates `hands` and `table`. Returns per-player placements so callers can log them.
 */
export function revealEliminatedCards(
  hands: Record<string, Card[]>,
  table: Record<CardSuit, { low: number; high: number }>,
  eliminatedOrder: string[]
): { playerId: string; suit: CardSuit; rank: number }[] {
  const placements: { playerId: string; suit: CardSuit; rank: number }[] = [];
  if (eliminatedOrder.length === 0) return placements;

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const pid of eliminatedOrder) {
      const placed = redistributeEliminatedHand(hands, table, pid);
      if (placed.length > 0) {
        progressed = true;
        for (const p of placed) placements.push({ playerId: pid, suit: p.suit, rank: p.rank });
      }
    }
  }
  return placements;
}

export function getPlayableRanksForSuit(bounds: { low: number; high: number }): number[] {
  const playable: number[] = [];
  if (bounds.low > MIN_RANK) playable.push(bounds.low - 1);
  if (bounds.high < MAX_RANK) playable.push(bounds.high + 1);
  return playable;
}

export function isCardPlayable(state: ShichinarabeNetworkState, card: Card): boolean {
  const bounds = state.table[card.suit];
  if (!bounds) return false;
  const playable = getPlayableRanksForSuit(bounds);
  return playable.includes(card.rank);
}

export function getPlayableCardsForPlayer(state: ShichinarabeNetworkState, playerId: string): Card[] {
  if (state.finished || isDone(state, playerId)) return [];
  const hand = state.hands[playerId] ?? [];
  return hand.filter(card => isCardPlayable(state, card));
}

export function createInitialShichinarabeState(
  playerOrder: string[],
  options?: { maxPasses?: number }
): ShichinarabeNetworkState {
  const startedAt = Date.now();
  const deck = shuffleDeck(createDeck());
  const dealtHands = dealHands(deck, playerOrder);

  // Place all 7s at the start (remove from hands)
  const hands: Record<string, Card[]> = {};
  for (const [playerId, hand] of Object.entries(dealtHands)) {
    hands[playerId] = sortHand(hand.filter(c => c.rank !== SEVEN_RANK));
  }

  const table: ShichinarabeNetworkState['table'] = {
    S: { low: SEVEN_RANK, high: SEVEN_RANK },
    H: { low: SEVEN_RANK, high: SEVEN_RANK },
    D: { low: SEVEN_RANK, high: SEVEN_RANK },
    C: { low: SEVEN_RANK, high: SEVEN_RANK },
  };

  const maxPasses = Math.max(0, Math.floor(options?.maxPasses ?? 3));

  const passCounts: Record<string, number> = {};
  for (const playerId of playerOrder) passCounts[playerId] = 0;

  const currentTurnPlayerId = playerOrder[0] ?? '';

  const log: ShichinarabeLogEntry[] = [{
    id: createId('log'),
    type: 'start',
    playerId: currentTurnPlayerId,
    detail: 'Game started',
    timestamp: startedAt,
  }];

  return {
    version: 1,
    playerOrder,
    hands,
    table,
    currentTurnPlayerId,
    passCounts,
    maxPasses,
    finishedOrder: [],
    eliminatedOrder: [],
    finished: false,
    winnerId: null,
    resultOrder: [],
    ranks: null,
    startedAt,
    log,
    lastUpdate: startedAt,
  };
}

export function applyAction(
  state: ShichinarabeNetworkState,
  action: ShichinarabeAction
): { ok: true; state: ShichinarabeNetworkState } | { ok: false; error: string } {
  if (state.finished) return { ok: false, error: 'Game is finished' };
  if (action.playerId !== state.currentTurnPlayerId) return { ok: false, error: 'Not your turn' };
  if (isDone(state, action.playerId)) return { ok: false, error: 'Player is not active' };

  if (action.type === 'pass') {
    const nextPassCounts = { ...state.passCounts };
    nextPassCounts[action.playerId] = (nextPassCounts[action.playerId] ?? 0) + 1;

    const logEntries: ShichinarabeLogEntry[] = [{
      id: createId('log'),
      type: 'pass',
      playerId: action.playerId,
      passCount: nextPassCounts[action.playerId],
      timestamp: action.timestamp,
    }];

    let eliminatedOrder = state.eliminatedOrder;
    let nextHands = state.hands;
    let nextTable = state.table;
    if ((nextPassCounts[action.playerId] ?? 0) >= state.maxPasses && !state.eliminatedOrder.includes(action.playerId)) {
      eliminatedOrder = [...state.eliminatedOrder, action.playerId];
      logEntries.push({
        id: createId('log'),
        type: 'eliminate',
        playerId: action.playerId,
        detail: 'Eliminated (pass limit)',
        timestamp: action.timestamp,
      });

      // Reveal and place eliminated hands onto the table. We flush across ALL
      // eliminated players (not just this one), because opening this hand's cards can
      // in turn unblock cards a previously-eliminated player was still holding.
      const handsCopy: Record<string, Card[]> = {};
      for (const [pid, hand] of Object.entries(state.hands)) handsCopy[pid] = [...hand];
      const tableCopy = {
        S: { ...state.table.S },
        H: { ...state.table.H },
        D: { ...state.table.D },
        C: { ...state.table.C },
      } as ShichinarabeNetworkState['table'];
      const placed = revealEliminatedCards(handsCopy, tableCopy, eliminatedOrder);
      nextHands = handsCopy;
      nextTable = tableCopy;
      for (const p of placed) {
        logEntries.push({
          id: createId('log'),
          type: 'play',
          playerId: p.playerId,
          card: { suit: p.suit, rank: p.rank },
          detail: 'Revealed on elimination',
          timestamp: action.timestamp,
        });
      }
    }

    const nextStateBase: ShichinarabeNetworkState = {
      ...state,
      hands: nextHands,
      table: nextTable,
      passCounts: nextPassCounts,
      eliminatedOrder,
      log: [...state.log, ...logEntries],
      lastUpdate: Date.now(),
    };

    const doneCount = state.playerOrder.filter(pid => (
      nextStateBase.finishedOrder.includes(pid) || nextStateBase.eliminatedOrder.includes(pid)
    )).length;

    if (doneCount >= state.playerOrder.length) {
      const resultOrder = [
        ...nextStateBase.finishedOrder,
        ...nextStateBase.eliminatedOrder,
        ...state.playerOrder.filter(pid => !nextStateBase.finishedOrder.includes(pid) && !nextStateBase.eliminatedOrder.includes(pid)),
      ];
      const ranks: Record<string, number> = {};
      resultOrder.forEach((pid, idx) => { ranks[pid] = idx + 1; });
      const winnerId = nextStateBase.finishedOrder[0] ?? null;
      return {
        ok: true,
        state: {
          ...nextStateBase,
          finished: true,
          winnerId,
          resultOrder,
          ranks,
          currentTurnPlayerId: winnerId ?? action.playerId,
          log: [...nextStateBase.log, {
            id: createId('log'),
            type: 'finish',
            playerId: winnerId ?? action.playerId,
            detail: 'Game finished',
            timestamp: Date.now(),
          }],
          lastUpdate: Date.now(),
        },
      };
    }

    const currentTurnPlayerId = getNextActivePlayerId(nextStateBase, action.playerId);
    return { ok: true, state: { ...nextStateBase, currentTurnPlayerId } };
  }

  // play
  const hand = state.hands[action.playerId] ?? [];
  const card = hand.find(c => c.id === action.cardId);
  if (!card) return { ok: false, error: 'Card not in hand' };
  if (!isCardPlayable(state, card)) return { ok: false, error: 'Card not playable' };

  const remainingHand = sortHand(hand.filter(c => c.id !== action.cardId));
  const hands: Record<string, Card[]> = {};
  for (const [pid, h] of Object.entries(state.hands)) hands[pid] = pid === action.playerId ? remainingHand : [...h];

  const bounds = state.table[card.suit];
  if (!bounds) return { ok: false, error: 'Invalid suit' };
  const nextBounds = { ...bounds };
  if (card.rank === bounds.low - 1) nextBounds.low = bounds.low - 1;
  else if (card.rank === bounds.high + 1) nextBounds.high = bounds.high + 1;
  else return { ok: false, error: 'Card not adjacent' };

  const table = {
    S: { ...state.table.S },
    H: { ...state.table.H },
    D: { ...state.table.D },
    C: { ...state.table.C },
  } as ShichinarabeNetworkState['table'];
  table[card.suit] = nextBounds;

  let finishedOrder = state.finishedOrder;
  if (remainingHand.length === 0 && !finishedOrder.includes(action.playerId)) {
    finishedOrder = [...finishedOrder, action.playerId];
  }

  const logEntries: ShichinarabeLogEntry[] = [{
    id: createId('log'),
    type: 'play',
    playerId: action.playerId,
    card: { suit: card.suit, rank: card.rank },
    timestamp: action.timestamp,
  }];

  // This play may have unblocked a card an eliminated player was still holding.
  const revealed = revealEliminatedCards(hands, table, state.eliminatedOrder);
  for (const r of revealed) {
    logEntries.push({
      id: createId('log'),
      type: 'play',
      playerId: r.playerId,
      card: { suit: r.suit, rank: r.rank },
      detail: 'Revealed on elimination',
      timestamp: action.timestamp,
    });
  }

  const nextStateBase: ShichinarabeNetworkState = {
    ...state,
    hands,
    table,
    finishedOrder,
    log: [...state.log, ...logEntries],
    lastUpdate: Date.now(),
  };

  const doneCount = state.playerOrder.filter(pid => (
    nextStateBase.finishedOrder.includes(pid) || nextStateBase.eliminatedOrder.includes(pid)
  )).length;

  if (doneCount >= state.playerOrder.length) {
    const resultOrder = [
      ...nextStateBase.finishedOrder,
      ...nextStateBase.eliminatedOrder,
      ...state.playerOrder.filter(pid => !nextStateBase.finishedOrder.includes(pid) && !nextStateBase.eliminatedOrder.includes(pid)),
    ];
    const ranks: Record<string, number> = {};
    resultOrder.forEach((pid, idx) => { ranks[pid] = idx + 1; });
    const winnerId = nextStateBase.finishedOrder[0] ?? null;
    return {
      ok: true,
      state: {
        ...nextStateBase,
        finished: true,
        winnerId,
        resultOrder,
        ranks,
        currentTurnPlayerId: winnerId ?? action.playerId,
        log: [...nextStateBase.log, {
          id: createId('log'),
          type: 'finish',
          playerId: winnerId ?? action.playerId,
          detail: 'Game finished',
          timestamp: Date.now(),
        }],
        lastUpdate: Date.now(),
      },
    };
  }

  const currentTurnPlayerId = getNextActivePlayerId(nextStateBase, action.playerId);
  return { ok: true, state: { ...nextStateBase, currentTurnPlayerId } };
}

