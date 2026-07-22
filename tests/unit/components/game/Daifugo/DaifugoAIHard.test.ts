import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialDaifugoState } from '@/components/game/Daifugo/gameLogic';
import { decideDaifugoAction } from '@/components/game/Daifugo/DaifugoAI';
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
    log: [],
    ...overrides,
  };
}

/**
 * Hard-tier fix (A/B-measured via scripts/daifugo-ai-match.ts): hard used to
 * lose to medium by ~20pp per seat because its pass discipline NEVER spent a
 * control (2/joker) while following — mustDefend required opponentAware, which
 * hard lacks — so it hoarded its strongest cards forever. Hard now defends
 * when an opponent is nearly out, spends controls once its own hand is short,
 * and got the own-hand subset of planning (handPlanning).
 */
describe('hard tier pass discipline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Disable hard's 12% blunder noise so decisions are deterministic. */
  function noBlunder() {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  }

  it('defends with a 2 instead of passing when an opponent is about to go out', () => {
    noBlunder();
    const pile: DaifugoPile = {
      kind: 'group', cards: [card('p', 'S', 14)], count: 1, rankKey: 14, signature: 'S', playedBy: 'p2',
    };
    const state = baseState({
      hands: {
        // Big hand: hard is not near going out, but p2 has only 2 cards left.
        p1: [
          card('two', 'H', 15), card('a', 'D', 4), card('b', 'C', 5), card('c', 'H', 6),
          card('d', 'D', 9), card('e', 'C', 10), card('f', 'H', 12),
        ],
        p2: [card('x', 'C', 7), card('y', 'C', 9)],
      },
      pile,
      lastPlayedBy: 'p2',
    });
    const dec = decideDaifugoAction(state, 'p1', 'hard');
    expect(dec).toEqual({ type: 'play', cardIds: ['two'] });
  });

  it('spends a control to seize the lead when its own hand is short', () => {
    noBlunder();
    const pile: DaifugoPile = {
      kind: 'group', cards: [card('p', 'S', 14)], count: 1, rankKey: 14, signature: 'S', playedBy: 'p2',
    };
    const state = baseState({
      hands: {
        // 4 cards left (<= 5): winning this trick is how the hand goes out.
        p1: [card('two', 'H', 15), card('a', 'D', 4), card('b', 'C', 5), card('c', 'H', 6)],
        p2: [card('u', 'C', 7), card('v', 'C', 8), card('w', 'C', 9), card('x', 'C', 10), card('y', 'C', 11), card('z', 'C', 12)],
      },
      pile,
      lastPlayedBy: 'p2',
    });
    const dec = decideDaifugoAction(state, 'p1', 'hard');
    expect(dec).toEqual({ type: 'play', cardIds: ['two'] });
  });

  it('still holds its controls while the hand is big and no opponent is close', () => {
    noBlunder();
    const pile: DaifugoPile = {
      kind: 'group', cards: [card('p', 'S', 14)], count: 1, rankKey: 14, signature: 'S', playedBy: 'p2',
    };
    const state = baseState({
      hands: {
        p1: [
          card('two', 'H', 15), card('a', 'D', 4), card('b', 'C', 5), card('c', 'H', 6),
          card('d', 'D', 9), card('e', 'C', 10), card('f', 'H', 12),
        ],
        p2: [card('u', 'C', 7), card('v', 'C', 8), card('w', 'C', 9), card('x', 'C', 10), card('y', 'C', 11), card('z', 'C', 12)],
      },
      pile,
      lastPlayedBy: 'p2',
    });
    const dec = decideDaifugoAction(state, 'p1', 'hard');
    expect(dec.type).toBe('pass');
  });
});

describe('hard tier hand planning (weakened planning subset)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function noBlunder() {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
  }

  it('sees a finish through 7渡し emptying the hand', () => {
    noBlunder();
    // Playing the pair of 7s gives the leftover 4 away (7渡し) -> hand empty.
    // The pre-fix hard tier only recognized finishes where the played set was
    // the whole hand, so it missed this line.
    const state = baseState({
      hands: {
        p1: [card('s7', 'S', 7), card('h7', 'H', 7), card('low', 'D', 4)],
        p2: [card('u', 'C', 9), card('v', 'C', 10), card('w', 'C', 12)],
      },
      pile: null,
      currentTurnPlayerId: 'p1',
    });
    const dec = decideDaifugoAction(state, 'p1', 'hard');
    expect(dec.type).toBe('play');
    if (dec.type !== 'play') return;
    expect([...dec.cardIds].sort()).toEqual(['h7', 's7']);
    expect(dec.giveCardIds).toEqual(['low']);
  });

  it('leads the strong combo first with two combos left, keeping the weak one to finish', () => {
    noBlunder();
    // Two combos: K single (strong) + 4 single (weak). Leading the K often
    // wins the trick outright, keeping the 4 as the final play; leading the 4
    // (medium's choice) usually means never regaining the lead.
    const state = baseState({
      hands: {
        p1: [card('king', 'S', 13), card('low', 'H', 4)],
        p2: [card('u', 'C', 6), card('v', 'C', 9), card('w', 'C', 11)],
      },
      pile: null,
      currentTurnPlayerId: 'p1',
    });
    const dec = decideDaifugoAction(state, 'p1', 'hard');
    expect(dec).toEqual({ type: 'play', cardIds: ['king'] });
  });
});
