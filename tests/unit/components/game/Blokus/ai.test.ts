import { describe, expect, it } from 'vitest';
import { BEST_WEIGHTS, budgetFor, chooseMove, evaluate, rankMoves, seededRandom, type SearchBudget } from '@/components/game/Blokus/ai';
import { handleRequest } from '@/components/game/Blokus/blokus-ai.worker';
import { createBlokusAiClient } from '@/components/game/Blokus/blokusAiWorkerClient';
import { PIECES, applyMove, cloneState, legalMoves, movePiece, newGame, passTurn, scores, type GameState, type Mode } from '@/components/game/Blokus/engine';
import type { Difficulty } from '@/components/game/common/types';

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];
/** A clock that never moves, so a search stops on its playout budget alone. */
const stopped = () => 0;
const SMALL: Partial<SearchBudget> = { maxPlayouts: 12, horizon: 4 };

const budgetOf = (level: Difficulty) => (budgetFor(level) ? SMALL : undefined);

const playGame = (mode: Mode, levelOf: (color: number) => Difficulty, seed: number): GameState => {
  const state = newGame(mode);
  const random = seededRandom(seed);
  for (let color = 0; color < state.rules.colors; color++) {
    const big = legalMoves(state).filter((move) => PIECES[movePiece(move)].size === 5);
    applyMove(state, big[Math.floor(random() * big.length)]);
  }
  while (!state.over) {
    const moves = legalMoves(state);
    if (moves.length === 0) {
      passTurn(state);
      continue;
    }
    const level = levelOf(state.toMove);
    applyMove(state, chooseMove(state, moves, level, { random, now: stopped, budget: budgetOf(level) }));
  }
  return state;
};

/** Mean score of `strong` over `weak`, on alternating seats so the first move favours neither. */
const scoreGap = (mode: Mode, strong: Difficulty, weak: Difficulty, games: number): number => {
  let gap = 0;
  for (let game = 0; game < games; game++) {
    const parity = game % 2;
    const state = playGame(mode, (color) => (color % 2 === parity ? strong : weak), 1000 + game);
    const all = scores(state);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    gap += mean(all.filter((_, color) => color % 2 === parity)) - mean(all.filter((_, color) => color % 2 !== parity));
  }
  return gap / games;
};

describe('every level', () => {
  it.each(LEVELS)('%s only plays legal moves, from the first to the last', (level) => {
    for (const mode of ['classic', 'duo'] as const) {
      const state = newGame(mode);
      const random = seededRandom(5);
      while (!state.over) {
        const moves = legalMoves(state);
        if (moves.length === 0) {
          passTurn(state);
          continue;
        }
        const before = cloneState(state);
        const move = chooseMove(state, moves, level, { random, now: stopped, budget: { maxPlayouts: 4, horizon: 2 } });
        expect(moves).toContain(move);
        expect(state.board).toEqual(before.board);
        expect(state.hands).toEqual(before.hands);
        expect(state.toMove).toBe(before.toMove);
        applyMove(state, move);
      }
    }
  }, 20_000);
});

describe('the ladder', () => {
  // The harness (scripts/blokus-ai-match.ts) measures all five levels with their real budgets. These pin the cheap ones.
  it.each(['classic', 'duo'] as const)('medium outscores easy and hard outscores medium (%s)', (mode) => {
    expect(scoreGap(mode, 'medium', 'easy', 40)).toBeGreaterThan(1);
    expect(scoreGap(mode, 'hard', 'medium', 40)).toBeGreaterThan(1);
  }, 20_000);

  it('gives master more time and candidates than expert', () => {
    const expert = budgetFor('expert')!;
    const master = budgetFor('master')!;
    expect(master.timeLimitMs).toBeGreaterThan(expert.timeLimitMs);
    expect(master.width).toBeGreaterThan(expert.width);
    expect(budgetFor('hard')).toBeNull();
  });
});

describe('the search', () => {
  const midGame = (): GameState => playGame('duo', () => 'hard', 3);

  it('replays exactly from a seed on a fixed budget', () => {
    const state = newGame('classic');
    const opening = legalMoves(state)[10];
    applyMove(state, opening);
    const moves = legalMoves(state);
    const choose = () => chooseMove(state, moves, 'expert', { random: seededRandom(42), now: stopped, budget: SMALL });
    expect(choose()).toBe(choose());
  });

  it('stops at its time limit', () => {
    const state = newGame('classic');
    const moves = legalMoves(state);
    let clock = 0;
    let reads = 0;
    const now = () => {
      reads += 1;
      clock += 10;
      return clock;
    };
    chooseMove(state, moves, 'master', { random: seededRandom(1), now, budget: { timeLimitMs: 100, maxPlayouts: 1e9, horizon: 2 } });
    expect(reads).toBeLessThan(15);
  });

  it.each([
    [12, 6],
    [12, 12],
    [3, 12],
  ])('plays exactly %i playouts with %i candidates, however the rounds divide them', (maxPlayouts, width) => {
    const state = newGame('classic');
    let reads = 0;
    const now = () => {
      reads += 1;
      return 0;
    };
    chooseMove(state, legalMoves(state), 'master', { random: seededRandom(1), now, budget: { maxPlayouts, width, horizon: 2 } });
    // One read sets the deadline, then one follows each playout.
    expect(reads - 1).toBe(maxPlayouts);
  });

  it('never prefers a candidate it ran out of time to try', () => {
    const state = newGame('classic');
    applyMove(state, legalMoves(state)[10]);
    const moves = legalMoves(state);
    // Rivals outweigh everything here, so every tried move scores below zero.
    const weights = { ...BEST_WEIGHTS, rivals: 50 };
    let reads = 0;
    const now = () => (reads++ === 0 ? 0 : 1e9);
    const move = chooseMove(state, moves, 'master', { random: seededRandom(1), now, weights, budget: { timeLimitMs: 100, horizon: 2 } });
    expect(move).toBe(rankMoves(state, moves, weights)[0].move);
  });

  it('values a finished game by the result', () => {
    const state = midGame();
    expect(state.over).toBe(true);
    expect(Number.isFinite(evaluate(state, 0))).toBe(true);
  });

  it('prefers a five-square piece that opens the board over a single', () => {
    const state = newGame('classic');
    const ranked = rankMoves(state, legalMoves(state), BEST_WEIGHTS);
    expect(PIECES[movePiece(ranked[0].move)].size).toBe(5);
    expect(PIECES[movePiece(ranked[ranked.length - 1].move)].size).toBeLessThan(5);
  });
});

describe('the worker’s message handler', () => {
  it('answers with a legal move and the request id', () => {
    const state = newGame('duo');
    const response = handleRequest({ requestId: 7, state, level: 'hard', seed: 1 });
    expect(response.requestId).toBe(7);
    expect(legalMoves(state)).toContain(response.move);
  });

  it('survives a trip through structured clone, as a real worker message does', () => {
    const state = structuredClone(newGame('classic'));
    const response = handleRequest({ requestId: 1, state, level: 'hard', seed: 1 });
    expect(legalMoves(state)).toContain(response.move);
  });

  it('reports a position with no move rather than throwing', () => {
    const state = newGame('classic');
    state.hands[0] = 0;
    expect(handleRequest({ requestId: 2, state, level: 'medium', seed: 1 })).toEqual({ requestId: 2, error: 'no legal move' });
  });
});

describe('the client', () => {
  it('answers in-process where there is no Worker', async () => {
    const client = createBlokusAiClient();
    const state = newGame('classic');
    await expect(client.requestMove({ state, level: 'easy', seed: 3 })).resolves.toSatisfy((move) => legalMoves(state).includes(move as number));
    client.terminate();
  });

  it('rejects when the AI has no move', async () => {
    const client = createBlokusAiClient();
    const state = newGame('classic');
    state.hands[0] = 0;
    await expect(client.requestMove({ state, level: 'easy', seed: 3 })).rejects.toThrow('no legal move');
    client.terminate();
  });
});
