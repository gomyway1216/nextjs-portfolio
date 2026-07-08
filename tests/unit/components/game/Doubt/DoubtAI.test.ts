import { describe, expect, it } from 'vitest';
import {
  DOUBT_AI_CONFIGS,
  countRank,
  decideChallenge,
  decidePlay,
  decideDoubtAIDecision,
  estimateClaimTruthProbability,
} from '@/components/game/Doubt/DoubtAI';
import type { DoubtNetworkState } from '@/components/game/Doubt/multiplayerTypes';
import type { Card } from '@/components/game/Doubt/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function baseState(overrides: Partial<DoubtNetworkState> = {}): DoubtNetworkState {
  return {
    version: 1,
    phase: 'play',
    playerOrder: ['p1', 'p2', 'p3'],
    hands: {},
    pile: [],
    pendingClaim: null,
    currentTurnPlayerId: 'p1',
    requiredRank: 1,
    finishedOrder: [],
    finished: false,
    winnerId: null,
    ranks: null,
    startedAt: 1,
    log: [],
    lastUpdate: 1,
    ...overrides,
  };
}

// Deterministic rng helpers.
const rngHigh = () => 0.99;
const rngLow = () => 0.01;
const rngMid = () => 0.5;

describe('estimateClaimTruthProbability', () => {
  it('returns 0 when the claim exceeds the copies that could exist elsewhere', () => {
    // I hold 2 of the rank, so only 2 remain; a claim of 3 is impossible.
    expect(estimateClaimTruthProbability({ declaredRank: 5, claimCount: 3, myCount: 2, unseenCards: 30 }))
      .toBe(0);
  });

  it('returns a probability in [0,1] for a plausible claim', () => {
    const p = estimateClaimTruthProbability({ declaredRank: 5, claimCount: 1, myCount: 0, unseenCards: 30 });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('makes larger claims less credible than smaller ones', () => {
    const p1 = estimateClaimTruthProbability({ declaredRank: 5, claimCount: 1, myCount: 0, unseenCards: 30 });
    const p3 = estimateClaimTruthProbability({ declaredRank: 5, claimCount: 3, myCount: 0, unseenCards: 30 });
    expect(p3).toBeLessThan(p1);
  });
});

describe('countRank', () => {
  it('counts copies of a rank in a hand', () => {
    const hand = [card('a', 'S', 3), card('b', 'H', 3), card('c', 'D', 7)];
    expect(countRank(hand, 3)).toBe(2);
    expect(countRank(hand, 7)).toBe(1);
    expect(countRank(hand, 9)).toBe(0);
  });
});

describe('decideChallenge', () => {
  it('always doubts a physically impossible claim regardless of tier', () => {
    const state = baseState({
      phase: 'challenge',
      hands: { p2: [card('a', 'S', 5), card('b', 'H', 5)] },
      currentTurnPlayerId: 'p2',
      pile: [card('x1', 'S', 9), card('x2', 'H', 9)],
      pendingClaim: {
        playerId: 'p1',
        declaredRank: 5,
        cardIds: ['x1', 'x2'],
        cardCount: 3, // impossible: p2 already holds 2 of rank 5
        wentOut: false,
        timestamp: 1,
      },
    });
    for (const tier of ['easy', 'medium', 'hard', 'expert'] as const) {
      expect(decideChallenge(state, 'p2', DOUBT_AI_CONFIGS[tier], rngMid)).toEqual({ type: 'doubt' });
    }
  });

  it('doubts when it holds 2+ copies and the claim would let the opponent go out (guarded tiers)', () => {
    const state = baseState({
      phase: 'challenge',
      hands: { p2: [card('a', 'S', 5), card('b', 'H', 5)] },
      currentTurnPlayerId: 'p2',
      pile: [card('x1', 'S', 5)],
      pendingClaim: {
        playerId: 'p1',
        declaredRank: 5,
        cardIds: ['x1'],
        cardCount: 1,
        wentOut: true,
        timestamp: 1,
      },
    });
    expect(decideChallenge(state, 'p2', DOUBT_AI_CONFIGS.hard, rngMid)).toEqual({ type: 'doubt' });
    expect(decideChallenge(state, 'p2', DOUBT_AI_CONFIGS.expert, rngMid)).toEqual({ type: 'doubt' });
  });

  it('accepts a single believable claim when it holds none of the rank', () => {
    const state = baseState({
      phase: 'challenge',
      hands: { p2: [card('a', 'S', 8), card('b', 'H', 9)] },
      currentTurnPlayerId: 'p2',
      pile: [card('x1', 'S', 5)],
      pendingClaim: {
        playerId: 'p1',
        declaredRank: 5,
        cardIds: ['x1'],
        cardCount: 1,
        wentOut: false,
        timestamp: 1,
      },
    });
    // Easy tier with low doubt threshold should not doubt a plausible single claim.
    expect(decideChallenge(state, 'p2', DOUBT_AI_CONFIGS.easy, rngMid)).toEqual({ type: 'accept' });
  });
});

describe('decidePlay', () => {
  it('plays the whole hand truthfully to go out when every card matches', () => {
    const state = baseState({
      requiredRank: 5,
      currentTurnPlayerId: 'p2',
      hands: { p2: [card('a', 'S', 5), card('b', 'H', 5)] },
    });
    const decision = decidePlay(state, 'p2', DOUBT_AI_CONFIGS.medium, rngHigh);
    expect(decision).toEqual({ type: 'play', cardIds: ['a', 'b'] });
  });

  it('is forced to bluff (still plays 1-4 cards) when it holds none of the required rank', () => {
    const hand = [card('a', 'S', 2), card('b', 'H', 7), card('c', 'D', 9), card('d', 'C', 11)];
    const state = baseState({ requiredRank: 5, currentTurnPlayerId: 'p2', hands: { p2: hand } });
    const decision = decidePlay(state, 'p2', DOUBT_AI_CONFIGS.medium, rngLow);
    expect(decision.type).toBe('play');
    if (decision.type === 'play') {
      expect(decision.cardIds.length).toBeGreaterThanOrEqual(1);
      expect(decision.cardIds.length).toBeLessThanOrEqual(4);
      // Bluffed cards must actually be in hand.
      for (const id of decision.cardIds) {
        expect(hand.some(c => c.id === id)).toBe(true);
      }
    }
  });

  it('only plays cards that are in hand and never more than 4', () => {
    const hand = Array.from({ length: 13 }, (_, i) => card(`c${i}`, 'S', ((i % 13) + 1)));
    const state = baseState({ requiredRank: 5, currentTurnPlayerId: 'p2', hands: { p2: hand } });
    for (const tier of ['easy', 'medium', 'hard', 'expert'] as const) {
      const decision = decidePlay(state, 'p2', DOUBT_AI_CONFIGS[tier], rngMid);
      expect(decision.type).toBe('play');
      if (decision.type === 'play') {
        expect(decision.cardIds.length).toBeGreaterThanOrEqual(1);
        expect(decision.cardIds.length).toBeLessThanOrEqual(4);
        expect(new Set(decision.cardIds).size).toBe(decision.cardIds.length);
      }
    }
  });
});

describe('decideDoubtAIDecision (entry point)', () => {
  it('returns accept when it is not the AI turn or game is finished', () => {
    const finished = baseState({ finished: true, phase: 'finished' });
    expect(decideDoubtAIDecision(finished, 'p1')).toEqual({ type: 'accept' });

    const notMyTurn = baseState({ currentTurnPlayerId: 'p2' });
    expect(decideDoubtAIDecision(notMyTurn, 'p1')).toEqual({ type: 'accept' });
  });

  it('defaults to medium difficulty when none is supplied', () => {
    const state = baseState({
      requiredRank: 5,
      currentTurnPlayerId: 'p1',
      hands: { p1: [card('a', 'S', 5)] },
    });
    const decision = decideDoubtAIDecision(state, 'p1');
    expect(decision).toEqual({ type: 'play', cardIds: ['a'] });
  });
});
