import { describe, expect, it } from 'vitest';
import { getShichinarabeHint } from '@/components/game/Shichinarabe/ShichinarabeHint';
import { STRINGS } from '@/components/game/Shichinarabe/i18n';
import type { ShichinarabeNetworkState } from '@/components/game/Shichinarabe/multiplayerTypes';
import type { Card, CardSuit } from '@/components/game/Shichinarabe/types';

function card(suit: CardSuit, rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank };
}

/** `n` cards whose identity must not matter to the hint (only the count is public). */
function concealed(n: number, suit: CardSuit = 'C'): Card[] {
  return Array.from({ length: n }, (_, i) => ({ id: `hidden_${suit}_${i}`, suit, rank: 13 - i }));
}

const SEVENS_ONLY: ShichinarabeNetworkState['table'] = {
  S: { low: 7, high: 7 },
  H: { low: 7, high: 7 },
  D: { low: 7, high: 7 },
  C: { low: 7, high: 7 },
};

function makeState(overrides: Partial<ShichinarabeNetworkState> & { hands: Record<string, Card[]> }): ShichinarabeNetworkState {
  const playerOrder = overrides.playerOrder ?? ['me', 'a', 'b'];
  const passCounts: Record<string, number> = {};
  for (const pid of playerOrder) passCounts[pid] = 0;
  return {
    version: 1,
    playerOrder,
    table: SEVENS_ONLY,
    currentTurnPlayerId: 'me',
    passCounts,
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
    ...overrides,
  };
}

describe('getShichinarabeHint', () => {
  it('gives no hint when it is not the player\'s turn or the game is over', () => {
    const hands = { me: [card('S', 6)], a: concealed(8), b: concealed(8, 'D') };
    expect(getShichinarabeHint(makeState({ hands, currentTurnPlayerId: 'a' }), 'me')).toBeNull();
    expect(getShichinarabeHint(makeState({ hands, finished: true }), 'me')).toBeNull();
  });

  it('says a pass is forced when no card fits', () => {
    const state = makeState({ hands: { me: [card('S', 2), card('H', 12)], a: concealed(8), b: concealed(8, 'D') } });
    expect(getShichinarabeHint(state, 'me')).toEqual({
      action: 'pass', card: null, reason: 'forcedPass', ownCardsBehind: 0,
    });
  });

  it('points at the only legal card', () => {
    const state = makeState({ hands: { me: [card('S', 6), card('H', 12)], a: concealed(8), b: concealed(8, 'D') } });
    const hint = getShichinarabeHint(state, 'me');
    expect(hint).toMatchObject({ action: 'play', reason: 'onlyMove' });
    expect(hint?.card?.id).toBe('S6');
  });

  it('prefers the card that frees the player\'s own run and counts the cards behind it', () => {
    const state = makeState({
      hands: {
        me: [card('S', 6), card('S', 5), card('S', 3), card('H', 8)],
        a: concealed(8),
        b: concealed(8, 'D'),
      },
    });
    const hint = getShichinarabeHint(state, 'me');
    expect(hint?.card?.id).toBe('S6');
    expect(hint?.reason).toBe('unblocksOwn');
    // S5 and S3 lie beyond S6; H8 is another suit.
    expect(hint?.ownCardsBehind).toBe(2);
  });

  it('counts cards on the high side too', () => {
    const state = makeState({
      hands: { me: [card('D', 8), card('D', 9), card('D', 4), card('C', 6)], a: concealed(8), b: concealed(8, 'S') },
    });
    const hint = getShichinarabeHint(state, 'me');
    expect(hint?.card?.id).toBe('D8');
    expect(hint).toMatchObject({ reason: 'unblocksOwn', ownCardsBehind: 1 });
  });

  it('recommends an ace or king that closes a row over a card that opens a slot', () => {
    const state = makeState({
      table: { ...SEVENS_ONLY, S: { low: 2, high: 7 } },
      hands: { me: [card('S', 1), card('H', 8)], a: concealed(8), b: concealed(8, 'D') },
    });
    const hint = getShichinarabeHint(state, 'me');
    expect(hint?.card?.id).toBe('S1');
    expect(hint).toMatchObject({ action: 'play', reason: 'deadEnd', ownCardsBehind: 0 });
  });

  it('admits when the suggested play may help an opponent', () => {
    const state = makeState({ hands: { me: [card('H', 8), card('D', 6)], a: concealed(8), b: concealed(8, 'S') } });
    const hint = getShichinarabeHint(state, 'me');
    expect(hint).toMatchObject({ action: 'play', reason: 'leastHarm', ownCardsBehind: 0 });
    expect(['H8', 'D6']).toContain(hint?.card?.id);
  });

  it('suggests holding back when every card would feed a rival who is about to go out', () => {
    const state = makeState({
      hands: {
        me: [card('S', 8), card('H', 8), card('D', 8), card('C', 8)],
        a: concealed(1),
        b: concealed(1, 'D'),
      },
    });
    expect(getShichinarabeHint(state, 'me')).toEqual({
      action: 'pass', card: null, reason: 'hold', ownCardsBehind: 0,
    });
  });

  it('never suggests a voluntary pass that would leave the player one pass from elimination', () => {
    const state = makeState({
      hands: {
        me: [card('S', 8), card('H', 8), card('D', 8), card('C', 8)],
        a: concealed(1),
        b: concealed(1, 'D'),
      },
      passCounts: { me: 1, a: 0, b: 0 },
    });
    expect(getShichinarabeHint(state, 'me')?.action).toBe('play');
  });

  it('depends only on public information, not on which cards opponents really hold', () => {
    const me = [card('H', 8), card('D', 6), card('S', 6), card('S', 4)];
    const one = makeState({ hands: { me, a: [card('H', 9), card('D', 5), card('S', 5)], b: concealed(5) } });
    const other = makeState({
      hands: { me, a: concealed(3, 'C'), b: [card('H', 9), card('D', 5), card('S', 5), card('C', 1), card('C', 2)] },
    });
    expect(getShichinarabeHint(one, 'me')).toEqual(getShichinarabeHint(other, 'me'));
  });

  it('is deterministic', () => {
    const state = makeState({
      hands: { me: [card('H', 8), card('D', 6), card('C', 6), card('C', 8)], a: concealed(8, 'S'), b: concealed(8, 'D') },
    });
    const first = getShichinarabeHint(state, 'me');
    for (let i = 0; i < 10; i++) expect(getShichinarabeHint(state, 'me')).toEqual(first);
  });
});

describe('hint strings', () => {
  it('explains every reason in both languages', () => {
    const reasons = Object.keys(STRINGS.en.hintReasons).sort();
    expect(Object.keys(STRINGS.ja.hintReasons).sort()).toEqual(reasons);
    for (const lang of ['en', 'ja'] as const) {
      for (const text of Object.values(STRINGS[lang].hintReasons)) {
        expect(text(2).length).toBeGreaterThan(0);
      }
      expect(STRINGS[lang].hintPlay('6♠')).toContain('6♠');
    }
    expect(STRINGS.en.hintReasons.unblocksOwn(1)).toContain('1 more of your own card ');
    expect(STRINGS.en.hintReasons.unblocksOwn(3)).toContain('3 more of your own cards');
  });
});
