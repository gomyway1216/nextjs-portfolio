import { describe, expect, it } from 'vitest';
import {
  boardFromMoves,
  canUndo,
  getHintMove,
  MoveRecord,
  undoLastTurn,
} from '@/components/game/Gomoku/history';
import { AI, BOARD_SIZE, GomokuBoard, PLAYER } from '@/components/game/Gomoku/types';

const emptyBoard = (): GomokuBoard =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

const human = (row: number, col: number): MoveRecord => ({ row, col, player: 'black' });
const ai = (row: number, col: number): MoveRecord => ({ row, col, player: 'white' });

describe('Gomoku move record', () => {
  it('rebuilds the board from the moves', () => {
    const board = boardFromMoves([human(7, 7), ai(7, 8), human(6, 6)]);
    expect(board[7][7]).toBe(PLAYER);
    expect(board[7][8]).toBe(AI);
    expect(board[6][6]).toBe(PLAYER);
    expect(board.flat().filter((c) => c !== null)).toHaveLength(3);
    expect(board).toHaveLength(BOARD_SIZE);
  });

  it('takes back the AI reply together with the human move before it', () => {
    const moves = [human(7, 7), ai(7, 8), human(6, 6), ai(5, 5)];
    expect(undoLastTurn(moves)).toEqual([human(7, 7), ai(7, 8)]);
  });

  it('takes back only the human move when the AI has not replied', () => {
    const moves = [human(7, 7), ai(7, 8), human(6, 6)];
    expect(undoLastTurn(moves)).toEqual([human(7, 7), ai(7, 8)]);
  });

  it('returns to the empty board after undoing the first turn', () => {
    expect(undoLastTurn([human(7, 7), ai(7, 8)])).toEqual([]);
  });

  it('has nothing to undo without a human move', () => {
    const none: MoveRecord[] = [];
    expect(canUndo(none)).toBe(false);
    expect(undoLastTurn(none)).toBe(none);
    expect(canUndo([human(7, 7)])).toBe(true);
  });

  it('does not mutate the record it is given', () => {
    const moves = [human(7, 7), ai(7, 8)];
    undoLastTurn(moves);
    expect(moves).toHaveLength(2);
  });
});

describe('Gomoku hint', () => {
  it('suggests the center on an empty board', () => {
    const mid = Math.floor(BOARD_SIZE / 2);
    expect(getHintMove(emptyBoard())).toEqual({ row: mid, col: mid });
  });

  it('suggests the human winning move, not a block', () => {
    const b = emptyBoard();
    // Human four (7,3)..(7,6) closed at (7,2): (7,7) wins. The AI also has a
    // four on row 9 that the hint must ignore in favour of winning outright.
    for (let c = 3; c <= 6; c += 1) b[7][c] = PLAYER;
    b[7][2] = AI;
    for (let c = 3; c <= 6; c += 1) b[9][c] = AI;
    b[9][2] = PLAYER;
    expect(getHintMove(b)).toEqual({ row: 7, col: 7 });
  });

  it('suggests blocking an AI four when the human cannot win', () => {
    const b = emptyBoard();
    for (let c = 3; c <= 6; c += 1) b[9][c] = AI;
    b[9][2] = PLAYER;
    b[5][5] = PLAYER;
    expect(getHintMove(b)).toEqual({ row: 9, col: 7 });
  });

  it('leaves the position it was given untouched', () => {
    const b = emptyBoard();
    b[7][7] = PLAYER;
    b[7][8] = AI;
    const before = JSON.stringify(b);
    const hint = getHintMove(b, 'easy');
    expect(JSON.stringify(b)).toBe(before);
    expect(hint && b[hint.row][hint.col]).toBeNull();
  });
});
