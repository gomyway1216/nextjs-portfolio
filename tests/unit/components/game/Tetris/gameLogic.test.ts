import { describe, expect, it } from 'vitest';
import {
  calculateScore,
  clearLines,
  createEmptyBoard,
  createTetromino,
  getDropDistance,
  getFullRows,
  getGhostPiecePosition,
  getKicks,
  getLevel,
  isValidPosition,
  newBag,
  refillQueue,
  rotateMatrix,
  shuffle,
  tryRotate,
} from '@/components/game/Tetris/gameLogic';
import {
  ALL_TYPES,
  BOARD_WIDTH,
  TOTAL_HEIGHT,
  TetrominoType,
} from '@/components/game/Tetris/types';

const filledRow = () => Array(BOARD_WIDTH).fill('T');

describe('7-bag randomizer', () => {
  it('newBag contains each of the 7 pieces exactly once', () => {
    const bag = newBag();
    expect(bag).toHaveLength(7);
    expect(new Set(bag)).toEqual(new Set(ALL_TYPES));
  });

  it('refillQueue keeps the queue above the requested size and never starves', () => {
    let queue: TetrominoType[] = [];
    // Deterministic RNG so the test is stable.
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 30; i++) {
      queue = refillQueue(queue, 5, rng);
      expect(queue.length).toBeGreaterThan(5);
      queue.shift();
    }
  });

  it('shuffle preserves multiset membership', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    const out = shuffle(arr);
    expect(out).toHaveLength(arr.length);
    expect([...out].sort()).toEqual([...arr].sort());
    // original not mutated
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('rotateMatrix', () => {
  it('rotates a matrix clockwise', () => {
    const m = [
      [1, 0],
      [0, 0],
    ];
    expect(rotateMatrix(m, 1)).toEqual([
      [0, 1],
      [0, 0],
    ]);
  });

  it('cw then ccw returns the original', () => {
    const m = [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ];
    expect(rotateMatrix(rotateMatrix(m, 1), -1)).toEqual(m);
  });

  it('four clockwise rotations return the original', () => {
    const m = [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ];
    let r = m;
    for (let i = 0; i < 4; i++) r = rotateMatrix(r, 1);
    expect(r).toEqual(m);
  });
});

describe('SRS rotation + wall kicks', () => {
  it('rotates a T-piece in open space (state advances 0 -> 1)', () => {
    const board = createEmptyBoard();
    const t = createTetromino('T');
    const rotated = tryRotate(board, t, 1);
    expect(rotated).not.toBeNull();
    expect(rotated!.rotation).toBe(1);
  });

  it('O-piece never rotates (returns null)', () => {
    const board = createEmptyBoard();
    const o = createTetromino('O');
    expect(tryRotate(board, o, 1)).toBeNull();
  });

  it('wall-kicks a piece off the left wall', () => {
    const board = createEmptyBoard();
    // Push an L piece to the far left where a naive rotation would clip out.
    const l = createTetromino('L');
    const atWall = { ...l, position: { x: -1, y: 5 } };
    const rotated = tryRotate(board, atWall, 1);
    expect(rotated).not.toBeNull();
    // Must land fully in-bounds after the kick.
    expect(isValidPosition(board, rotated!)).toBe(true);
  });

  it('exposes distinct kick tables for I vs JLSTZ pieces', () => {
    const iKicks = getKicks('I', 0, 1);
    const tKicks = getKicks('T', 0, 1);
    expect(iKicks).not.toEqual(tKicks);
    expect(getKicks('O', 0, 1)).toEqual([{ x: 0, y: 0 }]);
  });

  it('an I-piece against the right wall kicks to a valid position', () => {
    const board = createEmptyBoard();
    const i = createTetromino('I');
    const atRight = { ...i, position: { x: BOARD_WIDTH - 2, y: 5 } };
    const rotated = tryRotate(board, atRight, 1);
    expect(rotated).not.toBeNull();
    expect(isValidPosition(board, rotated!)).toBe(true);
  });
});

describe('collision / bounds', () => {
  it('rejects out-of-bounds and accepts in-bounds positions', () => {
    const board = createEmptyBoard();
    const t = createTetromino('T');
    expect(isValidPosition(board, t)).toBe(true);
    expect(isValidPosition(board, { ...t, position: { x: -5, y: 0 } })).toBe(false);
    expect(isValidPosition(board, { ...t, position: { x: 0, y: TOTAL_HEIGHT } })).toBe(false);
  });

  it('detects collision with existing blocks', () => {
    const board = createEmptyBoard();
    // Fill a cell, then place a T so one of its filled cells overlaps it.
    // T shape rows: [0,1,0] / [1,1,1]. At x=3,y=Y the middle row occupies
    // columns 3,4,5 at board row Y+1.
    const y = TOTAL_HEIGHT - 3;
    board[y + 1][4] = 'I';
    const t = createTetromino('T');
    const overlapping = { ...t, position: { x: 3, y } };
    expect(isValidPosition(board, overlapping)).toBe(false);
    // Shifted up by one row there is no overlap.
    expect(isValidPosition(board, { ...t, position: { x: 3, y: y - 1 } })).toBe(true);
  });

  it('a fresh piece spawning into a filled top is invalid (block-out)', () => {
    const board = createEmptyBoard();
    // Fill the spawn rows so no new piece can appear cleanly.
    for (let y = 0; y < 4; y++) board[y] = filledRow();
    for (const type of ALL_TYPES) {
      expect(isValidPosition(board, createTetromino(type))).toBe(false);
    }
  });
});

describe('line clearing', () => {
  it('clears a single full row and preserves the rest', () => {
    const board = createEmptyBoard();
    board[TOTAL_HEIGHT - 1] = filledRow();
    board[TOTAL_HEIGHT - 2][0] = 'J';
    const { newBoard, linesCleared } = clearLines(board);
    expect(linesCleared).toBe(1);
    expect(newBoard).toHaveLength(TOTAL_HEIGHT);
    // The J block dropped down one row.
    expect(newBoard[TOTAL_HEIGHT - 1][0]).toBe('J');
    // Bottom row no longer completely full.
    expect(newBoard[TOTAL_HEIGHT - 1].every(c => c !== null)).toBe(false);
  });

  it('clears a Tetris (4 rows) at once', () => {
    const board = createEmptyBoard();
    for (let i = 1; i <= 4; i++) board[TOTAL_HEIGHT - i] = filledRow();
    const { newBoard, linesCleared } = clearLines(board);
    expect(linesCleared).toBe(4);
    expect(newBoard.every(row => row.every(c => c === null))).toBe(true);
  });

  it('getFullRows finds all complete rows', () => {
    const board = createEmptyBoard();
    board[TOTAL_HEIGHT - 1] = filledRow();
    board[TOTAL_HEIGHT - 3] = filledRow();
    expect(getFullRows(board)).toEqual([TOTAL_HEIGHT - 3, TOTAL_HEIGHT - 1]);
  });

  it('does not clear a partially-filled row', () => {
    const board = createEmptyBoard();
    board[TOTAL_HEIGHT - 1] = filledRow();
    board[TOTAL_HEIGHT - 1][5] = null;
    expect(clearLines(board).linesCleared).toBe(0);
  });
});

describe('scoring + leveling', () => {
  it('awards guideline points scaled by level', () => {
    expect(calculateScore(1, 1)).toBe(100);
    expect(calculateScore(2, 1)).toBe(300);
    expect(calculateScore(3, 1)).toBe(500);
    expect(calculateScore(4, 1)).toBe(800); // Tetris
    expect(calculateScore(4, 3)).toBe(2400); // 800 * level 3
    expect(calculateScore(0, 5)).toBe(0);
  });

  it('level increases every 10 lines (1-based)', () => {
    expect(getLevel(0)).toBe(1);
    expect(getLevel(9)).toBe(1);
    expect(getLevel(10)).toBe(2);
    expect(getLevel(25)).toBe(3);
  });
});

describe('ghost / drop distance', () => {
  it('ghost lands at the floor on an empty board', () => {
    const board = createEmptyBoard();
    const t = createTetromino('T');
    const ghostY = getGhostPiecePosition(board, t);
    const dist = getDropDistance(board, t);
    expect(ghostY).toBeGreaterThan(t.position.y);
    expect(dist).toBe(ghostY - t.position.y);
    // Dropping there must be valid and one lower must be invalid.
    expect(isValidPosition(board, { ...t, position: { ...t.position, y: ghostY } })).toBe(true);
    expect(isValidPosition(board, { ...t, position: { ...t.position, y: ghostY + 1 } })).toBe(false);
  });
});
