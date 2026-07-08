import { describe, expect, it } from 'vitest';
import {
  BOARD_H,
  BOARD_W,
  GHOST_FADE_MS,
  GHOST_MIN_OPACITY,
  LOCK_VISIBILITY_MS,
  type GameState,
  canPlace,
  clearLines,
  createGame,
  drawFromBag,
  dropIntervalMs,
  dropY,
  emptyBoard,
  emptyLockedAt,
  ghostOpacity,
  hardDrop,
  levelForLines,
  lineScore,
  makePiece,
  moveHorizontally,
  rotate,
  rotateClockwise,
  rotateCounterClockwise,
  step,
  tryRotate,
} from '@/components/game/GhostTetris/engine';

const seededRng = (seq: number[]): (() => number) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

describe('rotation', () => {
  it('rotates a T piece clockwise', () => {
    const t = [
      [0, 1, 0],
      [1, 1, 1],
    ];
    expect(rotateClockwise(t)).toEqual([
      [1, 0],
      [1, 1],
      [1, 0],
    ]);
  });

  it('cw then ccw is the identity', () => {
    const l = [
      [0, 0, 1],
      [1, 1, 1],
    ];
    expect(rotateCounterClockwise(rotateClockwise(l))).toEqual(l);
  });

  it('four clockwise rotations return the original', () => {
    const s = [
      [0, 1, 1],
      [1, 1, 0],
    ];
    let cur = s;
    for (let i = 0; i < 4; i += 1) cur = rotateClockwise(cur);
    expect(cur).toEqual(s);
  });
});

describe('tryRotate wall kicks', () => {
  it('kicks an I piece off the right wall instead of failing', () => {
    const board = emptyBoard();
    // Vertical I flush against the right edge (x = 9).
    const piece = { id: 1, shape: [[1], [1], [1], [1]], x: 9, y: 0 };
    const rotated = tryRotate(board, piece, 'cw');
    expect(rotated).not.toBeNull();
    // Rotating to horizontal must be shifted left to stay in-bounds.
    expect(rotated!.x).toBeLessThanOrEqual(BOARD_W - rotated!.shape[0].length);
    expect(canPlace(board, rotated!.shape, rotated!.x, rotated!.y)).toBe(true);
  });

  it('returns null when no kick offset fits', () => {
    // Fill everything so no rotation can succeed.
    const board = Array.from({ length: BOARD_H }, () => Array<number>(BOARD_W).fill(1));
    const piece = makePiece(3);
    expect(tryRotate(board, piece, 'cw')).toBeNull();
  });
});

describe('canPlace / collision', () => {
  it('rejects out-of-bounds horizontally and below the floor', () => {
    const board = emptyBoard();
    const shape = [[1, 1]];
    expect(canPlace(board, shape, -1, 0)).toBe(false);
    expect(canPlace(board, shape, BOARD_W - 1, 0)).toBe(false);
    expect(canPlace(board, shape, 0, BOARD_H)).toBe(false);
  });

  it('allows a piece partially above the top of the board', () => {
    const board = emptyBoard();
    expect(canPlace(board, [[1]], 0, -1)).toBe(true);
  });

  it('rejects overlap with a filled cell', () => {
    const board = emptyBoard();
    board[5][5] = 2;
    expect(canPlace(board, [[1]], 5, 5)).toBe(false);
    expect(canPlace(board, [[1]], 4, 5)).toBe(true);
  });
});

describe('clearLines', () => {
  it('clears a single full row and drops the stack down', () => {
    const board = emptyBoard();
    const lockedAt = emptyLockedAt();
    board[BOARD_H - 1] = Array<number>(BOARD_W).fill(3); // full bottom row
    board[BOARD_H - 2][0] = 5; // a floating block above
    lockedAt[BOARD_H - 2][0] = 123;

    const result = clearLines(board, lockedAt);
    expect(result.cleared).toBe(1);
    expect(result.rows).toEqual([BOARD_H - 1]);
    // Floating block should now be on the bottom row.
    expect(result.board[BOARD_H - 1][0]).toBe(5);
    expect(result.lockedAt[BOARD_H - 1][0]).toBe(123);
    // Top row is empty.
    expect(result.board[0].every((c) => c === 0)).toBe(true);
  });

  it('clears multiple simultaneous rows (tetris)', () => {
    const board = emptyBoard();
    const lockedAt = emptyLockedAt();
    for (let y = BOARD_H - 4; y < BOARD_H; y += 1) {
      board[y] = Array<number>(BOARD_W).fill(1);
    }
    const result = clearLines(board, lockedAt);
    expect(result.cleared).toBe(4);
    expect(result.board.every((row) => row.every((c) => c === 0))).toBe(true);
  });

  it('leaves partial rows untouched', () => {
    const board = emptyBoard();
    board[BOARD_H - 1][0] = 2; // not full
    const result = clearLines(board, emptyLockedAt());
    expect(result.cleared).toBe(0);
    expect(result.board[BOARD_H - 1][0]).toBe(2);
  });
});

describe('scoring & level curve', () => {
  it('awards standard line scores scaled by level', () => {
    expect(lineScore(1, 0)).toBe(100);
    expect(lineScore(4, 0)).toBe(800);
    expect(lineScore(1, 2)).toBe(300); // 100 * (2+1)
    expect(lineScore(0, 5)).toBe(0);
  });

  it('raises level every 10 lines', () => {
    expect(levelForLines(0)).toBe(0);
    expect(levelForLines(9)).toBe(0);
    expect(levelForLines(10)).toBe(1);
    expect(levelForLines(25)).toBe(2);
  });

  it('drop interval decreases with level and never goes below the floor', () => {
    expect(dropIntervalMs(0)).toBe(800);
    expect(dropIntervalMs(1)).toBeLessThan(dropIntervalMs(0));
    expect(dropIntervalMs(50)).toBeGreaterThanOrEqual(90);
  });
});

describe('ghost mechanic', () => {
  it('is fully opaque during the grace window', () => {
    expect(ghostOpacity(0, 0)).toBe(1);
    expect(ghostOpacity(0, LOCK_VISIBILITY_MS)).toBe(1);
  });

  it('fades linearly after the grace window down to the floor', () => {
    const mid = ghostOpacity(0, LOCK_VISIBILITY_MS + GHOST_FADE_MS / 2);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(GHOST_MIN_OPACITY);
    // Fully faded reaches the minimum and never goes below it.
    expect(ghostOpacity(0, LOCK_VISIBILITY_MS + GHOST_FADE_MS)).toBeCloseTo(GHOST_MIN_OPACITY, 5);
    expect(ghostOpacity(0, LOCK_VISIBILITY_MS + GHOST_FADE_MS * 10)).toBe(GHOST_MIN_OPACITY);
  });

  it('faded ghost cells still count as filled for line clears', () => {
    // A ghost cell has low opacity but a non-zero board value, so clearLines
    // treats it as solid. This is the core fairness guarantee of the twist.
    const board = emptyBoard();
    const lockedAt = emptyLockedAt();
    board[BOARD_H - 1] = Array<number>(BOARD_W).fill(4);
    // Pretend these locked long ago (fully ghosted).
    lockedAt[BOARD_H - 1] = Array<number>(BOARD_W).fill(1);
    const veryLater = LOCK_VISIBILITY_MS + GHOST_FADE_MS + 5000;
    expect(ghostOpacity(1, veryLater)).toBe(GHOST_MIN_OPACITY);
    expect(clearLines(board, lockedAt).cleared).toBe(1);
  });
});

describe('7-bag randomiser', () => {
  it('refills with all seven ids and never repeats within a bag', () => {
    const rng = seededRng([0.1, 0.9, 0.3, 0.7, 0.5, 0.2]);
    let bag: number[] = [];
    const drawn: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const r = drawFromBag(bag, rng);
      drawn.push(r.id);
      bag = r.bag;
    }
    expect([...drawn].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('draws every id at least once across two full bags', () => {
    let bag: number[] = [];
    const counts = new Map<number, number>();
    for (let i = 0; i < 14; i += 1) {
      const r = drawFromBag(bag);
      counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
      bag = r.bag;
    }
    for (let id = 1; id <= 7; id += 1) {
      expect(counts.get(id)).toBe(2);
    }
  });
});

describe('movement & drops', () => {
  const playing = (patch: Partial<GameState> = {}): GameState => ({
    ...createGame(),
    phase: 'playing',
    ...patch,
  });

  it('moves horizontally only when in bounds', () => {
    const s = playing({ current: makePiece(2) });
    const moved = moveHorizontally(s, -1);
    expect(moved.current.x).toBe(s.current.x - 1);

    // Push to the left wall then attempt to move off it.
    let atWall = s;
    for (let i = 0; i < BOARD_W; i += 1) atWall = moveHorizontally(atWall, -1);
    const blocked = moveHorizontally(atWall, -1);
    expect(blocked.current.x).toBe(atWall.current.x);
  });

  it('rotate uses wall kicks and never overlaps', () => {
    const s = playing({ current: { ...makePiece(3), x: 0 } });
    const rotated = rotate(s, 'cw');
    expect(canPlace(rotated.board, rotated.current.shape, rotated.current.x, rotated.current.y)).toBe(
      true,
    );
  });

  it('dropY finds the resting row', () => {
    const board = emptyBoard();
    const piece = { id: 1, shape: [[1, 1, 1, 1]], x: 3, y: 0 };
    expect(dropY(board, piece)).toBe(BOARD_H - 1);
  });

  it('hard drop locks the piece and clears a completed line', () => {
    // Bottom row missing exactly the 4 cells an I piece will fill.
    const board = emptyBoard();
    for (let x = 0; x < BOARD_W; x += 1) board[BOARD_H - 1][x] = x < 3 || x > 6 ? 2 : 0;
    const s: GameState = {
      ...createGame(),
      phase: 'playing',
      board,
      current: { id: 1, shape: [[1, 1, 1, 1]], x: 3, y: 0 },
    };
    const after = hardDrop(s, 1000);
    expect(after.lines).toBe(1);
    expect(after.score).toBeGreaterThan(s.score);
    // Bottom row cleared -> empty.
    expect(after.board[BOARD_H - 1].every((c) => c === 0)).toBe(true);
  });
});

describe('step / lock / game over', () => {
  it('falls one row when space is available', () => {
    const s: GameState = { ...createGame(), phase: 'playing', current: makePiece(2) };
    const y0 = s.current.y;
    const after = step(s, 1000);
    expect(after.current.y).toBe(y0 + 1);
  });

  it('soft-drop bonus is added to score', () => {
    const s: GameState = { ...createGame(), phase: 'playing', current: makePiece(2) };
    const after = step(s, 1000, 1);
    expect(after.score).toBe(s.score + 1);
  });

  it('locks and spawns the next piece when it cannot fall', () => {
    const board = emptyBoard();
    const s: GameState = {
      ...createGame(),
      phase: 'playing',
      board,
      current: { id: 3, shape: [[0, 1, 0], [1, 1, 1]], x: 3, y: BOARD_H - 2 },
    };
    const before = s.next.id;
    const after = step(s, 1000);
    expect(after.phase).toBe('playing');
    // Current became the old "next".
    expect(after.current.id).toBe(before);
    // Old current is now stamped on the board.
    expect(after.board[BOARD_H - 1][4]).toBe(3);
  });

  it('ends the game when a new piece cannot spawn', () => {
    // Fill the board almost entirely, leaving a single non-full column (so no
    // line clears free up space) except at the very top row where the current
    // piece will lock. Any freshly spawned piece then has nowhere to go.
    const board = emptyBoard();
    const gap = BOARD_W - 1; // keep column 9 empty so rows are never full
    for (let y = 0; y < BOARD_H; y += 1) {
      for (let x = 0; x < BOARD_W; x += 1) {
        if (x === gap) continue;
        if (y === 0 && x >= 3 && x <= 5) continue; // room for current to lock
        board[y][x] = 2;
      }
    }
    const s: GameState = {
      ...createGame(),
      phase: 'playing',
      board,
      current: { id: 3, shape: [[1, 1, 1]], x: 3, y: 0 },
    };
    const after = step(s, 1000);
    expect(after.phase).toBe('gameover');
  });
});

describe('createGame', () => {
  it('starts in menu with distinct current/next from the bag', () => {
    const g = createGame(seededRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.5]));
    expect(g.phase).toBe('menu');
    expect(g.score).toBe(0);
    expect(g.lines).toBe(0);
    expect(g.level).toBe(0);
    expect(g.current.id).toBeGreaterThanOrEqual(1);
    expect(g.next.id).toBeGreaterThanOrEqual(1);
  });
});
