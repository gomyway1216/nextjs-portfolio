import { describe, expect, it } from 'vitest';
import {
  checkWinFromPosition,
  findWinner,
  getBestMove,
  getValidMoves,
  isBoardFull,
} from './GomokuAI';
import { AI, BOARD_SIZE, GomokuBoard, PLAYER, Player, Position } from './types';

/** Return a copy of `board` with `player` placed at `pos`. */
const withMove = (board: GomokuBoard, pos: Position, player: Player): GomokuBoard => {
  const copy = board.map((r) => [...r]);
  copy[pos.row][pos.col] = player;
  return copy;
};

const empty = (): GomokuBoard =>
  Array.from({ length: BOARD_SIZE }, () => Array<Player>(BOARD_SIZE).fill(null));

/** Place a horizontal run of `player` stones starting at (row, col). */
const placeRun = (
  board: GomokuBoard,
  row: number,
  col: number,
  len: number,
  player: Player,
  dr = 0,
  dc = 1
): void => {
  for (let i = 0; i < len; i++) {
    board[row + dr * i][col + dc * i] = player;
  }
};

describe('checkWinFromPosition', () => {
  it('detects a horizontal five', () => {
    const b = empty();
    placeRun(b, 7, 3, 5, PLAYER, 0, 1);
    const line = checkWinFromPosition(b, 7, 5, PLAYER);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('detects a vertical five', () => {
    const b = empty();
    placeRun(b, 2, 4, 5, AI, 1, 0);
    expect(checkWinFromPosition(b, 6, 4, AI)).not.toBeNull();
  });

  it('detects a diagonal (down-right) five', () => {
    const b = empty();
    placeRun(b, 1, 1, 5, PLAYER, 1, 1);
    expect(checkWinFromPosition(b, 3, 3, PLAYER)).not.toBeNull();
  });

  it('detects an anti-diagonal (down-left) five', () => {
    const b = empty();
    placeRun(b, 1, 10, 5, AI, 1, -1);
    expect(checkWinFromPosition(b, 3, 8, AI)).not.toBeNull();
  });

  it('does not report a win for only four in a row', () => {
    const b = empty();
    placeRun(b, 7, 3, 4, PLAYER, 0, 1);
    expect(checkWinFromPosition(b, 7, 4, PLAYER)).toBeNull();
  });

  it('reports null when the queried cell is not the player', () => {
    const b = empty();
    placeRun(b, 7, 3, 5, PLAYER, 0, 1);
    expect(checkWinFromPosition(b, 7, 5, AI)).toBeNull();
  });

  it('finds a run at the board edge', () => {
    const b = empty();
    placeRun(b, 0, 0, 5, AI, 0, 1);
    expect(checkWinFromPosition(b, 0, 0, AI)).not.toBeNull();
  });
});

describe('findWinner / isBoardFull', () => {
  it('finds no winner on an empty board', () => {
    expect(findWinner(empty())).toBeNull();
  });

  it('finds the winning player when a five exists', () => {
    const b = empty();
    placeRun(b, 5, 5, 5, PLAYER, 1, 1);
    expect(findWinner(b)).toBe(PLAYER);
  });

  it('detects a full board', () => {
    const full = Array.from({ length: BOARD_SIZE }, () =>
      Array<Player>(BOARD_SIZE).fill(AI)
    );
    expect(isBoardFull(full)).toBe(true);
    expect(isBoardFull(empty())).toBe(false);
  });
});

describe('getValidMoves', () => {
  it('returns the center for an empty board', () => {
    const moves = getValidMoves(empty());
    const mid = Math.floor(BOARD_SIZE / 2);
    expect(moves).toEqual([{ row: mid, col: mid }]);
  });

  it('only returns empty cells near existing stones', () => {
    const b = empty();
    b[7][7] = PLAYER;
    const moves = getValidMoves(b, 1);
    expect(moves.length).toBe(8); // 3x3 minus the occupied center
    expect(moves.every((m) => b[m.row][m.col] === null)).toBe(true);
  });
});

describe('getBestMove — tactics', () => {
  it('opens in the center on an empty board', () => {
    const mid = Math.floor(BOARD_SIZE / 2);
    expect(getBestMove(empty(), 'medium')).toEqual({ row: mid, col: mid });
  });

  it('completes its own five when one move away (horizontal)', () => {
    const b = empty();
    // AI has four in a row at row 7, cols 3..6; either (7,2) or (7,7) wins.
    placeRun(b, 7, 3, 4, AI, 0, 1);
    // give the player a stone elsewhere so it's plausibly AI's turn
    b[0][0] = PLAYER;
    const move = getBestMove(b, 'hard');
    expect(move).not.toBeNull();
    expect(checkWinFromPosition(withMove(b, move!, AI), move!.row, move!.col, AI)).not.toBeNull();
  });

  it('completes its own five on the open (left) side too', () => {
    const b = empty();
    placeRun(b, 5, 5, 4, AI, 0, 1); // cols 5..8
    b[9][9] = PLAYER;
    const move = getBestMove(b, 'hard');
    // Either end completes the five; both (5,4) and (5,9) are wins.
    expect([JSON.stringify({ row: 5, col: 4 }), JSON.stringify({ row: 5, col: 9 })]).toContain(
      JSON.stringify(move)
    );
  });

  it('blocks the human’s immediate winning four', () => {
    const b = empty();
    // Human has four at row 7, cols 4..7 with both ends open.
    placeRun(b, 7, 4, 4, PLAYER, 0, 1);
    // AI has a couple of unrelated stones (not a winning threat).
    b[0][0] = AI;
    b[0][1] = AI;
    const move = getBestMove(b, 'hard');
    // The only winning squares for the human are (7,3) and (7,8); AI must take one.
    expect([JSON.stringify({ row: 7, col: 3 }), JSON.stringify({ row: 7, col: 8 })]).toContain(
      JSON.stringify(move)
    );
  });

  it('prefers winning over blocking when both are available', () => {
    const b = empty();
    // AI four ready to win at (7,2) or (7,7).
    placeRun(b, 7, 3, 4, AI, 0, 1);
    // Human also four ready to win at (10,3) or (10,8).
    placeRun(b, 10, 4, 4, PLAYER, 0, 1);
    const move = getBestMove(b, 'hard');
    expect(move).not.toBeNull();
    // AI should take one of its own winning squares, not block.
    expect(checkWinFromPosition(withMove(b, move!, AI), move!.row, move!.col, AI)).not.toBeNull();
  });

  it('returns a legal empty cell', () => {
    const b = empty();
    b[7][7] = PLAYER;
    b[7][8] = AI;
    const move = getBestMove(b, 'medium');
    expect(move).not.toBeNull();
    expect(b[move!.row][move!.col]).toBeNull();
  });
});
