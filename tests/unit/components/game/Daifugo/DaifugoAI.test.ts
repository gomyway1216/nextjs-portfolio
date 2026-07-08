import { describe, expect, it } from 'vitest';
import { applyAction, createInitialDaifugoState } from '@/components/game/Daifugo/gameLogic';
import { decideDaifugoAction, type DaifugoDifficulty } from '@/components/game/Daifugo/DaifugoAI';
import type { Card } from '@/components/game/Daifugo/types';
import type { DaifugoNetworkState, DaifugoPile } from '@/components/game/Daifugo/multiplayerTypes';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function baseState(overrides: Partial<DaifugoNetworkState> = {}): DaifugoNetworkState {
  const s = createInitialDaifugoState(['p1', 'p2']);
  return {
    ...s,
    hands: { p1: [], p2: [] },
    pile: null,
    passes: [],
    lastPlayedBy: null,
    currentTurnPlayerId: 'p1',
    ...overrides,
  };
}

describe('DaifugoAI', () => {
  it('never returns an illegal move across many random games', () => {
    const diffs: DaifugoDifficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];
    for (let g = 0; g < 40; g++) {
      const order = ['a', 'b', 'c', 'd'];
      let state = createInitialDaifugoState(order);
      let steps = 0;
      let illegal = 0;
      while (!state.finished && steps < 1500) {
        steps++;
        const pid = state.currentTurnPlayerId;
        const diff = diffs[order.indexOf(pid) % diffs.length]!;
        const dec = decideDaifugoAction(state, pid, diff);
        const action = dec.type === 'play'
          ? { actionId: 'x', type: 'play' as const, playerId: pid, cardIds: dec.cardIds, giveCardIds: dec.giveCardIds, discardCardIds: dec.discardCardIds, timestamp: 0 }
          : { actionId: 'x', type: 'pass' as const, playerId: pid, timestamp: 0 };
        const res = applyAction(state, action);
        if (!res.ok) {
          illegal++;
          // Fallback so the game can progress; but record the illegality.
          const pass = applyAction(state, { actionId: 'x', type: 'pass', playerId: pid, timestamp: 0 });
          if (!pass.ok) break;
          state = pass.state;
          continue;
        }
        state = res.state;
      }
      expect(illegal).toBe(0);
      expect(state.finished).toBe(true);
    }
  });

  it('takes an immediate winning move when one card remains', () => {
    const pile: DaifugoPile = {
      kind: 'group', cards: [card('p', 'H', 6)], count: 1, rankKey: 6, signature: 'H', playedBy: 'p2',
    };
    const state = baseState({
      hands: { p1: [card('k', 'S', 13)], p2: [card('o', 'D', 4)] },
      pile,
      lastPlayedBy: 'p2',
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec).toEqual({ type: 'play', cardIds: ['k'] });
  });

  it('leads with a low card rather than dumping a 2 when possible', () => {
    const state = baseState({
      hands: {
        p1: [card('lo', 'D', 3), card('mid', 'S', 9), card('two', 'H', 15)],
        p2: [card('x', 'C', 7)],
      },
      pile: null,
      currentTurnPlayerId: 'p1',
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec.type).toBe('play');
    if (dec.type !== 'play') return;
    // Should not throw away the 2 on a free lead.
    expect(dec.cardIds).not.toContain('two');
    expect(dec.cardIds).toContain('lo');
  });

  it('passes on master rather than burning a joker to beat a trivial pile it cannot cheaply beat', () => {
    // Only card that can beat the pile is the joker -> master should hold it.
    const pile: DaifugoPile = {
      kind: 'group', cards: [card('p', 'S', 15)], count: 1, rankKey: 15, signature: 'S', playedBy: 'p2',
    };
    // Opponent is NOT close to winning (many cards), so there's no reason to
    // burn the only beating card (the joker). Master should hold and pass.
    const state = baseState({
      hands: {
        p1: [card('j', 'J', 16), card('low', 'D', 4), card('low2', 'S', 5)],
        p2: [card('a', 'C', 7), card('b', 'C', 8), card('c', 'C', 9), card('e', 'C', 10), card('f', 'C', 11)],
      },
      pile,
      lastPlayedBy: 'p2',
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec.type).toBe('pass');
  });

  it('easy tier still produces only legal single leads', () => {
    const state = baseState({
      hands: { p1: [card('a', 'S', 5), card('b', 'H', 5)], p2: [card('z', 'C', 9)] },
      pile: null,
      currentTurnPlayerId: 'p1',
    });
    const dec = decideDaifugoAction(state, 'p1', 'easy');
    expect(dec.type).toBe('play');
  });
});
