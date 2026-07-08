import { describe, expect, it } from 'vitest';
import {
  advance,
  AI,
  applyMove,
  Cell,
  countDiscs,
  createInitialBoard,
  EMPTY,
  getFlips,
  getValidMoves,
  isLegalMove,
  MIRROR_INTERVAL,
  mirrorHorizontally,
  PLAYER,
  pliesUntilMirror,
  resultFromBoard,
  shouldMirror,
  SIZE,
} from '@/components/game/MirrorOthello/engine';

const empty = (): Cell[][] =>
  Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY) as Cell[]);

describe('MirrorOthello engine — setup', () => {
  it('creates the standard 4-disc opening', () => {
    const b = createInitialBoard();
    expect(b[3][3]).toBe(AI);
    expect(b[4][4]).toBe(AI);
    expect(b[3][4]).toBe(PLAYER);
    expect(b[4][3]).toBe(PLAYER);
    const c = countDiscs(b);
    expect(c).toEqual({ player: 2, ai: 2, empty: 60 });
  });

  it('gives the opening player exactly 4 legal moves', () => {
    const b = createInitialBoard();
    const moves = getValidMoves(b, PLAYER);
    expect(moves).toHaveLength(4);
    // Classic opening squares for the mover (x,y).
    const labels = moves.map((m) => `${m.x},${m.y}`).sort();
    expect(labels).toEqual(['2,3', '3,2', '4,5', '5,4']);
  });
});

describe('MirrorOthello engine — flips', () => {
  it('flips a single sandwiched disc', () => {
    const b = empty();
    b[3][3] = PLAYER;
    b[3][4] = AI;
    // PLAYER at (5,3) sandwiches the AI disc at (4,3).
    const flips = getFlips(b, 5, 3, PLAYER);
    expect(flips).toEqual([{ x: 4, y: 3 }]);
    expect(isLegalMove(b, 5, 3, PLAYER)).toBe(true);
  });

  it('rejects moves onto occupied cells and moves that capture nothing', () => {
    const b = createInitialBoard();
    expect(getFlips(b, 3, 3, PLAYER)).toEqual([]); // occupied
    expect(getFlips(b, 0, 0, PLAYER)).toEqual([]); // no line
    expect(isLegalMove(b, 0, 0, PLAYER)).toBe(false);
  });

  it('applyMove flips discs and is immutable', () => {
    const b = createInitialBoard();
    const before = JSON.stringify(b);
    const next = applyMove(b, 2, 3, PLAYER); // c4, flips the AI disc at (3,3)
    expect(JSON.stringify(b)).toBe(before); // original untouched
    expect(next[3][2]).toBe(PLAYER); // placed
    expect(next[3][3]).toBe(PLAYER); // flipped from AI
    const c = countDiscs(next);
    expect(c.player).toBe(4);
    expect(c.ai).toBe(1);
  });

  it('flips discs in multiple directions at once', () => {
    const b = empty();
    // Cross of AI discs around an empty center, bracketed by PLAYER discs.
    b[4][4] = EMPTY;
    b[4][2] = PLAYER; b[4][3] = AI; // left line
    b[4][6] = PLAYER; b[4][5] = AI; // right line
    b[2][4] = PLAYER; b[3][4] = AI; // up line
    b[6][4] = PLAYER; b[5][4] = AI; // down line
    const flips = getFlips(b, 4, 4, PLAYER);
    expect(flips).toHaveLength(4);
  });
});

describe('MirrorOthello engine — mirror mechanic', () => {
  it('mirrorHorizontally reverses columns and is its own inverse', () => {
    const b = empty();
    b[0][0] = PLAYER;
    b[2][1] = AI;
    const m = mirrorHorizontally(b);
    expect(m[0][7]).toBe(PLAYER);
    expect(m[2][6]).toBe(AI);
    expect(m[0][0]).toBe(EMPTY);
    // Mirroring twice returns the original.
    expect(mirrorHorizontally(m)).toEqual(b);
  });

  it('shouldMirror fires exactly on interval boundaries', () => {
    expect(shouldMirror(0)).toBe(false);
    for (let n = 1; n <= 12; n += 1) {
      expect(shouldMirror(n)).toBe(n % MIRROR_INTERVAL === 0);
    }
  });

  it('pliesUntilMirror counts down 4..1', () => {
    expect(pliesUntilMirror(0)).toBe(4);
    expect(pliesUntilMirror(1)).toBe(3);
    expect(pliesUntilMirror(3)).toBe(1);
    expect(pliesUntilMirror(4)).toBe(4);
  });
});

describe('MirrorOthello engine — advance transition', () => {
  it('rejects an illegal move', () => {
    const b = createInitialBoard();
    expect(advance(b, { x: 0, y: 0 }, PLAYER, 0)).toBeNull();
  });

  it('does not mirror on the first three plies', () => {
    const b = createInitialBoard();
    const step = advance(b, { x: 2, y: 3 }, PLAYER, 0);
    expect(step).not.toBeNull();
    expect(step!.mirrored).toBe(false);
    expect(step!.nextColor).toBe(AI);
    expect(step!.turnCount).toBe(1);
  });

  it('mirrors the board when the 4th ply lands on the interval', () => {
    const b = createInitialBoard();
    // Play any legal move as the 4th ply (turnCount 3 -> 4).
    const before = applyMove(b, 2, 3, PLAYER);
    const expectedMirror = mirrorHorizontally(before);
    const step = advance(b, { x: 2, y: 3 }, PLAYER, 3);
    expect(step).not.toBeNull();
    expect(step!.mirrored).toBe(true);
    expect(step!.turnCount).toBe(4);
    expect(step!.board).toEqual(expectedMirror);
  });

  it('marks a pass when the opponent has no legal move but the mover does', () => {
    // AI has only a single isolated disc: it can never bracket anything, so
    // it must pass. PLAYER still has a legal reply, so the same side continues.
    const b = empty();
    b[0][7] = AI; // lone AI disc in a far corner — no possible captures
    // A PLAYER line ready to grow so PLAYER keeps moving after AI passes.
    b[4][2] = PLAYER;
    b[4][3] = PLAYER;
    b[4][4] = PLAYER;
    b[3][3] = AI; // PLAYER at (3,2)/(3,4) could flip this later
    b[3][2] = PLAYER;
    const mv = getValidMoves(b, PLAYER)[0];
    expect(mv).toBeDefined();
    const step = advance(b, mv, PLAYER, 0);
    expect(step).not.toBeNull();
    // AI cannot move -> either PLAYER continues (passed) or game over.
    expect(getValidMoves(step!.board, AI)).toHaveLength(0);
    if (!step!.gameOver) {
      expect(step!.passed).toBe(true);
      expect(step!.nextColor).toBe(PLAYER);
    }
  });

  it('detects game over when neither side can move on a full board', () => {
    // Full board, checkerboard-ish so no captures possible: filling the last
    // empty cell (which does capture) ends the game.
    const b: Cell[][] = Array.from(
      { length: SIZE },
      () => Array.from({ length: SIZE }, () => PLAYER as Cell),
    );
    // Leave one empty cell and place an AI disc to capture.
    b[0][0] = EMPTY;
    b[0][1] = AI;
    // (0,0) placing PLAYER captures the AI disc at (0,1), filling the board.
    const step = advance(b, { x: 0, y: 0 }, PLAYER, 5);
    expect(step).not.toBeNull();
    expect(countDiscs(step!.board).empty).toBe(0);
    expect(step!.gameOver).toBe(true);
    expect(step!.nextColor).toBe(EMPTY);
  });
});

describe('MirrorOthello engine — result', () => {
  it('scores by disc majority', () => {
    const b = empty();
    b[0][0] = PLAYER;
    b[0][1] = PLAYER;
    b[0][2] = AI;
    expect(resultFromBoard(b)).toBe('player');
    b[0][3] = AI;
    expect(resultFromBoard(b)).toBe('draw');
    b[0][4] = AI;
    expect(resultFromBoard(b)).toBe('ai');
  });
});
