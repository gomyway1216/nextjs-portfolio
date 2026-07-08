/**
 * Mirror Othello — pure game engine.
 *
 * Standard Othello rules with one twist: after every `MIRROR_INTERVAL`
 * plies (moves by either side), the whole board is flipped left↔right.
 * This means corners map to the opposite corner, so long-term corner
 * strategy is periodically upended.
 *
 * All functions here are pure (no React, no DOM) so they can be unit
 * tested and reused by the AI search.
 */

export type Cell = -1 | 0 | 1;

export interface Point {
  x: number;
  y: number;
}

export const SIZE = 8;
export const PLAYER: Cell = 1; // human — rendered dark
export const AI: Cell = -1; // computer — rendered light
export const EMPTY: Cell = 0;

/** Board is flipped left-right every this many plies. */
export const MIRROR_INTERVAL = 4;

export const DIRECTIONS: ReadonlyArray<Point> = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

export const inside = (x: number, y: number): boolean =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE;

export const cloneBoard = (board: Cell[][]): Cell[][] =>
  board.map((row) => [...row]) as Cell[][];

export const createInitialBoard = (): Cell[][] => {
  const board: Cell[][] = Array.from(
    { length: SIZE },
    () => Array(SIZE).fill(EMPTY) as Cell[],
  );
  board[3][3] = AI;
  board[4][4] = AI;
  board[3][4] = PLAYER;
  board[4][3] = PLAYER;
  return board;
};

/**
 * Discs that would be flipped by placing `color` at (x, y).
 * Returns [] if the move is illegal (occupied cell or no captures).
 */
export const getFlips = (
  board: Cell[][],
  x: number,
  y: number,
  color: Cell,
): Point[] => {
  if (!inside(x, y) || board[y][x] !== EMPTY) return [];

  const opponent = -color as Cell;
  const flips: Point[] = [];

  for (const dir of DIRECTIONS) {
    const line: Point[] = [];
    let cx = x + dir.x;
    let cy = y + dir.y;

    while (inside(cx, cy) && board[cy][cx] === opponent) {
      line.push({ x: cx, y: cy });
      cx += dir.x;
      cy += dir.y;
    }

    if (line.length > 0 && inside(cx, cy) && board[cy][cx] === color) {
      flips.push(...line);
    }
  }

  return flips;
};

export const isLegalMove = (
  board: Cell[][],
  x: number,
  y: number,
  color: Cell,
): boolean => getFlips(board, x, y, color).length > 0;

export const getValidMoves = (board: Cell[][], color: Cell): Point[] => {
  const moves: Point[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] === EMPTY && getFlips(board, x, y, color).length > 0) {
        moves.push({ x, y });
      }
    }
  }
  return moves;
};

/** Places a disc and flips captured discs. Returns a NEW board. */
export const applyMove = (
  board: Cell[][],
  x: number,
  y: number,
  color: Cell,
): Cell[][] => {
  const flips = getFlips(board, x, y, color);
  if (flips.length === 0) return board;

  const next = cloneBoard(board);
  next[y][x] = color;
  for (const point of flips) {
    next[point.y][point.x] = color;
  }
  return next;
};

/** Left-right mirror. Column x maps to column (SIZE - 1 - x). */
export const mirrorHorizontally = (board: Cell[][]): Cell[][] =>
  board.map((row) => [...row].reverse() as Cell[]);

/** Whether the ply just completed triggers a mirror flip. */
export const shouldMirror = (turnCount: number): boolean =>
  turnCount > 0 && turnCount % MIRROR_INTERVAL === 0;

/** Plies remaining until the next mirror flip (1..MIRROR_INTERVAL). */
export const pliesUntilMirror = (turnCount: number): number =>
  MIRROR_INTERVAL - (turnCount % MIRROR_INTERVAL);

export interface DiscCount {
  player: number;
  ai: number;
  empty: number;
}

export const countDiscs = (board: Cell[][]): DiscCount => {
  let player = 0;
  let ai = 0;
  let empty = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === PLAYER) player += 1;
      else if (cell === AI) ai += 1;
      else empty += 1;
    }
  }
  return { player, ai, empty };
};

export const cellLabel = (x: number, y: number): string =>
  `${String.fromCharCode(97 + x)}${y + 1}`;

export type GameResult = 'player' | 'ai' | 'draw';

export const resultFromBoard = (board: Cell[][]): GameResult => {
  const { player, ai } = countDiscs(board);
  if (player > ai) return 'player';
  if (ai > player) return 'ai';
  return 'draw';
};

export interface AdvanceResult {
  board: Cell[][];
  /** Whose turn it is next. EMPTY means the game is over. */
  nextColor: Cell;
  /** Legal moves for nextColor (empty when game over). */
  nextMoves: Point[];
  turnCount: number;
  mirrored: boolean;
  passed: boolean;
  gameOver: boolean;
}

/**
 * Core state transition: play `color` at `point`, apply the mirror if the
 * ply lands on the interval, then determine whose turn is next — handling
 * a single pass and terminal detection. Pure; callers build UI state on top.
 *
 * Assumes the move is legal. Returns `null` for an illegal move so callers
 * can guard.
 */
export const advance = (
  board: Cell[][],
  point: Point,
  color: Cell,
  turnCount: number,
): AdvanceResult | null => {
  if (getFlips(board, point.x, point.y, color).length === 0) return null;

  let nextBoard = applyMove(board, point.x, point.y, color);
  const nextTurnCount = turnCount + 1;

  const mirrored = shouldMirror(nextTurnCount);
  if (mirrored) {
    nextBoard = mirrorHorizontally(nextBoard);
  }

  const opponent = -color as Cell;
  const opponentMoves = getValidMoves(nextBoard, opponent);

  if (opponentMoves.length > 0) {
    return {
      board: nextBoard,
      nextColor: opponent,
      nextMoves: opponentMoves,
      turnCount: nextTurnCount,
      mirrored,
      passed: false,
      gameOver: false,
    };
  }

  // Opponent has no move — same player continues if they can.
  const sameMoves = getValidMoves(nextBoard, color);
  if (sameMoves.length > 0) {
    return {
      board: nextBoard,
      nextColor: color,
      nextMoves: sameMoves,
      turnCount: nextTurnCount,
      mirrored,
      passed: true,
      gameOver: false,
    };
  }

  // Neither side can move — game over.
  return {
    board: nextBoard,
    nextColor: EMPTY,
    nextMoves: [],
    turnCount: nextTurnCount,
    mirrored,
    passed: false,
    gameOver: true,
  };
};
