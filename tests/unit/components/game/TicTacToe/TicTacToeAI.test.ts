import { describe, it, expect } from 'vitest';
import {
  checkWinner,
  isBoardFull,
  findWinningMove,
  getOptimalMove,
  getBestMove,
  WIN_LINES
} from '@/components/game/TicTacToe/TicTacToeAI';
import { AI, PLAYER, type Player } from '@/components/game/TicTacToe/types';

const b = (s: string): Player[] =>
  s.split('').map(c => (c === 'X' ? 'X' : c === 'O' ? 'O' : null));

describe('checkWinner', () => {
  it('detects each winning line', () => {
    for (const [a, bb, c] of WIN_LINES) {
      const board: Player[] = Array(9).fill(null);
      board[a] = 'X';
      board[bb] = 'X';
      board[c] = 'X';
      const res = checkWinner(board);
      expect(res.winner).toBe('X');
      expect(res.line).toEqual([a, bb, c]);
    }
  });

  it('returns null on an empty or non-winning board', () => {
    expect(checkWinner(Array(9).fill(null)).winner).toBeNull();
    expect(checkWinner(b('XOXOXOOXO')).winner).toBeNull();
  });
});

describe('isBoardFull', () => {
  it('is false with empty cells, true when full', () => {
    expect(isBoardFull(b('XOXOXOXOX'))).toBe(true);
    expect(isBoardFull(b('XOX...XOX'))).toBe(false);
  });
});

describe('findWinningMove', () => {
  it('finds an immediate winning cell', () => {
    // X at 0,1 → completing at 2 wins
    expect(findWinningMove(b('XX.......'), 'X')).toBe(2);
  });
  it('returns -1 when no immediate win exists', () => {
    expect(findWinningMove(b('X........'), 'X')).toBe(-1);
  });
  it('does not mutate the board', () => {
    const board = b('XX.......');
    findWinningMove(board, 'X');
    expect(board).toEqual(b('XX.......'));
  });
});

describe('getOptimalMove — immediate win and block', () => {
  it('takes an immediate win when available', () => {
    // AI (O) at 0,1; empty 2 completes the row → must play 2
    expect(getOptimalMove(b('OO.......'), AI)).toBe(2);
  });

  it('blocks the opponent when they threaten a win', () => {
    // Player (X) at 0,1 threatens 2; AI has no win → must block at 2
    expect(getOptimalMove(b('XX...O...'), AI)).toBe(2);
  });

  it('prefers winning over blocking', () => {
    // AI (O) completes its row at 2 (0,1,2); X threatens 5 (3,4,5). Win beats block.
    // Only cell 2 is an immediate O win here, so the choice is unambiguous.
    expect(getOptimalMove(b('OO.XX....'), AI)).toBe(2);
  });
});

/** Play a full game, AI = O, opponent = optimal X. AI must never lose. */
function playGame(aiMoveFn: (board: Player[]) => number, aiGoesFirst: boolean): 'ai' | 'player' | 'draw' {
  const board: Player[] = Array(9).fill(null);
  let aiTurn = aiGoesFirst;
  while (true) {
    const { winner } = checkWinner(board);
    if (winner === AI) return 'ai';
    if (winner === PLAYER) return 'player';
    if (isBoardFull(board)) return 'draw';

    if (aiTurn) {
      const m = aiMoveFn(board);
      board[m] = AI;
    } else {
      // Opponent also plays perfectly.
      const m = getOptimalMove(board, PLAYER);
      board[m] = PLAYER;
    }
    aiTurn = !aiTurn;
  }
}

describe('master minimax is unbeatable', () => {
  const master = (board: Player[]) => getBestMove(board, 'master', () => 0);

  it('never loses going first vs a perfect opponent', () => {
    expect(playGame(master, true)).not.toBe('player');
  });

  it('never loses going second vs a perfect opponent', () => {
    expect(playGame(master, false)).not.toBe('player');
  });

  it('draws when both sides play perfectly (going first)', () => {
    expect(playGame(master, true)).toBe('draw');
  });
});

describe('master vs every possible opponent line — never loses', () => {
  // Exhaustive: AI = master (O) responding, opponent (X) tries ALL move sequences.
  function opponentCannotBeatMaster(board: Player[], playerToMove: boolean): boolean {
    const { winner } = checkWinner(board);
    if (winner === PLAYER) return false; // opponent found a win → master failed
    if (winner === AI) return true;
    if (isBoardFull(board)) return true;

    if (playerToMove) {
      // Try every opponent move; master must survive all of them.
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = PLAYER;
          const ok = opponentCannotBeatMaster(board, false);
          board[i] = null;
          if (!ok) return false;
        }
      }
      return true;
    } else {
      const m = getBestMove(board, 'master', () => 0);
      board[m] = AI;
      const ok = opponentCannotBeatMaster(board, true);
      board[m] = null;
      return ok;
    }
  }

  it('as second player, master loses to no opponent line', () => {
    expect(opponentCannotBeatMaster(Array(9).fill(null), true)).toBe(true);
  });

  it('as first player, master loses to no opponent line', () => {
    const board: Player[] = Array(9).fill(null);
    const first = getBestMove(board, 'master', () => 0);
    board[first] = AI;
    expect(opponentCannotBeatMaster(board, true)).toBe(true);
  });
});

describe('getBestMove blunder behavior', () => {
  it('easy still grabs a free immediate win even while blundering', () => {
    // rng() = 0 forces the blunder branch; findWinningMove should still fire.
    expect(getBestMove(b('OO.......'), 'easy', () => 0)).toBe(2);
  });

  it('easy returns a legal empty cell when blundering with no win', () => {
    const board = b('X.O.X.O..');
    const m = getBestMove(board, 'easy', () => 0.5);
    expect(board[m]).toBeNull();
  });

  it('master ignores rng and always plays optimally', () => {
    // Even with rng forcing "blunder", master (rate 0) must block.
    expect(getBestMove(b('XX...O...'), 'master', () => 0)).toBe(2);
  });

  it('returns -1 on a full board', () => {
    expect(getBestMove(b('XOXOXOOXO'), 'master')).toBe(-1);
  });

  // rng is consulted twice: once to trigger the blunder, once to pick the cell.
  const seq = (...vals: number[]) => {
    let i = 0;
    return () => vals[Math.min(i++, vals.length - 1)];
  };

  it('never returns an out-of-bounds cell when the index rng() >= 1', () => {
    // First call (0) enters the blunder branch; second call (1) would over-index
    // the cells array without clamping.
    const board = b('X.O.X.O..');
    const m = getBestMove(board, 'easy', seq(0, 1));
    expect(m).not.toBeUndefined();
    expect(board[m]).toBeNull();
  });

  it('never returns an out-of-bounds cell when the index rng() is negative', () => {
    const board = b('X.O.X.O..');
    const m = getBestMove(board, 'easy', seq(0, -0.5));
    expect(board[m]).toBeNull();
  });
});
