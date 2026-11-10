import { describe, expect, it } from 'vitest';
import {
  applyTrackedAction,
  createTrackedGame,
  summarizeClaims,
  type ClaimRecord,
  type TrackedDoubtGame,
} from '@/components/game/Doubt/claimHistory';
import { createInitialDoubtState } from '@/components/game/Doubt/gameLogic';
import { decideDoubtAIDecision } from '@/components/game/Doubt/DoubtAI';
import type { DoubtAction, DoubtNetworkState } from '@/components/game/Doubt/multiplayerTypes';
import type { Card } from '@/components/game/Doubt/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function gameForHands(
  hands: Record<string, Card[]>,
  overrides: Partial<DoubtNetworkState> = {},
): TrackedDoubtGame {
  return createTrackedGame({
    version: 1,
    phase: 'play',
    playerOrder: Object.keys(hands),
    hands,
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
  });
}

let actionSeq = 0;
function act(type: 'accept' | 'doubt', playerId: string): DoubtAction;
function act(type: 'play', playerId: string, cardIds: string[]): DoubtAction;
function act(type: DoubtAction['type'], playerId: string, cardIds: string[] = []): DoubtAction {
  const base = { actionId: `a${++actionSeq}`, playerId, timestamp: actionSeq };
  return type === 'play' ? { ...base, type, cardIds } : { ...base, type };
}

function step(game: TrackedDoubtGame, action: DoubtAction): TrackedDoubtGame {
  const result = applyTrackedAction(game, action);
  if (!result.ok) throw new Error(result.error);
  return result.game;
}

const threePlayers = () => gameForHands({
  p1: [card('a1', 'S', 1), card('k1', 'S', 13), card('q1', 'S', 12)],
  p2: [card('b2', 'H', 2), card('j2', 'H', 11), card('t2', 'H', 10)],
  p3: [card('c3', 'D', 3), card('n3', 'D', 9), card('e3', 'D', 8)],
});

describe('applyTrackedAction', () => {
  it('records the real cards behind a truthful claim as pending', () => {
    const game = step(threePlayers(), act('play', 'p1', ['a1']));

    expect(game.history).toHaveLength(1);
    expect(game.history[0]).toMatchObject({
      playerId: 'p1',
      declaredRank: 1,
      truthful: true,
      outcome: 'pending',
      challengerId: null,
    });
    expect(game.history[0]!.cards.map(c => c.id)).toEqual(['a1']);
    expect(game.state.phase).toBe('challenge');
  });

  it('marks a claim as a bluff when any card is off-rank', () => {
    const game = step(threePlayers(), act('play', 'p1', ['a1', 'k1']));

    expect(game.history[0]!.truthful).toBe(false);
    expect(game.history[0]!.cards.map(c => c.id)).toEqual(['a1', 'k1']);
  });

  it('resolves an accepted claim with the player who let it through', () => {
    let game = step(threePlayers(), act('play', 'p1', ['k1']));
    game = step(game, act('accept', 'p2'));

    expect(game.history[0]).toMatchObject({
      truthful: false,
      outcome: 'accepted',
      challengerId: 'p2',
      pileTakerId: null,
      pileSize: 0,
    });
  });

  it('gives the pile to the bluffer when a lie is doubted', () => {
    let game = step(threePlayers(), act('play', 'p1', ['a1']));
    game = step(game, act('accept', 'p2'));
    game = step(game, act('play', 'p2', ['j2', 't2']));
    game = step(game, act('doubt', 'p3'));

    expect(game.history[1]).toMatchObject({
      playerId: 'p2',
      declaredRank: 2,
      truthful: false,
      outcome: 'doubted',
      challengerId: 'p3',
      pileTakerId: 'p2',
      pileSize: 3,
    });
    expect(game.state.hands.p2).toHaveLength(4);
  });

  it('gives the pile to the doubter when the claim was honest', () => {
    let game = step(threePlayers(), act('play', 'p1', ['a1']));
    game = step(game, act('doubt', 'p2'));

    expect(game.history[0]).toMatchObject({
      truthful: true,
      outcome: 'doubted',
      challengerId: 'p2',
      pileTakerId: 'p2',
      pileSize: 1,
    });
  });

  it('leaves the game and its history untouched when the action is rejected', () => {
    const game = threePlayers();
    const result = applyTrackedAction(game, act('play', 'p2', ['b2']));

    expect(result.ok).toBe(false);
    expect(game.history).toEqual([]);
  });

  it('does not mutate the history it was given', () => {
    const before = step(threePlayers(), act('play', 'p1', ['a1']));
    const snapshot = JSON.parse(JSON.stringify(before.history));
    step(before, act('doubt', 'p2'));

    expect(before.history).toEqual(snapshot);
  });

  it('stays consistent with the engine through whole AI-driven games', () => {
    for (let round = 0; round < 4; round++) {
      const order = ['p1', 'p2', 'p3', 'p4'];
      let game = createTrackedGame(createInitialDoubtState(order));

      for (let turn = 0; turn < 600 && !game.state.finished; turn++) {
        const playerId = game.state.currentTurnPlayerId;
        const decision = decideDoubtAIDecision(game.state, playerId, round % 2 ? 'expert' : 'easy');
        const action = decision.type === 'play'
          ? act('play', playerId, decision.cardIds)
          : act(decision.type, playerId);
        game = step(game, action);

        const last = game.history[game.history.length - 1];
        if ((last?.outcome === 'pending') !== !!game.state.pendingClaim) {
          throw new Error(`pending claim out of sync at turn ${turn}`);
        }
      }

      // A game cut off mid-claim still has that last claim waiting.
      expect(game.history.filter(r => r.outcome === 'pending')).toHaveLength(game.state.pendingClaim ? 1 : 0);

      const plays = game.state.log.filter(e => e.type === 'play');
      expect(game.history).toHaveLength(plays.length);
      game.history.forEach((record, i) => {
        expect(record.cards).toHaveLength(plays[i]!.count ?? -1);
        expect(record.declaredRank).toBe(plays[i]!.declaredRank);
        expect(record.playerId).toBe(plays[i]!.playerId);
      });

      const resolved = game.state.log.filter(e => typeof e.claimTruth === 'boolean');
      const doubted = game.history.filter(r => r.outcome === 'doubted');
      expect(doubted).toHaveLength(resolved.length);
      doubted.forEach((record, i) => {
        expect(record.truthful).toBe(resolved[i]!.claimTruth);
        expect(record.pileTakerId).toBe(resolved[i]!.pileTakerId);
      });
    }
  });
});

describe('summarizeClaims', () => {
  const record = (overrides: Partial<ClaimRecord>): ClaimRecord => ({
    id: `r${++actionSeq}`,
    playerId: 'p1',
    declaredRank: 1,
    cards: [card('x', 'S', 1)],
    truthful: true,
    outcome: 'accepted',
    challengerId: 'p2',
    pileTakerId: null,
    pileSize: 0,
    ...overrides,
  });

  it('splits bluffs into caught and passed, and credits the challenger', () => {
    const summary = summarizeClaims([
      record({ truthful: false, outcome: 'accepted' }),
      record({ truthful: false, outcome: 'doubted', pileTakerId: 'p1', pileSize: 5 }),
      record({ truthful: true, outcome: 'doubted', pileTakerId: 'p2', pileSize: 3 }),
      record({ truthful: true, outcome: 'accepted' }),
    ], ['p1', 'p2', 'p3']);

    expect(summary.p1).toEqual({
      claims: 4,
      bluffs: 2,
      bluffsCaught: 1,
      bluffsPassed: 1,
      truthsDoubted: 1,
      doubts: 0,
      doubtsCorrect: 0,
      liesAccepted: 0,
      cardsPickedUp: 5,
    });
    expect(summary.p2).toMatchObject({
      claims: 0,
      doubts: 2,
      doubtsCorrect: 1,
      liesAccepted: 1,
      cardsPickedUp: 3,
    });
    expect(summary.p3).toMatchObject({ claims: 0, doubts: 0, cardsPickedUp: 0 });
  });

  it('counts an unchallenged bluff as passed and ignores pending claims', () => {
    const summary = summarizeClaims([
      record({ truthful: false, outcome: 'unchallenged', challengerId: null }),
      record({ truthful: false, outcome: 'pending', challengerId: null }),
    ], ['p1', 'p2']);

    expect(summary.p1).toMatchObject({ claims: 1, bluffs: 1, bluffsPassed: 1, bluffsCaught: 0 });
    expect(summary.p2).toMatchObject({ doubts: 0, liesAccepted: 0 });
  });
});
