import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PASS_EVIDENCE_DISCOUNT,
  buildShichinarabeEstimator,
} from '@/components/game/Shichinarabe/ShichinarabeEstimator';
import { decideShichinarabeAction } from '@/components/game/Shichinarabe/ShichinarabeAI';
import { applyAction, createInitialShichinarabeState } from '@/components/game/Shichinarabe/gameLogic';
import type {
  ShichinarabeLogEntry,
  ShichinarabeNetworkState,
} from '@/components/game/Shichinarabe/multiplayerTypes';
import type { Card, CardSuit } from '@/components/game/Shichinarabe/types';

function card(id: string, suit: CardSuit, rank: number): Card {
  return { id, suit, rank };
}

let logId = 0;
function logEntry(partial: Omit<ShichinarabeLogEntry, 'id' | 'timestamp'>): ShichinarabeLogEntry {
  return { id: `l${logId++}`, timestamp: 0, ...partial };
}

interface StateOverrides {
  hands?: Record<string, Card[]>;
  table?: ShichinarabeNetworkState['table'];
  playerOrder?: string[];
  finishedOrder?: string[];
  eliminatedOrder?: string[];
  log?: ShichinarabeLogEntry[];
  passCounts?: Record<string, number>;
  maxPasses?: number;
  currentTurnPlayerId?: string;
}

function makeState(overrides: StateOverrides = {}): ShichinarabeNetworkState {
  const playerOrder = overrides.playerOrder ?? ['me', 'a', 'b'];
  const hands: Record<string, Card[]> = overrides.hands ?? {};
  for (const pid of playerOrder) hands[pid] = hands[pid] ?? [];
  const passCounts: Record<string, number> = overrides.passCounts ?? {};
  for (const pid of playerOrder) passCounts[pid] = passCounts[pid] ?? 0;
  return {
    version: 1,
    playerOrder,
    hands,
    table: overrides.table ?? {
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    },
    currentTurnPlayerId: overrides.currentTurnPlayerId ?? playerOrder[0]!,
    passCounts,
    maxPasses: overrides.maxPasses ?? 3,
    finishedOrder: overrides.finishedOrder ?? [],
    eliminatedOrder: overrides.eliminatedOrder ?? [],
    finished: false,
    winnerId: null,
    resultOrder: [],
    ranks: null,
    startedAt: 1,
    log: overrides.log ?? [],
    lastUpdate: 1,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShichinarabeEstimator - unknown pool construction', () => {
  it('excludes table cards and my own hand; everything else is unknown', () => {
    const state = makeState({
      hands: {
        me: [card('s5', 'S', 5), card('h9', 'H', 9)],
        a: [card('xx', 'S', 4)], // must NOT be readable
      },
      table: {
        S: { low: 6, high: 8 }, // S6, S7, S8 on the table
        H: { low: 7, high: 7 },
        D: { low: 7, high: 7 },
        C: { low: 7, high: 7 },
      },
    });
    const est = buildShichinarabeEstimator(state, 'me');

    // 52 - 6 table cards (S6,S7,S8,H7,D7,C7) - 2 own cards = 44 unknown.
    expect(est.unknownCards).toHaveLength(44);
    const keys = new Set(est.unknownCards.map((c) => `${c.suit}${c.rank}`));
    expect(keys.has('S7')).toBe(false); // on table
    expect(keys.has('S6')).toBe(false); // on table
    expect(keys.has('S5')).toBe(false); // my hand
    expect(keys.has('H9')).toBe(false); // my hand
    expect(keys.has('S4')).toBe(true); // opponent-held card stays UNKNOWN (never read)
    expect(keys.has('C13')).toBe(true);
  });

  it('shrinks as the table grows', () => {
    const before = buildShichinarabeEstimator(makeState(), 'me');
    const after = buildShichinarabeEstimator(
      makeState({
        table: {
          S: { low: 1, high: 13 },
          H: { low: 7, high: 7 },
          D: { low: 7, high: 7 },
          C: { low: 7, high: 7 },
        },
      }),
      'me',
    );
    expect(before.unknownCards).toHaveLength(48);
    expect(after.unknownCards).toHaveLength(36); // whole spade suit resolved
  });
});

describe('ShichinarabeEstimator - hold probabilities', () => {
  it('is 0 for cards on the table or in my own hand', () => {
    const state = makeState({
      hands: { me: [card('s5', 'S', 5)], a: [card('a1', 'H', 2)] },
      table: {
        S: { low: 6, high: 8 },
        H: { low: 7, high: 7 },
        D: { low: 7, high: 7 },
        C: { low: 7, high: 7 },
      },
    });
    const est = buildShichinarabeEstimator(state, 'me');
    expect(est.activeOpponentHoldProbability('S', 7)).toBe(0);
    expect(est.activeOpponentHoldProbability('S', 6)).toBe(0);
    expect(est.activeOpponentHoldProbability('S', 5)).toBe(0);
  });

  it('is exactly 1 for an unseen card while every hidden card sits in an active hand', () => {
    const state = makeState({
      hands: {
        me: [card('s6', 'S', 6)],
        a: [card('a1', 'H', 2), card('a2', 'H', 3)],
        b: [card('b1', 'C', 10)],
      },
    });
    const est = buildShichinarabeEstimator(state, 'me');
    // No eliminations: any unseen card is certainly held by an active opponent.
    expect(est.activeOpponentHoldProbability('D', 10)).toBe(1);
    const perPlayer = est.activeOpponentHoldProbabilities('D', 10);
    // Split across opponents in proportion to their public hand sizes (2 vs 1).
    expect(perPlayer).toHaveLength(2);
    const byId = Object.fromEntries(perPlayer.map((p) => [p.playerId, p.probability]));
    expect(byId['a']).toBeCloseTo(2 / 3, 10);
    expect(byId['b']).toBeCloseTo(1 / 3, 10);
  });

  it('drops below 1 when an eliminated player still holds unrevealed cards', () => {
    const state = makeState({
      playerOrder: ['me', 'a', 'b'],
      hands: {
        me: [card('s6', 'S', 6)],
        a: [card('a1', 'H', 2), card('a2', 'H', 3)], // active, size 2
        b: [card('b1', 'C', 10), card('b2', 'C', 12)], // eliminated residual, size 2
      },
      eliminatedOrder: ['b'],
    });
    const est = buildShichinarabeEstimator(state, 'me');
    // Unseen card: 2 active-held slots out of 4 hidden slots.
    expect(est.activeOpponentHoldProbability('D', 10)).toBeCloseTo(0.5, 10);
    // Eliminated players are not listed as active holders.
    expect(est.activeOpponentHoldProbabilities('D', 10).map((p) => p.playerId)).toEqual(['a']);
  });

  it('ignores finished players (they hold nothing)', () => {
    const state = makeState({
      playerOrder: ['me', 'a', 'b'],
      hands: { me: [], a: [card('a1', 'H', 2)], b: [] },
      finishedOrder: ['b'],
    });
    const est = buildShichinarabeEstimator(state, 'me');
    expect(est.activeOpponentHoldProbabilities('D', 10).map((p) => p.playerId)).toEqual(['a']);
    expect(est.activeOpponentHoldProbability('D', 10)).toBe(1);
  });
});

describe('ShichinarabeEstimator - pass evidence from the public log', () => {
  it('counts passes only while the card was playable, replaying table bounds', () => {
    const state = makeState({
      table: {
        S: { low: 5, high: 7 },
        H: { low: 7, high: 7 },
        D: { low: 7, high: 7 },
        C: { low: 7, high: 7 },
      },
      log: [
        logEntry({ type: 'start', playerId: 'me' }),
        // At this point the table is all 7s: playable slots are 6/8 everywhere.
        logEntry({ type: 'pass', playerId: 'a', passCount: 1 }),
        logEntry({ type: 'play', playerId: 'b', card: { suit: 'S', rank: 6 } }),
        logEntry({ type: 'play', playerId: 'b', card: { suit: 'S', rank: 5 } }),
        // Now S4 is exposed; a passes again.
        logEntry({ type: 'pass', playerId: 'a', passCount: 2 }),
      ],
    });
    const est = buildShichinarabeEstimator(state, 'me');

    // S6 was playable at a's first pass only (then it was played).
    expect(est.passEvidence('a', 'S', 6)).toBe(1);
    // S4 only became playable after S5 landed: evidence from the second pass only.
    expect(est.passEvidence('a', 'S', 4)).toBe(1);
    // H6/H8 were playable at both passes.
    expect(est.passEvidence('a', 'H', 6)).toBe(2);
    expect(est.passEvidence('a', 'H', 8)).toBe(2);
    // b never passed.
    expect(est.passEvidence('b', 'S', 4)).toBe(0);
    // S3 was never playable during a pass.
    expect(est.passEvidence('a', 'S', 3)).toBe(0);
  });

  it('shifts probability mass away from a player who passed on the card', () => {
    const state = makeState({
      playerOrder: ['me', 'a', 'b'],
      hands: {
        me: [],
        a: [card('a1', 'H', 2), card('a2', 'H', 3)], // active, size 2
        b: [card('b1', 'C', 10), card('b2', 'C', 12)], // eliminated residual, size 2
      },
      eliminatedOrder: ['b'],
      log: [
        // 'a' passed while D8 (and every other 6/8 slot) was playable.
        logEntry({ type: 'pass', playerId: 'a', passCount: 1 }),
      ],
    });
    const est = buildShichinarabeEstimator(state, 'me');

    // Baseline (no evidence): active a holds an unseen card with p = 2/4.
    expect(est.activeOpponentHoldProbability('D', 5)).toBeCloseTo(0.5, 10);
    // For D8, a's weight is discounted by the pass: 2*d / (2*d + 2).
    const d = PASS_EVIDENCE_DISCOUNT;
    expect(est.activeOpponentHoldProbability('D', 8)).toBeCloseTo((2 * d) / (2 * d + 2), 10);
    // Probability of an unseen card never leaves [0, 1].
    expect(est.activeOpponentHoldProbability('D', 8)).toBeGreaterThan(0);
    expect(est.activeOpponentHoldProbability('D', 8)).toBeLessThan(0.5);
  });

  it('discounts the eliminated residual as well when the eliminated player had passed', () => {
    const state = makeState({
      playerOrder: ['me', 'a', 'b'],
      hands: {
        me: [],
        a: [card('a1', 'H', 2)],
        b: [card('b1', 'C', 10)],
      },
      eliminatedOrder: ['b'],
      log: [logEntry({ type: 'pass', playerId: 'b', passCount: 1 })],
    });
    const est = buildShichinarabeEstimator(state, 'me');
    const d = PASS_EVIDENCE_DISCOUNT;
    // b (residual) passed on S8: active a's share rises above the 1/2 baseline.
    expect(est.activeOpponentHoldProbability('S', 8)).toBeCloseTo(1 / (1 + d), 10);
    expect(est.activeOpponentHoldProbability('S', 5)).toBeCloseTo(0.5, 10);
  });
});

describe('ShichinarabeAI - fair play regression', () => {
  it('never changes decisions when a concealed opponent card is swapped (same suit-count profile)', () => {
    // Two states identical in every PUBLIC aspect; only the identity of a
    // concealed opponent card differs. A fair AI must decide identically.
    const base = {
      hands: {
        me: [card('s6', 'S', 6), card('h8', 'H', 8), card('c2', 'C', 2)],
        a: [card('a1', 'S', 5)],
        b: [card('b1', 'D', 9)],
      },
      currentTurnPlayerId: 'me',
    };
    const swapped = {
      hands: {
        ...base.hands,
        a: [card('a1', 'D', 9)],
        b: [card('b1', 'S', 5)],
      },
      currentTurnPlayerId: 'me',
    };
    for (const difficulty of ['medium', 'hard', 'expert', 'master'] as const) {
      const rng = vi.spyOn(Math, 'random');
      rng.mockReturnValue(0.42);
      const d1 = decideShichinarabeAction(makeState(base), 'me', difficulty);
      const d2 = decideShichinarabeAction(makeState(swapped), 'me', difficulty);
      expect(d2).toEqual(d1);
      rng.mockRestore();
    }
  });

  it('easy and medium decide from their own hand only (estimator-free path)', () => {
    // Full playthrough sanity: easy/medium never crash and produce legal
    // actions with completely hidden-agnostic behaviour.
    const seeds = [0.12, 0.55, 0.91];
    let seedIdx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seeds[seedIdx++ % seeds.length]!);
    let state = createInitialShichinarabeState(['p1', 'p2', 'p3']);
    for (let step = 0; step < 300 && !state.finished; step++) {
      const pid = state.currentTurnPlayerId;
      const decision = decideShichinarabeAction(state, pid, step % 2 === 0 ? 'easy' : 'medium');
      const action =
        decision.type === 'play'
          ? { actionId: `t${step}`, type: 'play' as const, playerId: pid, cardId: decision.cardId, timestamp: 0 }
          : { actionId: `t${step}`, type: 'pass' as const, playerId: pid, timestamp: 0 };
      const result = applyAction(state, action);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(state.finished).toBe(true);
  });
});
