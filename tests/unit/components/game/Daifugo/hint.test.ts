import { describe, expect, it } from 'vitest';
import { applyAction, createInitialDaifugoState } from '@/components/game/Daifugo/gameLogic';
import { decideDaifugoAction, hasLegalDaifugoPlay } from '@/components/game/Daifugo/DaifugoAI';
import { getDaifugoHint } from '@/components/game/Daifugo/hint';
import type { Card } from '@/components/game/Daifugo/types';
import type { DaifugoNetworkState, DaifugoPile } from '@/components/game/Daifugo/multiplayerTypes';
import en from '@/locales/en/common.json';
import ja from '@/locales/ja/common.json';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function baseState(overrides: Partial<DaifugoNetworkState> = {}): DaifugoNetworkState {
  const s = createInitialDaifugoState(['p1', 'p2', 'p3']);
  return {
    ...s,
    hands: { p1: [], p2: [], p3: [] },
    pile: null,
    passes: [],
    lastPlayedBy: null,
    currentTurnPlayerId: 'p1',
    log: [],
    ...overrides,
  };
}

function singlePile(c: Card, playedBy = 'p2'): DaifugoPile {
  return { kind: 'group', cards: [c], count: 1, rankKey: c.rank, signature: c.suit, playedBy };
}

const filler = (prefix: string, n: number): Card[] =>
  Array.from({ length: n }, (_, i) => card(`${prefix}${i}`, 'C', 4 + i));

describe('getDaifugoHint', () => {
  it('returns null when it is not the player’s turn or the round is over', () => {
    const state = baseState({
      hands: { p1: [card('a', 'S', 5)], p2: filler('x', 5), p3: filler('y', 5) },
      currentTurnPlayerId: 'p2',
    });
    expect(getDaifugoHint(state, 'p1')).toBeNull();
    expect(getDaifugoHint({ ...state, currentTurnPlayerId: 'p1', finished: true }, 'p1')).toBeNull();
  });

  it('suggests the finishing play and labels it as a finish', () => {
    const state = baseState({
      hands: { p1: [card('a', 'S', 5), card('b', 'H', 5)], p2: filler('x', 5), p3: filler('y', 5) },
    });
    const hint = getDaifugoHint(state, 'p1');
    expect(hint).toMatchObject({ type: 'play', reason: 'finish' });
    if (hint?.type !== 'play') throw new Error('expected a play');
    expect(hint.cards.map(c => c.id).sort()).toEqual(['a', 'b']);
  });

  it('warns about the penalty instead of promising the lead when a lone 8 is the last card', () => {
    const state = baseState({
      hands: { p1: [card('eight', 'S', 8)], p2: filler('x', 5), p3: filler('y', 5) },
    });
    const hint = getDaifugoHint(state, 'p1');
    expect(hint).toMatchObject({ type: 'play', reason: 'forbiddenFinish' });

    const result = applyAction(state, {
      actionId: 't', type: 'play', playerId: 'p1', cardIds: ['eight'], timestamp: 0,
    });
    if (!result.ok) throw new Error('expected the engine to accept the play');
    expect(result.state.forbiddenFinishers).toContain('p1');
    expect(result.state.currentTurnPlayerId).not.toBe('p1');
  });

  it('labels a lead on an empty table', () => {
    const state = baseState({
      hands: {
        p1: [card('a', 'S', 4), card('b', 'H', 6), card('c', 'D', 9), card('d', 'C', 12), card('e', 'H', 14)],
        p2: filler('x', 6),
        p3: filler('y', 6),
      },
    });
    const hint = getDaifugoHint(state, 'p1');
    expect(hint).toMatchObject({ type: 'play', reason: 'lead' });
  });

  it('labels a response that beats the table', () => {
    const state = baseState({
      hands: {
        p1: [card('a', 'S', 6), card('b', 'H', 9), card('c', 'D', 12), card('d', 'C', 13)],
        p2: filler('x', 6),
        p3: filler('y', 6),
      },
      pile: singlePile(card('p', 'D', 4)),
      lastPlayedBy: 'p2',
    });
    const hint = getDaifugoHint(state, 'p1');
    expect(hint).toMatchObject({ type: 'play', reason: 'beat' });
  });

  it('says there is no legal play when nothing beats the table', () => {
    const state = baseState({
      hands: {
        p1: [card('a', 'S', 4), card('b', 'H', 5), card('c', 'D', 6)],
        p2: filler('x', 6),
        p3: filler('y', 6),
      },
      pile: singlePile(card('p', 'D', 14)),
      lastPlayedBy: 'p2',
    });
    expect(hasLegalDaifugoPlay(state, 'p1')).toBe(false);
    expect(getDaifugoHint(state, 'p1')).toEqual({ type: 'pass', reason: 'noLegalPlay' });
  });

  it('explains a voluntary pass as holding cards back', () => {
    const state = baseState({
      hands: {
        // Only the 2 beats an ace; with a big hand and no opponent near out, it is saved.
        p1: [
          card('two', 'H', 15), card('a', 'D', 4), card('b', 'C', 5), card('c', 'H', 6),
          card('d', 'D', 9), card('e', 'C', 10), card('f', 'H', 12),
        ],
        p2: filler('x', 7),
        p3: filler('y', 7),
      },
      pile: singlePile(card('p', 'S', 14)),
      lastPlayedBy: 'p2',
    });
    expect(hasLegalDaifugoPlay(state, 'p1')).toBe(true);
    expect(getDaifugoHint(state, 'p1')).toEqual({ type: 'pass', reason: 'holdStrong' });
  });

  it('labels an 8-cut that clears the table', () => {
    const state = baseState({
      hands: {
        p1: [card('eight', 'S', 8), card('a', 'D', 4), card('b', 'C', 4)],
        p2: filler('x', 6),
        p3: filler('y', 6),
      },
      pile: singlePile(card('p', 'D', 7)),
      lastPlayedBy: 'p2',
    });
    const hint = getDaifugoHint(state, 'p1');
    expect(hint).toMatchObject({ type: 'play', reason: 'eightCut' });
    if (hint?.type !== 'play') throw new Error('expected a play');
    expect(hint.cards.map(c => c.id)).toEqual(['eight']);
  });

  it('matches the master AI and is always accepted by the engine across random deals', () => {
    for (let game = 0; game < 12; game++) {
      let state = createInitialDaifugoState(['p1', 'p2', 'p3', 'p4']);
      for (let turn = 0; turn < 400 && !state.finished; turn++) {
        const pid = state.currentTurnPlayerId;
        const hint = getDaifugoHint(state, pid);
        expect(hint).not.toBeNull();
        if (!hint) break;

        const decision = decideDaifugoAction(state, pid, 'master');
        expect(hint.type).toBe(decision.type);

        const result = applyAction(state, hint.type === 'play'
          ? {
            actionId: `t${turn}`,
            type: 'play',
            playerId: pid,
            cardIds: hint.cards.map(c => c.id),
            giveCardIds: hint.giveCards.length ? hint.giveCards.map(c => c.id) : undefined,
            discardCardIds: hint.discardCards.length ? hint.discardCards.map(c => c.id) : undefined,
            timestamp: 0,
          }
          : { actionId: `t${turn}`, type: 'pass', playerId: pid, timestamp: 0 });
        expect(result.ok).toBe(true);
        if (!result.ok) break;

        if (hint.type === 'play' && (hint.reason === 'finish' || hint.reason === 'forbiddenFinish')) {
          expect(result.state.hands[pid] ?? []).toHaveLength(0);
          expect(result.state.forbiddenFinishers.includes(pid)).toBe(hint.reason === 'forbiddenFinish');
        }
        if (hint.type === 'pass' && hint.reason === 'noLegalPlay') {
          expect(hasLegalDaifugoPlay(state, pid)).toBe(false);
        }
        state = result.state;
      }
      expect(state.finished).toBe(true);
    }
  });
});

describe('hint locale strings', () => {
  const reasons = ['finish', 'forbiddenFinish', 'eightCut', 'revolution', 'lead', 'beat', 'noLegalPlay', 'holdStrong'];

  it.each([['en', en], ['ja', ja]] as const)('%s has every hint string', (_lang, locale) => {
    const hint = locale.games.daifugo.ui.hint;
    for (const key of ['button', 'play', 'pass', 'give', 'discard', 'selected'] as const) {
      expect(hint[key]).toBeTruthy();
    }
    expect(Object.keys(hint.reasons).sort()).toEqual([...reasons].sort());
    expect(hint.play).toContain('{{cards}}');
  });
});
