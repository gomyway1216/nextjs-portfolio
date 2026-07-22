import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createInitialShichinarabeState,
  dealHands,
  getNextPlayerId,
  getPlayableCardsForPlayer,
  getPlayableRanksForSuit,
  isCardPlayable,
  redistributeEliminatedHand,
  sortHand,
} from '@/components/game/Shichinarabe/gameLogic';
import { decideShichinarabeAction } from '@/components/game/Shichinarabe/ShichinarabeAI';
import type { ShichinarabeNetworkState } from '@/components/game/Shichinarabe/multiplayerTypes';
import type { Card } from '@/components/game/Shichinarabe/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function stateForHand(hand: Card[]): ShichinarabeNetworkState {
  return {
    version: 1,
    playerOrder: ['p1', 'p2'],
    hands: { p1: hand, p2: [] },
    table: {
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    },
    currentTurnPlayerId: 'p1',
    passCounts: { p1: 0, p2: 0 },
    maxPasses: 3,
    finishedOrder: [],
    eliminatedOrder: [],
    finished: false,
    winnerId: null,
    resultOrder: [],
    ranks: null,
    startedAt: 1,
    log: [],
    lastUpdate: 1,
  };
}

describe('Shichinarabe gameLogic', () => {
  it('creates and sorts a standard 52-card deck', () => {
    const deck = createDeck({ deckId: 'd' });

    expect(deck).toHaveLength(52);
    expect(Object.values(dealHands(deck, ['p1', 'p2'])).map((hand) => hand.length)).toEqual([26, 26]);
    expect(sortHand([card('c', 'C', 8), card('s', 'S', 6), card('h', 'H', 6)]))
      .toEqual([card('s', 'S', 6), card('h', 'H', 6), card('c', 'C', 8)]);
    expect(getNextPlayerId(['p1', 'p2'], 'p2')).toBe('p1');
    expect(getNextPlayerId(['p1'], 'missing')).toBe('p1');
  });

  it('creates an initial state with sevens placed on the table', () => {
    const state = createInitialShichinarabeState(['p1', 'p2'], { maxPasses: 2.9 });

    expect(state.maxPasses).toBe(2);
    expect(state.currentTurnPlayerId).toBe('p1');
    expect(state.table).toEqual({
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    });
    expect(Object.values(state.hands).flat().some((c) => c.rank === 7)).toBe(false);
  });

  it('finds playable ranks and cards around suit bounds', () => {
    const state = stateForHand([card('s6', 'S', 6), card('s5', 'S', 5), card('h8', 'H', 8)]);

    expect(getPlayableRanksForSuit({ low: 7, high: 7 })).toEqual([6, 8]);
    expect(isCardPlayable(state, card('s6', 'S', 6))).toBe(true);
    expect(isCardPlayable(state, card('s5', 'S', 5))).toBe(false);
    expect(getPlayableCardsForPlayer(state, 'p1').map((c) => c.id)).toEqual(['s6', 'h8']);
    expect(getPlayableCardsForPlayer({ ...state, finished: true }, 'p1')).toEqual([]);
    expect(getPlayableCardsForPlayer({ ...state, finishedOrder: ['p1'] }, 'p1')).toEqual([]);
  });

  it('applies a legal play and advances the suit bounds', () => {
    const state = stateForHand([card('s6', 'S', 6)]);
    const result = applyAction(state, {
      actionId: 'a1',
      type: 'play',
      playerId: 'p1',
      cardId: 's6',
      timestamp: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.table.S).toEqual({ low: 6, high: 7 });
      expect(result.state.finishedOrder).toContain('p1');
    }
  });

  it('finishes the game when a play leaves every player done', () => {
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      eliminatedOrder: ['p2'],
    };

    const result = applyAction(state, {
      actionId: 'a1',
      type: 'play',
      playerId: 'p1',
      cardId: 's6',
      timestamp: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.finished).toBe(true);
      expect(result.state.winnerId).toBe('p1');
      expect(result.state.resultOrder).toEqual(['p1', 'p2']);
      expect(result.state.ranks).toEqual({ p1: 1, p2: 2 });
    }
  });

  it('passes, eliminates at the pass limit, and skips done players', () => {
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      maxPasses: 1,
      hands: { p1: [card('s6', 'S', 6)], p2: [card('h6', 'H', 6)] },
    };

    const result = applyAction(state, {
      actionId: 'p1',
      type: 'pass',
      playerId: 'p1',
      timestamp: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.eliminatedOrder).toEqual(['p1']);
      expect(result.state.currentTurnPlayerId).toBe('p2');
      expect(result.state.passCounts.p1).toBe(1);
    }
  });

  it('finishes the game when a pass leaves every player done', () => {
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      maxPasses: 1,
      eliminatedOrder: ['p2'],
    };

    const result = applyAction(state, {
      actionId: 'p1',
      type: 'pass',
      playerId: 'p1',
      timestamp: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.finished).toBe(true);
      expect(result.state.winnerId).toBeNull();
      // p1 survived longer than the already-eliminated p2, so p1 ranks better.
      expect(result.state.resultOrder).toEqual(['p1', 'p2']);
      expect(result.state.ranks).toEqual({ p1: 1, p2: 2 });
    }
  });

  it('ranks later eliminations above earlier ones (pass path)', () => {
    // p2 was eliminated first; p1 survives longer before passing out at the
    // limit, so p1 must outrank p2 among the eliminated. p3 already finished.
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      playerOrder: ['p1', 'p2', 'p3'],
      maxPasses: 1,
      finishedOrder: ['p3'],
      eliminatedOrder: ['p2'],
      hands: { p1: [card('s6', 'S', 6)], p2: [], p3: [] },
      passCounts: { p1: 0, p2: 1, p3: 0 },
    };

    const result = applyAction(state, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p1',
      timestamp: 30,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.eliminatedOrder).toEqual(['p2', 'p1']);
      expect(result.state.resultOrder).toEqual(['p3', 'p1', 'p2']);
      expect(result.state.ranks).toEqual({ p3: 1, p1: 2, p2: 3 });
    }
  });

  it('ranks later eliminations above earlier ones (play path)', () => {
    // p2 then p3 were eliminated; p1's final play ends the game. p3 survived
    // longer than p2 and must rank above it.
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      playerOrder: ['p1', 'p2', 'p3'],
      eliminatedOrder: ['p2', 'p3'],
      hands: { p1: [card('s6', 'S', 6)], p2: [], p3: [] },
      passCounts: { p1: 0, p2: 3, p3: 3 },
    };

    const result = applyAction(state, {
      actionId: 'x',
      type: 'play',
      playerId: 'p1',
      cardId: 's6',
      timestamp: 30,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.resultOrder).toEqual(['p1', 'p3', 'p2']);
      expect(result.state.ranks).toEqual({ p1: 1, p3: 2, p2: 3 });
    }
  });

  it('rejects invalid plays and inactive players', () => {
    const state = stateForHand([card('s5', 'S', 5)]);

    expect(applyAction({ ...state, finished: true }, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p1',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Game is finished' });
    expect(applyAction(state, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p2',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Not your turn' });
    expect(applyAction({ ...state, finishedOrder: ['p1'] }, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p1',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Player is not active' });
    expect(applyAction(state, {
      actionId: 'x',
      type: 'play',
      playerId: 'p1',
      cardId: 'missing',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Card not in hand' });
    expect(applyAction(state, {
      actionId: 'x',
      type: 'play',
      playerId: 'p1',
      cardId: 's5',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Card not playable' });
  });
});

describe('Shichinarabe elimination redistribution', () => {
  it('places all adjacent cards of an eliminated hand onto the table, iterating outward', () => {
    const hands = {
      dead: [card('s6', 'S', 6), card('s5', 'S', 5), card('s4', 'S', 4), card('h8', 'H', 8)],
    };
    const table = {
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    };

    const placed = redistributeEliminatedHand(hands, table, 'dead');

    // S6 -> S5 -> S4 chain plus H8 all become playable in sequence.
    expect(table.S).toEqual({ low: 4, high: 7 });
    expect(table.H).toEqual({ low: 7, high: 8 });
    expect(hands.dead).toHaveLength(0);
    expect(placed).toContainEqual({ suit: 'S', rank: 6 });
    expect(placed).toContainEqual({ suit: 'S', rank: 4 });
    expect(placed).toContainEqual({ suit: 'H', rank: 8 });
  });

  it('leaves a card in hand when its neighbour toward 7 is still missing (gap held elsewhere)', () => {
    const hands = {
      dead: [card('s5', 'S', 5)], // 6 is missing, so 5 cannot connect yet
    };
    const table = {
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    };

    const placed = redistributeEliminatedHand(hands, table, 'dead');

    expect(placed).toHaveLength(0);
    expect(table.S).toEqual({ low: 7, high: 7 });
    expect(hands.dead.map((c) => c.id)).toEqual(['s5']);
  });

  it('reveals the eliminated hand through applyAction and logs the placements', () => {
    const base = stateForHand([card('s6', 'S', 6)]);
    const state: ShichinarabeNetworkState = {
      ...base,
      playerOrder: ['p1', 'p2'],
      currentTurnPlayerId: 'p2',
      maxPasses: 1,
      passCounts: { p1: 0, p2: 0 },
      hands: {
        p1: [card('s6', 'S', 6)],
        p2: [card('h8', 'H', 8), card('h9', 'H', 9)],
      },
    };

    const result = applyAction(state, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p2',
      timestamp: 5,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.eliminatedOrder).toEqual(['p2']);
      // p2's H8 then H9 are revealed onto the table.
      expect(result.state.table.H).toEqual({ low: 7, high: 9 });
      expect(result.state.hands.p2).toHaveLength(0);
      const revealed = result.state.log.filter((e) => e.detail === 'Revealed on elimination');
      expect(revealed).toHaveLength(2);
      // Turn passes to the next active player (p1).
      expect(result.state.currentTurnPlayerId).toBe('p1');
    }
  });

  it('flushes a gap-held eliminated card once an active player later plays its neighbour', () => {
    // p2 is already eliminated holding S5, but S6 was still with an active player at
    // elimination time, so S5 stayed in p2's hand (a gap). When p1 plays S6, S5 must
    // now be revealed onto the table — otherwise the spade run stays blocked forever.
    const base = stateForHand([card('s6', 'S', 6)]);
    const state: ShichinarabeNetworkState = {
      ...base,
      playerOrder: ['p1', 'p2', 'p3'],
      currentTurnPlayerId: 'p1',
      maxPasses: 3,
      passCounts: { p1: 0, p2: 3, p3: 0 },
      eliminatedOrder: ['p2'],
      hands: {
        p1: [card('s6', 'S', 6)],
        p2: [card('s5', 'S', 5)], // gap-held: needs S6 first
        p3: [card('h9', 'H', 9)],
      },
    };

    const result = applyAction(state, {
      actionId: 'a1',
      type: 'play',
      playerId: 'p1',
      cardId: 's6',
      timestamp: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // S6 (by p1) then S5 (revealed from p2) both land, so low reaches 5.
      expect(result.state.table.S).toEqual({ low: 5, high: 7 });
      expect(result.state.hands.p2).toHaveLength(0);
      const revealed = result.state.log.filter((e) => e.detail === 'Revealed on elimination');
      expect(revealed).toHaveLength(1);
      expect(revealed[0]?.card).toEqual({ suit: 'S', rank: 5 });
    }
  });
});

describe('Shichinarabe AI difficulty tiers', () => {
  function multiState(hands: Record<string, Card[]>, table = {
    S: { low: 7, high: 7 },
    H: { low: 7, high: 7 },
    D: { low: 7, high: 7 },
    C: { low: 7, high: 7 },
  }): ShichinarabeNetworkState {
    return {
      version: 1,
      playerOrder: Object.keys(hands),
      hands,
      table,
      currentTurnPlayerId: Object.keys(hands)[0]!,
      passCounts: Object.fromEntries(Object.keys(hands).map((k) => [k, 0])),
      maxPasses: 3,
      finishedOrder: [],
      eliminatedOrder: [],
      finished: false,
      winnerId: null,
      resultOrder: [],
      ranks: null,
      startedAt: 1,
      log: [],
      lastUpdate: 1,
    };
  }

  it('always plays a legal card when only one legal move exists (any tier)', () => {
    const state = multiState({ ai: [card('s6', 'S', 6)], other: [card('h8', 'H', 8)] });
    for (const d of ['easy', 'medium', 'hard', 'expert', 'master'] as const) {
      const decision = decideShichinarabeAction(state, 'ai', d);
      expect(decision).toEqual({ type: 'play', cardId: 's6' });
    }
  });

  it('passes when it has no legal move', () => {
    const state = multiState({ ai: [card('s5', 'S', 5)], other: [card('h8', 'H', 8)] });
    expect(decideShichinarabeAction(state, 'ai', 'master')).toEqual({ type: 'pass' });
  });

  it('never decides for a player when it is not their turn', () => {
    const state = multiState({ ai: [card('s6', 'S', 6)], other: [card('h8', 'H', 8)] });
    expect(decideShichinarabeAction(state, 'other', 'hard')).toEqual({ type: 'pass' });
  });

  it('hard tier prefers extending its own chain over an isolated card', () => {
    // S6 unblocks the AI's own S5,S4; C8 is isolated. Expect it to play S6.
    const state = multiState({
      ai: [card('s6', 'S', 6), card('s5', 'S', 5), card('s4', 'S', 4), card('c8', 'C', 8)],
      other: [card('h8', 'H', 8)],
    });
    const decision = decideShichinarabeAction(state, 'ai', 'hard');
    expect(decision).toEqual({ type: 'play', cardId: 's6' });
  });

  it('expert may strategically pass to hold a key blocking card', () => {
    // The AI's only legal card is S6. From PUBLIC information alone the expert
    // can tell that S5 is certainly in an active opponent's hand (every unseen
    // card is), that both opponents are one card from going out, and that the
    // corridor below S5 is ungated — so playing S6 likely hands a near-winner
    // the game while extending nothing of its own. An expert holds it back.
    const state = multiState({
      ai: [card('s6', 'S', 6), card('c2', 'C', 2), card('c3', 'C', 3), card('c4', 'C', 4), card('c5', 'C', 5)],
      opp1: [card('s5', 'S', 5)],
      opp2: [card('h8', 'H', 8)],
    });
    const decision = decideShichinarabeAction(state, 'ai', 'expert');
    expect(decision).toEqual({ type: 'pass' });
  });

  it('never spends a strategic pass that would leave only the fatal last pass', () => {
    // Same blocking pressure as the strategic-pass case, but the AI has already
    // used one of its three passes. Elimination fires when passCount REACHES
    // maxPasses, so a voluntary pass here would leave exactly one — and the next
    // forced pass would eliminate it. Expert and master must play instead.
    const base = multiState({
      ai: [card('s6', 'S', 6), card('c2', 'C', 2), card('c3', 'C', 3), card('c4', 'C', 4), card('c5', 'C', 5)],
      opp1: [card('s5a', 'S', 5)],
      opp2: [card('s5b', 'S', 5)],
    });
    const state = { ...base, passCounts: { ...base.passCounts, ai: 1 } };
    for (const d of ['expert', 'master'] as const) {
      expect(decideShichinarabeAction(state, 'ai', d).type).toBe('play');
    }
  });

  it('expert plays instead of blocking when it is close to going out', () => {
    // Same blocking pressure, but the AI has few cards left — racing beats blocking.
    const state = multiState({
      ai: [card('s6', 'S', 6), card('c8', 'C', 8)],
      opp1: [card('s5a', 'S', 5)],
      opp2: [card('s5b', 'S', 5)],
    });
    const decision = decideShichinarabeAction(state, 'ai', 'expert');
    expect(decision.type).toBe('play');
  });
});
