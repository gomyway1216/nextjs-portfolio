import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createInitialDaifugoState,
  DAIFUGO_PLAY_ERROR_CODES,
  dealHands,
  getPlayShape,
  sortHand,
} from '@/components/game/Daifugo/gameLogic';
import { daifugoErrorMessage, formatDaifugoLogCards } from '@/components/game/Daifugo/errorMessages';
import { JOKER_RANK, TWO_RANK, type Card } from '@/components/game/Daifugo/types';
import type { DaifugoNetworkState, DaifugoPile } from '@/components/game/Daifugo/multiplayerTypes';
import enCommon from '@/locales/en/common.json';
import jaCommon from '@/locales/ja/common.json';

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
      expect(res).toMatchObject({ ok: false, error: { code: 'tooLow' } });
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
      expect(res).toMatchObject({ ok: false, error: { code: 'needCount', count: 2 } });
    });

    it('rejects playing out of turn', () => {
      const state = makeState({ hands: { p1: [card('a', 'S', 5)], p2: [card('b', 'H', 6)] }, currentTurnPlayerId: 'p1' });
      const res = play(state, 'p2', [card('b', 'H', 6)]);
      expect(res).toMatchObject({ ok: false, error: { code: 'notYourTurn' } });
    });

    it('forbids passing on an empty table', () => {
      const state = makeState({ hands: { p1: [card('a', 'S', 5)], p2: [] }, pile: null });
      const res = applyAction(state, { actionId: 't', type: 'pass', playerId: 'p1', timestamp: 0 });
      expect(res).toMatchObject({ ok: false, error: { code: 'cannotPassEmpty' } });
    });

    it('rejects an invalid combination and cards not in hand with codes', () => {
      const state = makeState({ hands: { p1: [card('s4', 'S', 4), card('h5', 'H', 5)], p2: [card('z', 'D', 9)] } });
      expect(play(state, 'p1', [card('s4', 'S', 4), card('h5', 'H', 5)]))
        .toMatchObject({ ok: false, error: { code: 'invalidCombination' } });
      expect(play(state, 'p1', [card('ghost', 'S', 6)]))
        .toMatchObject({ ok: false, error: { code: 'cardNotInHand' } });
    });

    it('reports gekishiba violations with the expected rank', () => {
      const pile: DaifugoPile = {
        kind: 'group', cards: [card('s6', 'S', 6)], count: 1, rankKey: 6, signature: 'S', playedBy: 'p2',
      };
      const state = makeState({
        hands: { p1: [card('s9', 'S', 9), card('joker', 'J', JOKER_RANK)], p2: [card('z', 'D', 4)] },
        pile,
        lastPlayedBy: 'p2',
        lockSignature: 'S',
        gekishibaNextRank: 7,
      });
      expect(play(state, 'p1', [card('s9', 'S', 9)]))
        .toMatchObject({ ok: false, error: { code: 'gekishibaRankOnly', rank: 7 } });
      expect(play(state, 'p1', [card('joker', 'J', JOKER_RANK)]))
        .toMatchObject({ ok: false, error: { code: 'gekishibaNoJoker' } });
    });
  });

  describe('error localization', () => {
    type ErrorsDict = Record<string, string>;
    const enErrors = (enCommon as { games: { daifugo: { ui: { errors: ErrorsDict } } } }).games.daifugo.ui.errors;
    const jaErrors = (jaCommon as { games: { daifugo: { ui: { errors: ErrorsDict } } } }).games.daifugo.ui.errors;

    it('has an en and ja message for every validator error code', () => {
      for (const code of DAIFUGO_PLAY_ERROR_CODES) {
        expect(enErrors[code], `en games.daifugo.ui.errors.${code}`).toBeTruthy();
        expect(jaErrors[code], `ja games.daifugo.ui.errors.${code}`).toBeTruthy();
      }
    });

    it('keeps interpolation placeholders in parameterized messages', () => {
      for (const errors of [enErrors, jaErrors]) {
        expect(errors.needCount).toContain('{{count}}');
        expect(errors.selectGiveCount).toContain('{{count}}');
        expect(errors.gekishibaRankOnly).toContain('{{rank}}');
      }
    });

    it('daifugoErrorMessage resolves keys and params', () => {
      const seen: Array<{ key: string; params?: Record<string, unknown> }> = [];
      const translate = (key: string, params?: Record<string, unknown>) => {
        seen.push({ key, params });
        return key;
      };

      expect(daifugoErrorMessage(translate, { code: 'tooLow' })).toBe('games.daifugo.ui.errors.tooLow');
      expect(daifugoErrorMessage(translate, { code: 'needCount', count: 3 })).toBe('games.daifugo.ui.errors.needCount');
      expect(seen[1]?.params).toEqual({ count: 3 });
      // Ranks are shown as card labels (J/Q/K/A/2), not raw numbers.
      daifugoErrorMessage(translate, { code: 'gekishibaRankOnly', rank: 13 });
      expect(seen[2]?.params).toEqual({ rank: 'K' });
    });
  });

  describe('play log formatting', () => {
    type UiDict = { games: { daifugo: { ui: { logPlayed: string; logStraight: string } } } };
    const enUi = (enCommon as UiDict).games.daifugo.ui;
    const jaUi = (jaCommon as UiDict).games.daifugo.ui;

    const interpolate = (template: string, params: Record<string, string | number>) =>
      template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(params[k] ?? ''));

    it('renders group plays as suit+rank card labels', () => {
      const entry = {
        id: 'l1', type: 'play' as const, playerId: 'ai2', playKind: 'group' as const,
        cardCount: 2, rankKey: 4, signature: 'DS', timestamp: 0,
      };
      expect(formatDaifugoLogCards(entry)).toBe('♦4♠4');

      const cards = formatDaifugoLogCards(entry);
      expect(interpolate(jaUi.logPlayed, { cards, count: 2 })).toBe('♦4♠4 を2枚出した');
      expect(interpolate(enUi.logPlayed, { cards, count: 2 })).toBe('played ♦4♠4');
    });

    it('renders straights as a suit-labeled range', () => {
      const entry = {
        id: 'l2', type: 'play' as const, playerId: 'p1', playKind: 'straight' as const,
        cardCount: 3, rankKey: 5, signature: 'SSS', timestamp: 0,
      };
      expect(formatDaifugoLogCards(entry)).toBe('♠3-♠5');
      expect(interpolate(jaUi.logStraight, { cards: '♠3-♠5', count: 3 })).toBe('♠3-♠5 の階段を出した');
      expect(interpolate(enUi.logStraight, { cards: '♠3-♠5', count: 3 })).toBe('played a straight ♠3-♠5');
    });

    it('renders a single joker with the joker symbol', () => {
      const entry = {
        id: 'l3', type: 'play' as const, playerId: 'p1', playKind: 'group' as const,
        cardCount: 1, rankKey: JOKER_RANK, signature: null, timestamp: 0,
      };
      expect(formatDaifugoLogCards(entry)).toBe('🃏');
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
