import { describe, it, expect } from 'vitest';
import {
  biggestMistakeIndex,
  boardsFromMoves,
  gradeForLoss,
  OPENING_BEST,
  reviewGame,
  reviewMove,
  solveBestMove,
  solveMargin,
  summarizeReview,
  type MoveRecord,
} from '@/components/game/TerritoryNumber/review';
import {
  emptyBoard,
  emptyCellIndices,
  evaluateBoard,
  isBoardFull,
  placeCard,
  remainingCards,
} from '@/components/game/TerritoryNumber/gameLogic';
import type { Board, PlayerSlot } from '@/components/game/TerritoryNumber/types';

const other = (slot: PlayerSlot): PlayerSlot => (slot === 'p1' ? 'p2' : 'p1');

/** Plain exhaustive minimax on the public game logic — the reference answer. */
function bruteMargin(board: Board, toMove: PlayerSlot): number {
  if (isBoardFull(board)) {
    const ev = evaluateBoard(board);
    const p1 = ev.p1Captures - ev.p2Captures;
    return toMove === 'p1' ? p1 : 0 - p1;
  }
  let best = -Infinity;
  for (const card of remainingCards(board)) {
    for (const cell of emptyCellIndices(board)) {
      const score = 0 - bruteMargin(placeCard(board, cell, card, toMove), other(toMove));
      if (score > best) best = score;
    }
  }
  return best;
}

/** Deterministic pseudo-random stream so failures are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomMoves(count: number, first: PlayerSlot, rand: () => number): MoveRecord[] {
  const moves: MoveRecord[] = [];
  let board = emptyBoard();
  let slot = first;
  for (let i = 0; i < count; i++) {
    const cells = emptyCellIndices(board);
    const cards = remainingCards(board);
    const move: MoveRecord = {
      slot,
      cellIndex: cells[Math.floor(rand() * cells.length)],
      card: cards[Math.floor(rand() * cards.length)],
    };
    moves.push(move);
    board = placeCard(board, move.cellIndex, move.card, slot);
    slot = other(slot);
  }
  return moves;
}

describe('solveMargin', () => {
  it('returns the actual result on a full board, from either side', () => {
    const rand = lcg(7);
    for (let g = 0; g < 20; g++) {
      const board = boardsFromMoves(randomMoves(9, 'p1', rand))[9];
      const ev = evaluateBoard(board);
      expect(solveMargin(board, 'p1')).toBe(ev.p1Captures - ev.p2Captures);
      expect(solveMargin(board, 'p2')).toBe(ev.p2Captures - ev.p1Captures);
    }
  });

  it('agrees with exhaustive minimax on random positions with 1–5 empty cells', () => {
    const rand = lcg(2024);
    for (let g = 0; g < 60; g++) {
      const first: PlayerSlot = g % 2 === 0 ? 'p1' : 'p2';
      const filled = 4 + (g % 5); // 4..8 cards down
      const moves = randomMoves(filled, first, rand);
      const board = boardsFromMoves(moves)[filled];
      const toMove = filled % 2 === 0 ? first : other(first);
      expect(solveMargin(board, toMove)).toBe(bruteMargin(board, toMove));
    }
  });

  it('is zero-sum: the margin after a move is the negated margin for the opponent', () => {
    const rand = lcg(99);
    for (let g = 0; g < 10; g++) {
      const board = boardsFromMoves(randomMoves(3, 'p1', rand))[3];
      const best = solveBestMove(board, 'p2');
      const after = placeCard(board, best.cellIndex, best.card, 'p2');
      expect(solveMargin(board, 'p2')).toBe(best.margin);
      expect(solveMargin(after, 'p1')).toBe(0 - best.margin);
    }
  });

  it('solves the empty board quickly, and the first player wins it', () => {
    const start = Date.now();
    const margin = solveMargin(emptyBoard(), 'p1');
    expect(Date.now() - start).toBeLessThan(2000);
    expect(margin).toBeGreaterThan(0);
    // The game is symmetric in the two colours.
    expect(solveMargin(emptyBoard(), 'p2')).toBe(margin);
  });
});

describe('solveBestMove', () => {
  it('returns a legal placement that achieves the solved margin', () => {
    const rand = lcg(31);
    for (let g = 0; g < 20; g++) {
      const filled = 3 + (g % 6);
      const board = boardsFromMoves(randomMoves(filled, 'p1', rand))[filled];
      const toMove: PlayerSlot = filled % 2 === 0 ? 'p1' : 'p2';
      const best = solveBestMove(board, toMove);
      expect(emptyCellIndices(board)).toContain(best.cellIndex);
      expect(remainingCards(board)).toContain(best.card);
      const after = placeCard(board, best.cellIndex, best.card, toMove);
      expect(0 - solveMargin(after, other(toMove))).toBe(best.margin);
      expect(best.margin).toBe(solveMargin(board, toMove));
    }
  });

  it('throws on a full board', () => {
    const board = boardsFromMoves(randomMoves(9, 'p1', lcg(1)))[9];
    expect(() => solveBestMove(board, 'p1')).toThrow();
  });
});

describe('OPENING_BEST', () => {
  it('is what the solver finds on the empty board, for either colour', () => {
    expect(solveBestMove(emptyBoard(), 'p1')).toEqual(OPENING_BEST);
    expect(solveBestMove(emptyBoard(), 'p2')).toEqual(OPENING_BEST);
  });
});

describe('reviewMove', () => {
  // p1: 9 @0, 8 @1 — p2: 1 @3, 2 @4. p1 to move with 3,4,5,6,7 left.
  const base = boardsFromMoves([
    { slot: 'p1', card: 9, cellIndex: 0 },
    { slot: 'p2', card: 1, cellIndex: 3 },
    { slot: 'p1', card: 8, cellIndex: 1 },
    { slot: 'p2', card: 2, cellIndex: 4 },
  ])[4];

  it('grades the solver’s own choice as best with no loss', () => {
    const best = solveBestMove(base, 'p1');
    const review = reviewMove(base, { slot: 'p1', card: best.card, cellIndex: best.cellIndex });
    expect(review.loss).toBe(0);
    expect(review.grade).toBe('best');
    expect(review.best).toEqual({ card: best.card, cellIndex: best.cellIndex });
    expect(review.playedMargin).toBe(review.bestMargin);
  });

  it('keeps the played move as "best" when it ties the solver’s pick', () => {
    const top = solveBestMove(base, 'p1');
    for (const card of remainingCards(base)) {
      for (const cellIndex of emptyCellIndices(base)) {
        const review = reviewMove(base, { slot: 'p1', card, cellIndex });
        expect(review.bestMargin).toBe(top.margin);
        expect(review.loss).toBeGreaterThanOrEqual(0);
        if (review.loss === 0) expect(review.best).toEqual({ card, cellIndex });
        else expect(review.best).toEqual({ card: top.card, cellIndex: top.cellIndex });
      }
    }
  });

  it('measures the loss of every legal move against exhaustive minimax', () => {
    const bestBrute = bruteMargin(base, 'p1');
    for (const card of remainingCards(base)) {
      for (const cellIndex of emptyCellIndices(base)) {
        const after = placeCard(base, cellIndex, card, 'p1');
        const review = reviewMove(base, { slot: 'p1', card, cellIndex });
        expect(review.playedMargin).toBe(0 - bruteMargin(after, 'p2'));
        expect(review.loss).toBe(bestBrute - review.playedMargin);
      }
    }
  });

  it('reviews an opening move for either colour against the solved empty board', () => {
    const value = solveMargin(emptyBoard(), 'p1');
    const top = solveBestMove(emptyBoard(), 'p1');
    for (const slot of ['p1', 'p2'] as const) {
      const good = reviewMove(emptyBoard(), { slot, card: top.card, cellIndex: top.cellIndex });
      expect(good.bestMargin).toBe(value);
      expect(good.loss).toBe(0);
      const weak = reviewMove(emptyBoard(), { slot, card: 1, cellIndex: 1 });
      expect(weak.bestMargin).toBe(value);
      expect(weak.loss).toBeGreaterThan(0);
      expect(weak.best).toEqual({ card: top.card, cellIndex: top.cellIndex });
    }
  });

  it('rejects a move onto an occupied cell or with a spent card', () => {
    expect(() => reviewMove(base, { slot: 'p1', card: 5, cellIndex: 0 })).toThrow();
    expect(() => reviewMove(base, { slot: 'p1', card: 9, cellIndex: 8 })).toThrow();
  });
});

describe('gradeForLoss', () => {
  it('maps lines lost to a grade', () => {
    expect(gradeForLoss(0)).toBe('best');
    expect(gradeForLoss(1)).toBe('inaccuracy');
    expect(gradeForLoss(2)).toBe('mistake');
    expect(gradeForLoss(5)).toBe('mistake');
  });
});

describe('reviewGame', () => {
  it('reviews all nine moves and the losses explain the final result', () => {
    const rand = lcg(555);
    for (let g = 0; g < 6; g++) {
      const first: PlayerSlot = g % 2 === 0 ? 'p1' : 'p2';
      const moves = randomMoves(9, first, rand);
      const reviews = reviewGame(moves);
      expect(reviews).toHaveLength(9);

      // Start from the perfect-play value for the first player and apply each
      // side's losses: what is left must be the real final margin.
      const firstLoss = summarizeReview(reviews, first).linesLost;
      const secondLoss = summarizeReview(reviews, other(first)).linesLost;
      const ev = evaluateBoard(boardsFromMoves(moves)[9]);
      const p1Margin = ev.p1Captures - ev.p2Captures;
      const finalForFirst = first === 'p1' ? p1Margin : 0 - p1Margin;
      expect(reviews[0].bestMargin - firstLoss + secondLoss).toBe(finalForFirst);

      // The last move is forced, so it can never lose anything.
      expect(reviews[8].loss).toBe(0);
    }
  });

  it('a perfectly played game has no losses and no biggest mistake', () => {
    const moves: MoveRecord[] = [];
    let board = emptyBoard();
    let slot: PlayerSlot = 'p1';
    for (let i = 0; i < 9; i++) {
      const best = solveBestMove(board, slot);
      moves.push({ slot, card: best.card, cellIndex: best.cellIndex });
      board = placeCard(board, best.cellIndex, best.card, slot);
      slot = other(slot);
    }
    const reviews = reviewGame(moves);
    expect(reviews.every(r => r.grade === 'best')).toBe(true);
    expect(summarizeReview(reviews, 'p1')).toEqual({ moves: 5, bestMoves: 5, linesLost: 0 });
    expect(summarizeReview(reviews, 'p2')).toEqual({ moves: 4, bestMoves: 4, linesLost: 0 });
    expect(biggestMistakeIndex(reviews, 'p1')).toBeNull();
    const ev = evaluateBoard(board);
    expect(ev.p1Captures - ev.p2Captures).toBe(reviews[0].bestMargin);
  });
});

describe('biggestMistakeIndex', () => {
  it('points at the first costliest move of the given player only', () => {
    const rand = lcg(4242);
    let checked = 0;
    for (let g = 0; g < 8; g++) {
      const reviews = reviewGame(randomMoves(9, 'p1', rand));
      const idx = biggestMistakeIndex(reviews, 'p1');
      const losses = reviews.map(r => (r.move.slot === 'p1' ? r.loss : 0));
      const worst = Math.max(...losses);
      if (worst === 0) {
        expect(idx).toBeNull();
      } else {
        expect(idx).toBe(losses.indexOf(worst));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
