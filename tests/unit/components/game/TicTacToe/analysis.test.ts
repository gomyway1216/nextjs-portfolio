import { describe, it, expect } from 'vitest';
import {
  AI_MARK,
  boardAfter,
  evaluatePosition,
  getHint,
  HUMAN_MARK,
  reviewGame,
  undoLastPlayerMove,
  type Mark,
  type MoveRecord
} from '@/components/game/TicTacToe/analysis';
import { checkWinner, getOptimalMove, isBoardFull } from '@/components/game/TicTacToe/TicTacToeAI';
import type { Player } from '@/components/game/TicTacToe/types';

const b = (s: string): Player[] =>
  s.split('').map(c => (c === 'X' ? 'X' : c === 'O' ? 'O' : null));

/** A game from a list of cells, marks alternating, X first unless told otherwise. */
const game = (cells: number[], first: Mark = 'X'): MoveRecord[] =>
  cells.map((cell, i) => ({
    cell,
    mark: i % 2 === 0 ? first : first === 'X' ? 'O' : 'X'
  }));

describe('evaluatePosition', () => {
  it('calls the empty board a draw for either side', () => {
    expect(evaluatePosition(b('.........'), 'X')).toBe('draw');
    expect(evaluatePosition(b('.........'), 'O')).toBe('draw');
  });

  it('sees an immediate win', () => {
    expect(evaluatePosition(b('XX.OO....'), 'X')).toBe('win');
  });

  it('sees a fork two moves ahead, from both sides of it', () => {
    // X (0, 4) can play 3, threatening both 5 and 6; O (1, 8) has no threat of its own.
    expect(evaluatePosition(b('XO..X...O'), 'X')).toBe('win');
    expect(evaluatePosition(b('XO.XX...O'), 'O')).toBe('loss');
  });

  it('reports a decided position as lost for the side to move', () => {
    expect(evaluatePosition(b('XXXOO....'), 'O')).toBe('loss');
  });

  it('does not mutate the board', () => {
    const board = b('X...O....');
    evaluatePosition(board, 'X');
    expect(board).toEqual(b('X...O....'));
  });
});

describe('getHint', () => {
  it('takes the immediate win', () => {
    expect(getHint(b('XX.OO....'), 'X')).toEqual({ cell: 2, outcome: 'win' });
  });

  it('blocks when that is the only way to hold the draw', () => {
    expect(getHint(b('X...O.O..'), 'X')).toEqual({ cell: 2, outcome: 'draw' });
  });

  it('prefers the center on an empty board', () => {
    expect(getHint(b('.........'), 'X')).toEqual({ cell: 4, outcome: 'draw' });
  });

  it('still suggests a legal move in a lost position', () => {
    // O (0, 6, 8) threatens both 3 and 7; X (2, 4) has no win of its own.
    const lost = b('O.X.X.O.O');
    const hint = getHint(lost, 'X');
    expect(hint?.outcome).toBe('loss');
    expect(lost[hint!.cell]).toBeNull();
  });

  it('returns null once the game is over', () => {
    expect(getHint(b('XXXOO....'), 'O')).toBeNull();
    expect(getHint(b('XOXXOOOXX'), 'O')).toBeNull();
  });

  it('matches the value of the AI’s own perfect player in every reachable position', () => {
    const flip = { win: 'loss', loss: 'win', draw: 'draw' } as const;
    const seen = new Set<string>();
    const walk = (board: Player[], toMove: Mark) => {
      const key = board.map(c => c ?? '.').join('');
      if (seen.has(key)) return;
      seen.add(key);
      if (checkWinner(board).winner || isBoardFull(board)) {
        expect(getHint(board, toMove)).toBeNull();
        return;
      }
      const other: Mark = toMove === 'X' ? 'O' : 'X';
      const hint = getHint(board, toMove)!;
      expect(board[hint.cell]).toBeNull();
      expect(hint.outcome).toBe(evaluatePosition(board, toMove));
      const afterHint = [...board];
      afterHint[hint.cell] = toMove;
      expect(flip[evaluatePosition(afterHint, other)]).toBe(hint.outcome);
      const afterAi = [...board];
      afterAi[getOptimalMove([...board], toMove)] = toMove;
      expect(flip[evaluatePosition(afterAi, other)]).toBe(hint.outcome);
      for (let i = 0; i < 9; i++) {
        if (board[i] !== null) continue;
        const next = [...board];
        next[i] = toMove;
        walk(next, other);
      }
    };
    walk(b('.........'), 'X');
    // The well-known count of positions reachable in legal play.
    expect(seen.size).toBe(5478);
  });
});

describe('boardAfter', () => {
  const moves = game([4, 0, 8]);
  it('replays the whole game by default and a prefix on request', () => {
    expect(boardAfter(moves)).toEqual(b('O...X...X'));
    expect(boardAfter(moves, 1)).toEqual(b('....X....'));
    expect(boardAfter(moves, 0)).toEqual(b('.........'));
    expect(boardAfter(moves, 99)).toEqual(b('O...X...X'));
  });
});

describe('undoLastPlayerMove', () => {
  it('removes the human move and the AI reply after it', () => {
    expect(undoLastPlayerMove(game([4, 0, 8, 2]))).toEqual(game([4, 0]));
  });

  it('removes just the human move when the AI has not replied', () => {
    expect(undoLastPlayerMove(game([4, 0, 8]))).toEqual(game([4, 0]));
  });

  it('keeps an AI opening move and leaves the human to move', () => {
    const opening = [{ cell: 4, mark: AI_MARK }];
    expect(undoLastPlayerMove(game([4, 0, 8], AI_MARK))).toEqual(opening);
    expect(undoLastPlayerMove(opening)).toEqual(opening);
  });

  it('does nothing to an empty game and does not mutate its input', () => {
    expect(undoLastPlayerMove([])).toEqual([]);
    const moves = game([4, 0]);
    undoLastPlayerMove(moves);
    expect(moves).toEqual(game([4, 0]));
  });
});

describe('reviewGame', () => {
  it('grades a perfectly played draw as all good', () => {
    const reviews = reviewGame(game([4, 0, 2, 6, 3, 5, 1, 7, 8]));
    expect(reviews).toHaveLength(9);
    for (const review of reviews) {
      expect(review).toMatchObject({ grade: 'good', before: 'draw', after: 'draw' });
      expect(review.bestCells).toContain(review.cell);
    }
  });

  it('flags the move that lost a drawn game and lists what would have held', () => {
    // X takes the center and O answers on an edge, which loses by force.
    const reviews = reviewGame(game([4, 1, 0, 8, 6, 2, 3]));
    expect(reviews).toHaveLength(7);
    expect(reviews[1]).toMatchObject({
      mark: 'O',
      cell: 1,
      grade: 'blunder',
      before: 'draw',
      after: 'loss',
      bestCells: [0, 2, 6, 8]
    });
    expect(reviews.filter(r => r.mark === 'X').every(r => r.grade === 'good')).toBe(true);
    expect(reviews[2]).toMatchObject({ before: 'win', after: 'win' });
    // O is lost whatever it plays next: graded good, with every legal cell listed.
    expect(reviews[3]).toMatchObject({ grade: 'good', before: 'loss', after: 'loss' });
    expect(reviews[3].bestCells).toEqual([2, 3, 5, 6, 7, 8]);
  });

  it('flags a win let slip to a draw', () => {
    const reviews = reviewGame(game([4, 1, 7]));
    expect(reviews[2]).toMatchObject({ grade: 'missedWin', before: 'win', after: 'draw' });
    expect(reviews[2].bestCells).not.toContain(7);
    expect(reviews[2].bestCells.length).toBeGreaterThan(0);
  });

  it('flags throwing away a win for a loss as a blunder', () => {
    // X (0, 1) wins at 2 but plays 8, and O (3, 4) wins at 5.
    const reviews = reviewGame(game([0, 3, 1, 4, 8, 5]));
    expect(reviews[4]).toMatchObject({ grade: 'blunder', before: 'win', after: 'loss', bestCells: [2] });
    expect(reviews[5]).toMatchObject({ grade: 'good', before: 'win', after: 'win' });
  });

  it('works when the AI moved first', () => {
    const reviews = reviewGame(game([4, 1], AI_MARK));
    expect(reviews[0]).toMatchObject({ mark: AI_MARK, grade: 'good' });
    expect(reviews[1]).toMatchObject({ mark: HUMAN_MARK, grade: 'blunder', bestCells: [0, 2, 6, 8] });
  });

  it('stops at a move that could not have been played', () => {
    expect(reviewGame(game([4, 4, 0]))).toHaveLength(1);
    // X wins on move 5; anything recorded after that is ignored.
    expect(reviewGame(game([0, 3, 1, 4, 2, 5]))).toHaveLength(5);
  });
});
