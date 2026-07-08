/**
 * Daily Move Puzzle engine.
 *
 * The puzzle is a "win in one move" tic-tac-toe tactic: a 3x3 board is shown
 * with the side to move, and there is exactly ONE empty square that completes a
 * line for that side. The player must find it in as few taps as possible
 * (par = 1). Every puzzle is generated procedurally and verified by a solver so
 * that it is always solvable and has a unique winning move.
 *
 * A daily seed derived from the local date gives everyone the same puzzle for a
 * given local calendar day (users in different timezones roll over at different
 * moments). The seed is fully deterministic so tests can reproduce it.
 */

export type Mark = 'X' | 'O' | null;
export type Side = 'X' | 'O';

export interface Puzzle {
  /** 9-cell board, row-major. */
  board: Mark[];
  /** Side that is to move and must win this turn. */
  side: Side;
  /** The single empty index that completes a line for `side`. */
  correctMove: number;
  /** The three indices that form the winning line after the correct move. */
  winningLine: number[];
}

export const WINNING_LINES: readonly number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** Returns the winning line for `mark`, or null if none. */
export const getWinningLine = (board: Mark[], mark: Side): number[] | null => {
  for (const line of WINNING_LINES) {
    if (line.every((index) => board[index] === mark)) {
      return line;
    }
  }
  return null;
};

/** True if either side already has three in a row. */
export const hasAnyWinner = (board: Mark[]): boolean =>
  getWinningLine(board, 'X') !== null || getWinningLine(board, 'O') !== null;

/**
 * Returns every empty index that, if filled by `side`, completes a line.
 * A valid puzzle has exactly one such index.
 */
export const findWinningMoves = (board: Mark[], side: Side): number[] => {
  const moves: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    if (board[i] !== null) continue;
    const next = board.slice();
    next[i] = side;
    if (getWinningLine(next, side)) {
      moves.push(i);
    }
  }
  return moves;
};

/**
 * A puzzle is valid when:
 *  - the board has no winner yet,
 *  - piece counts are plausible for the side to move,
 *  - `side` has exactly one winning move, and
 *  - the opponent does NOT already have a winning move (so the tactic is clean).
 */
export const isValidPuzzle = (puzzle: Puzzle): boolean => {
  const { board, side, correctMove } = puzzle;
  if (board.length !== 9) return false;
  if (board[correctMove] !== null) return false;
  if (hasAnyWinner(board)) return false;

  const xCount = board.filter((c) => c === 'X').length;
  const oCount = board.filter((c) => c === 'O').length;
  // In tic-tac-toe X moves first. On X's turn the counts must be exactly equal;
  // on O's turn X must have exactly one more mark than O.
  if (side === 'X' ? xCount !== oCount : xCount !== oCount + 1) return false;

  const winning = findWinningMoves(board, side);
  if (winning.length !== 1 || winning[0] !== correctMove) return false;

  // Keep the tactic clean: the opponent must not also have a one-move win.
  const opponent: Side = side === 'X' ? 'O' : 'X';
  if (findWinningMoves(board, opponent).length > 0) return false;

  // The declared winningLine must be the actual line completed by correctMove,
  // so UI highlighting stays consistent with the real win.
  const after = board.slice();
  after[correctMove] = side;
  const actualLine = getWinningLine(after, side);
  if (
    !actualLine ||
    actualLine.length !== puzzle.winningLine.length ||
    !puzzle.winningLine.every((i) => actualLine.includes(i))
  ) {
    return false;
  }

  return true;
};

/** Mulberry32 seeded PRNG - small, fast, deterministic. */
export const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Deterministic string hash (FNV-like) for seeding from a date key. */
export const hashSeed = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const shuffleInPlace = <T,>(arr: T[], rng: () => number): T[] => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Generates a puzzle deterministically from a seed.
 *
 * Strategy: pick a winning line and a winning square within it, place the
 * side-to-move's other two marks on that line, then scatter the opponent's
 * marks on other squares. Reject-and-retry until a genuinely unique tactic is
 * produced, then verify with the solver. Guaranteed to return a valid puzzle.
 */
export const generatePuzzle = (seed: number): Puzzle => {
  const rng = createRng(seed);

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const side: Side = rng() < 0.5 ? 'X' : 'O';
    const opponent: Side = side === 'X' ? 'O' : 'X';

    // Choose the line the side will complete and which of its cells stays empty.
    const line = WINNING_LINES[Math.floor(rng() * WINNING_LINES.length)].slice();
    const emptyPos = line[Math.floor(rng() * line.length)];
    const sideCells = line.filter((c) => c !== emptyPos);

    const board: Mark[] = new Array(9).fill(null);
    board[sideCells[0]] = side;
    board[sideCells[1]] = side;

    // Place opponent marks. The side to move already has exactly 2 marks, so
    // the opponent count is fully determined by legal tic-tac-toe counts:
    // - side === 'X' (X's turn, counts equal): O must have exactly 2 marks.
    // - side === 'O' (O's turn, X leads by one): X must have exactly 3 marks.
    const oppCount = side === 'X' ? 2 : 3;

    const otherCells = shuffleInPlace(
      Array.from({ length: 9 }, (_, i) => i).filter(
        (i) => board[i] === null && i !== emptyPos,
      ),
      rng,
    );

    if (otherCells.length < oppCount) continue;
    for (let k = 0; k < oppCount; k += 1) {
      board[otherCells[k]] = opponent;
    }

    const puzzle: Puzzle = {
      board,
      side,
      correctMove: emptyPos,
      winningLine: line,
    };

    if (isValidPuzzle(puzzle)) {
      return puzzle;
    }
  }

  // Deterministic fallback that is always valid (should be unreachable).
  // X wins uniquely at index 2; O has no line and counts are equal.
  return {
    board: ['X', 'X', null, 'O', null, null, null, 'O', null],
    side: 'X',
    correctMove: 2,
    winningLine: [0, 1, 2],
  };
};

/** Local-date key `YYYY-MM-DD` used both for seeding and "solved today". */
export const getDateKey = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** The puzzle for a given date key. Same key always yields the same puzzle. */
export const getPuzzleForDate = (dateKey: string): Puzzle =>
  generatePuzzle(hashSeed(dateKey));
