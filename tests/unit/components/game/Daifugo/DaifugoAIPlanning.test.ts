import { describe, expect, it } from 'vitest';
import { createInitialDaifugoState } from '@/components/game/Daifugo/gameLogic';
import {
  countUnseenByRank,
  decideDaifugoAction,
  estimateTurnsToGo,
  partitionHand,
} from '@/components/game/Daifugo/DaifugoAI';
import type { Card } from '@/components/game/Daifugo/types';
import { JOKER_RANK } from '@/components/game/Daifugo/types';
import type { DaifugoLogEntry, DaifugoNetworkState, DaifugoPile } from '@/components/game/Daifugo/multiplayerTypes';

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
    log: [],
    ...overrides,
  };
}

function playLog(partial: Partial<DaifugoLogEntry>): DaifugoLogEntry {
  return { id: 'log', type: 'play', playerId: 'p2', timestamp: 0, ...partial };
}

describe('partitionHand / estimateTurnsToGo', () => {
  it('empty hand needs zero turns', () => {
    expect(estimateTurnsToGo([])).toBe(0);
    expect(partitionHand([])).toEqual([]);
  });

  it('keeps pairs together instead of counting singles', () => {
    const hand = [card('a', 'S', 5), card('b', 'H', 5), card('c', 'C', 9)];
    expect(estimateTurnsToGo(hand)).toBe(2); // {5,5} + {9}
  });

  it('uses a same-suit straight as one combo', () => {
    const hand = [card('a', 'S', 5), card('b', 'S', 6), card('c', 'S', 7)];
    expect(estimateTurnsToGo(hand)).toBe(1);
  });

  it('prefers the straight when it beats splitting into groups', () => {
    // Straight 5-6-7♠ + 7♥ single = 2 combos; groups-only would be 3.
    const hand = [card('a', 'S', 5), card('b', 'S', 6), card('c', 'S', 7), card('d', 'H', 7)];
    expect(estimateTurnsToGo(hand)).toBe(2);
  });

  it('counts the joker as its own single', () => {
    const hand = [card('j', 'J', JOKER_RANK), card('a', 'S', 5)];
    expect(estimateTurnsToGo(hand)).toBe(2);
  });
});

describe('countUnseenByRank', () => {
  it('subtracts the player own hand from the full deck', () => {
    const state = baseState({
      hands: { p1: [card('a', 'S', 5), card('b', 'H', 5), card('j', 'J', JOKER_RANK)], p2: [] },
    });
    const unseen = countUnseenByRank(state, 'p1');
    expect(unseen[5]).toBe(2); // 4 - 2 in hand
    expect(unseen[9]).toBe(4);
    expect(unseen[JOKER_RANK]).toBe(0); // we hold the joker
  });

  it('subtracts group and straight plays from the public log', () => {
    const state = baseState({
      hands: { p1: [], p2: [] },
      log: [
        playLog({ playKind: 'group', cardCount: 2, rankKey: 9, signature: 'HS' }),
        playLog({ playKind: 'straight', cardCount: 3, rankKey: 7, signature: 'DDD' }),
      ],
    });
    const unseen = countUnseenByRank(state, 'p1');
    expect(unseen[9]).toBe(2);
    expect(unseen[5]).toBe(3); // straight covered 5,6,7
    expect(unseen[6]).toBe(3);
    expect(unseen[7]).toBe(3);
    expect(unseen[8]).toBe(4);
  });

  it('ignores informational play entries without a payload', () => {
    const state = baseState({
      hands: { p1: [], p2: [] },
      log: [playLog({ detail: 'Revolution toggled' })],
    });
    const unseen = countUnseenByRank(state, 'p1');
    expect(unseen[3]).toBe(4);
    expect(unseen[JOKER_RANK]).toBe(1);
  });
});

describe('master planning decisions', () => {
  it('refuses a forbidden finish (2 as last card) and passes instead', () => {
    // Only legal response is the 2♥, but finishing with a 2 triggers あがり禁止
    // and demotes to last place. Master must hold it and pass.
    const pile: DaifugoPile = {
      kind: 'group', cards: [card('p', 'S', 13)], count: 1, rankKey: 13, signature: 'S', playedBy: 'p2',
    };
    const state = baseState({
      hands: {
        p1: [card('two', 'H', 15)],
        p2: [card('a', 'C', 4), card('b', 'C', 6), card('c', 'C', 9), card('d', 'C', 10), card('e', 'C', 12)],
      },
      pile,
      lastPlayedBy: 'p2',
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec.type).toBe('pass');
  });

  it('still takes a legal, non-forbidden finish immediately', () => {
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

  it('plays the unbeatable 2 first to lock a guaranteed two-step finish', () => {
    // Joker already played (log) -> a lone 2 is unbeatable. Master should play
    // the 2 now, win the trick, then lead the 4 to go out — not dump the 4.
    const state = baseState({
      hands: {
        p1: [card('two', 'S', 15), card('low', 'D', 4)],
        p2: [card('a', 'C', 6), card('b', 'C', 9), card('c', 'H', 10), card('d', 'H', 12), card('e', 'D', 13)],
      },
      pile: null,
      log: [playLog({ playKind: 'group', cardCount: 1, rankKey: JOKER_RANK, signature: null })],
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec.type).toBe('play');
    if (dec.type !== 'play') return;
    expect(dec.cardIds).toEqual(['two']);
  });

  it('uses 8切り to clear the table and finish with the leftover card', () => {
    const state = baseState({
      hands: {
        p1: [card('eight', 'C', 8), card('low', 'D', 5)],
        p2: [card('a', 'C', 6), card('b', 'C', 9), card('c', 'H', 10), card('d', 'H', 12), card('e', 'D', 13)],
      },
      pile: null,
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec.type).toBe('play');
    if (dec.type !== 'play') return;
    expect(dec.cardIds).toEqual(['eight']);
  });

  it('does not treat a 2 as unbeatable while the joker is still unseen', () => {
    // Same shape as the guaranteed-finish test but the joker is NOT in the log:
    // an opponent could still beat the 2, so there is no proven line and the
    // normal ranking leads the weak card in a 2-combo endgame... which the
    // strong-first endgame heuristic overrides — the point here is only that
    // the guaranteed-finish path is not falsely triggered.
    const state = baseState({
      hands: {
        p1: [card('two', 'S', 15), card('low', 'D', 4), card('low2', 'H', 4), card('mid', 'C', 9)],
        p2: [card('a', 'C', 6), card('b', 'C', 7), card('c', 'H', 10), card('d', 'H', 12), card('e', 'D', 13)],
      },
      pile: null,
    });
    const dec = decideDaifugoAction(state, 'p1', 'master');
    expect(dec.type).toBe('play');
    if (dec.type !== 'play') return;
    // With 3 combos left and no proven finish, master must not lead the 2.
    expect(dec.cardIds).not.toContain('two');
  });
});
