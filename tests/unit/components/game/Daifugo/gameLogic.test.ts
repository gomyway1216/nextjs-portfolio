import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createInitialDaifugoState,
  dealHands,
  getPlayShape,
  sortHand,
} from '@/components/game/Daifugo/gameLogic';
import { JOKER_RANK, TWO_RANK, type Card } from '@/components/game/Daifugo/types';
import type { DaifugoNetworkState, DaifugoPile } from '@/components/game/Daifugo/multiplayerTypes';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

/** Build a minimal 2-player state with fully-controlled hands + pile. */
function makeState(overrides: Partial<DaifugoNetworkState> = {}): DaifugoNetworkState {
  const base = createInitialDaifugoState(['p1', 'p2']);
  return {
    ...base,
    hands: { p1: [], p2: [] },
    pile: null,
    passes: [],
    lastPlayedBy: null,
    currentTurnPlayerId: 'p1',
    ...overrides,
  };
}

function play(state: DaifugoNetworkState, playerId: string, cards: Card[]) {
  return applyAction(state, {
    actionId: 't',
    type: 'play',
    playerId,
    cardIds: cards.map((c) => c.id),
    timestamp: 0,
  });
}

describe('Daifugo gameLogic', () => {
  it('creates a standard deck with optional joker', () => {
    expect(createDeck({ deckId: 'd' })).toHaveLength(53);
    expect(createDeck({ deckId: 'd', includeJoker: false })).toHaveLength(52);
  });

  it('sorts by rank before suit and deals all cards', () => {
    const sorted = sortHand([
      card('joker', 'J', JOKER_RANK),
      card('two', 'S', TWO_RANK),
      card('heart3', 'H', 3),
      card('spade3', 'S', 3),
    ]);

    expect(sorted.map((c) => c.id)).toEqual(['spade3', 'heart3', 'two', 'joker']);
    expect(Object.values(dealHands(createDeck({ deckId: 'd' }), ['p1', 'p2'])).flat()).toHaveLength(53);
  });

  it('detects group, straight, joker, and invalid play shapes', () => {
    expect(getPlayShape([card('s3', 'S', 3)])).toMatchObject({
      kind: 'group',
      count: 1,
      isSpade3Single: true,
    });

    expect(getPlayShape([card('joker', 'J', JOKER_RANK)])).toMatchObject({
      kind: 'group',
      rankKey: JOKER_RANK,
      isJokerSingle: true,
    });

    expect(getPlayShape([
      card('s4', 'S', 4),
      card('s5', 'S', 5),
      card('s6', 'S', 6),
    ])).toMatchObject({
      kind: 'straight',
      startRank: 4,
      endRank: 6,
      signature: 'SSS',
    });

    // Mixed-suit two cards is not a valid combination.
    expect(getPlayShape([card('s4', 'S', 4), card('h5', 'H', 5)])).toBeNull();
    // A "straight" of only 2 cards is invalid (needs 3+).
    expect(getPlayShape([card('s4', 'S', 4), card('s5', 'S', 5)])).toBeNull();
    // Same-suit but non-consecutive is not a straight.
    expect(getPlayShape([card('s4', 'S', 4), card('s6', 'S', 6), card('s8', 'S', 8)])).toBeNull();
  });

  describe('legal-move validation', () => {
    it('rejects a play that does not beat the pile', () => {
      const pile: DaifugoPile = {
        kind: 'group', cards: [card('h9', 'H', 9)], count: 1, rankKey: 9, signature: 'H', playedBy: 'p2',
      };
      const state = makeState({ hands: { p1: [card('s5', 'S', 5)], p2: [] }, pile, lastPlayedBy: 'p2' });
      const res = play(state, 'p1', [card('s5', 'S', 5)]);
      expect(res.ok).toBe(false);
    });

    it('accepts a play that beats the pile', () => {
      const pile: DaifugoPile = {
        kind: 'group', cards: [card('h9', 'H', 9)], count: 1, rankKey: 9, signature: 'H', playedBy: 'p2',
      };
      const state = makeState({ hands: { p1: [card('sk', 'S', 13)], p2: [card('x', 'D', 4)] }, pile, lastPlayedBy: 'p2' });
      const res = play(state, 'p1', [card('sk', 'S', 13)]);
      expect(res.ok).toBe(true);
    });

    it('requires matching card count', () => {
      const pile: DaifugoPile = {
        kind: 'group', cards: [card('h9', 'H', 9), card('c9', 'C', 9)], count: 2, rankKey: 9, signature: 'CH', playedBy: 'p2',
      };
      const state = makeState({ hands: { p1: [card('sk', 'S', 13)], p2: [] }, pile, lastPlayedBy: 'p2' });
      const res = play(state, 'p1', [card('sk', 'S', 13)]);
      expect(res.ok).toBe(false);
    });

    it('rejects playing out of turn', () => {
      const state = makeState({ hands: { p1: [card('a', 'S', 5)], p2: [card('b', 'H', 6)] }, currentTurnPlayerId: 'p1' });
      const res = play(state, 'p2', [card('b', 'H', 6)]);
      expect(res.ok).toBe(false);
    });

    it('forbids passing on an empty table', () => {
      const state = makeState({ hands: { p1: [card('a', 'S', 5)], p2: [] }, pile: null });
      const res = applyAction(state, { actionId: 't', type: 'pass', playerId: 'p1', timestamp: 0 });
      expect(res.ok).toBe(false);
    });
  });

  describe('革命 (revolution)', () => {
    it('toggles on a four-of-a-kind and flips rank comparison', () => {
      const quad = [card('a', 'S', 5), card('b', 'H', 5), card('c', 'D', 5), card('d', 'C', 5)];
      const state = makeState({ hands: { p1: [...quad, card('e', 'S', 6)], p2: [card('z', 'H', 7)] } });
      const res = play(state, 'p1', quad);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.state.revolution).toBe(true);

      // Under revolution, a lower rank now beats a higher rank on the pile.
      // Pile is the 5-quad; count must match (4). Set up a fresh single compare instead:
      const s2 = makeState({
        revolution: true,
        hands: { p1: [card('low', 'S', 4)], p2: [] },
        pile: { kind: 'group', cards: [card('hi', 'H', 12)], count: 1, rankKey: 12, signature: 'H', playedBy: 'p2' },
        lastPlayedBy: 'p2',
      });
      // low 4 beats 12 when reversed
      const r = play(s2, 'p1', [card('low', 'S', 4)]);
      expect(r.ok).toBe(true);
    });
  });

  describe('8切り (eight-cut)', () => {
    it('clears the table after an 8 is played', () => {
      const state = makeState({
        hands: { p1: [card('e8', 'S', 8), card('k', 'S', 13)], p2: [card('z', 'H', 9)] },
        pile: null,
        currentTurnPlayerId: 'p1',
      });
      const res = play(state, 'p1', [card('e8', 'S', 8)]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // Table is cleared and the player who cut leads again.
      expect(res.state.pile).toBeNull();
      expect(res.state.currentTurnPlayerId).toBe('p1');
    });
  });

  describe('multi-round card exchange', () => {
    it('daihinmin gives its strongest cards to daifugo', () => {
      const previousRanks = { p1: 'daifugo' as const, p2: 'daihinmin' as const };
      const state = createInitialDaifugoState(['p1', 'p2'], { round: 2, previousRanks });
      // Every card is dealt; exchange keeps hand sizes stable.
      expect(state.hands.p1!.length + state.hands.p2!.length).toBe(53);
      // The daihinmin (p2) should not hold the two strongest cards it was dealt
      // simultaneously — daifugo (p1) receives its two best. We assert the top
      // card overall is not guaranteed to p2 (it flowed to p1 during exchange).
      const p1Strength = Math.max(...state.hands.p1!.map((c) => (c.suit === 'J' ? 99 : c.rank)));
      const p2Strength = Math.max(...state.hands.p2!.map((c) => (c.suit === 'J' ? 99 : c.rank)));
      expect(p1Strength).toBeGreaterThanOrEqual(p2Strength);
    });
  });
});
