/**
 * Ghost Tetris — pure game engine.
 *
 * The twist: once a block locks onto the board it stays fully visible for a
 * short "grace" window, then fades toward near‑transparency. You have to
 * remember where the buried blocks are to keep clearing lines. All of the
 * board / piece / scoring logic lives here as pure functions so it can be
 * unit tested independently of React.
 */

export const BOARD_W = 10;
export const BOARD_H = 20;

/** Fully visible for this long (ms) after a cell locks. */
export const LOCK_VISIBILITY_MS = 2200;
/** Fade duration (ms) from full opacity down to GHOST_MIN_OPACITY. */
export const GHOST_FADE_MS = 900;
/** Locked cells never fade below this — a faint memory aid. */
export const GHOST_MIN_OPACITY = 0.12;

/** 1‑indexed piece ids. 0 is empty. */
export type CellValue = number;

export type Board = CellValue[][];
export type Shape = number[][];

export interface Piece {
  /** id used both as color index and as the value written into the board */
  id: number;
  shape: Shape;
  x: number;
  y: number;
}

export type Phase = 'menu' | 'playing' | 'paused' | 'gameover';

export interface GameState {
  phase: Phase;
  board: Board;
  /** timestamp (ms) each cell was locked, 0 if empty */
  lockedAt: number[][];
  current: Piece;
  next: Piece;
  bag: number[];
  score: number;
  lines: number;
  level: number;
  /** rows that were just cleared this tick — for the flash animation */
  clearing: number[];
}

/**
 * Canonical spawn shapes (spawn orientation). Index + 1 is the piece id, which
 * also indexes into COLORS. Order: I, O, T, J, L, S, Z.
 */
export const SHAPES: Shape[] = [
  [[1, 1, 1, 1]], // I
  [
    [1, 1],
    [1, 1],
  ], // O
  [
    [0, 1, 0],
    [1, 1, 1],
  ], // T
  [
    [1, 0, 0],
    [1, 1, 1],
  ], // J
  [
    [0, 0, 1],
    [1, 1, 1],
  ], // L
  [
    [0, 1, 1],
    [1, 1, 0],
  ], // S
  [
    [1, 1, 0],
    [0, 1, 1],
  ], // Z
];

/** COLORS[id] — index 0 is the empty‑cell sentinel and is never rendered as a block. */
export const COLORS = [
  '#000000',
  '#22d3ee', // I  cyan
  '#facc15', // O  yellow
  '#c084fc', // T  purple
  '#60a5fa', // J  blue
  '#fb923c', // L  orange
  '#4ade80', // S  green
  '#f87171', // Z  red
];

export const emptyBoard = (): Board =>
  Array.from({ length: BOARD_H }, () => Array<number>(BOARD_W).fill(0));

export const emptyLockedAt = (): number[][] =>
  Array.from({ length: BOARD_H }, () => Array<number>(BOARD_W).fill(0));

const cloneGrid = <T>(grid: T[][]): T[][] => grid.map((row) => [...row]);

/** Rotate a shape 90° clockwise. */
export const rotateClockwise = (shape: Shape): Shape => {
  const h = shape.length;
  const w = shape[0].length;
  const rotated: Shape = Array.from({ length: w }, () => Array<number>(h).fill(0));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      rotated[x][h - 1 - y] = shape[y][x];
    }
  }
  return rotated;
};

/** Rotate a shape 90° counter‑clockwise. */
export const rotateCounterClockwise = (shape: Shape): Shape => {
  const h = shape.length;
  const w = shape[0].length;
  const rotated: Shape = Array.from({ length: w }, () => Array<number>(h).fill(0));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      rotated[w - 1 - x][y] = shape[y][x];
    }
  }
  return rotated;
};

/**
 * 7‑bag randomiser: shuffle all seven piece ids, hand them out one at a time,
 * refill when empty. Prevents piece droughts that plague naive random. Returns
 * the drawn id (1‑indexed) and the remaining bag.
 */
export const drawFromBag = (
  bag: number[],
  rng: () => number = Math.random,
): { id: number; bag: number[] } => {
  let next = [...bag];
  if (next.length === 0) {
    next = [1, 2, 3, 4, 5, 6, 7];
    // Fisher–Yates
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
  }
  const id = next[0];
  return { id, bag: next.slice(1) };
};

/** Horizontal spawn offset so a piece appears centred at the top. */
const spawnX = (shape: Shape): number => Math.floor((BOARD_W - shape[0].length) / 2);

export const makePiece = (id: number): Piece => {
  const shape = SHAPES[id - 1];
  return { id, shape, x: spawnX(shape), y: 0 };
};

/** Can `shape` sit at (x,y) on `board` without overlap or going out of bounds? */
export const canPlace = (
  board: Board,
  shape: Shape,
  x: number,
  y: number,
): boolean => {
  for (let sy = 0; sy < shape.length; sy += 1) {
    for (let sx = 0; sx < shape[sy].length; sx += 1) {
      if (!shape[sy][sx]) continue;
      const tx = x + sx;
      const ty = y + sy;
      if (tx < 0 || tx >= BOARD_W || ty >= BOARD_H) return false;
      // ty < 0 is allowed (piece still partially above the board)
      if (ty >= 0 && board[ty][tx] !== 0) return false;
    }
  }
  return true;
};

/**
 * Attempt to rotate `piece` on `board`, trying a set of horizontal/vertical
 * "wall kick" offsets so rotations near walls / the floor succeed instead of
 * being silently rejected. Returns the rotated+kicked piece, or null if no
 * offset fits.
 */
const KICK_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  // Wider kicks so the 4-wide I piece can rotate flush against a wall.
  [-3, 0],
  [3, 0],
  [0, -1],
];

export const tryRotate = (
  board: Board,
  piece: Piece,
  direction: 'cw' | 'ccw' = 'cw',
): Piece | null => {
  const rotated = direction === 'cw'
    ? rotateClockwise(piece.shape)
    : rotateCounterClockwise(piece.shape);
  for (const [dx, dy] of KICK_OFFSETS) {
    const nx = piece.x + dx;
    const ny = piece.y + dy;
    if (canPlace(board, rotated, nx, ny)) {
      return { ...piece, shape: rotated, x: nx, y: ny };
    }
  }
  return null;
};

/** Lowest y the current piece can drop to (for the drop‑shadow preview). */
export const dropY = (board: Board, piece: Piece): number => {
  let y = piece.y;
  while (canPlace(board, piece.shape, piece.x, y + 1)) y += 1;
  return y;
};

/**
 * Remove full rows. Returns the compacted board / lockedAt grids, the number
 * cleared, and the indices (in the ORIGINAL board) that were full — the caller
 * uses those for the clear animation before compaction is shown.
 */
export const clearLines = (
  board: Board,
  lockedAt: number[][],
): { board: Board; lockedAt: number[][]; cleared: number; rows: number[] } => {
  const keptBoard: Board = [];
  const keptLockedAt: number[][] = [];
  const rows: number[] = [];

  for (let y = 0; y < BOARD_H; y += 1) {
    if (board[y].every((cell) => cell !== 0)) {
      rows.push(y);
      continue;
    }
    keptBoard.push([...board[y]]);
    keptLockedAt.push([...lockedAt[y]]);
  }

  const cleared = rows.length;
  while (keptBoard.length < BOARD_H) {
    keptBoard.unshift(Array<number>(BOARD_W).fill(0));
    keptLockedAt.unshift(Array<number>(BOARD_W).fill(0));
  }

  return { board: keptBoard, lockedAt: keptLockedAt, cleared, rows };
};

/** Standard line-clear scoring, scaled by (level + 1). */
export const lineScore = (cleared: number, level: number): number => {
  const base = [0, 100, 300, 500, 800][cleared] ?? 0;
  return base * (level + 1);
};

/** Level rises every 10 cleared lines. */
export const levelForLines = (lines: number): number => Math.floor(lines / 10);

/** Gravity interval (ms) for a level — faster as level climbs, with a floor. */
export const dropIntervalMs = (level: number): number =>
  Math.max(90, Math.round(800 * Math.pow(0.82, level)));

/**
 * Opacity for a locked cell given the current clock. Full opacity during the
 * grace window, then a linear fade down to GHOST_MIN_OPACITY. Pure so it can
 * be tested; the component just feeds it `Date.now()`.
 */
export const ghostOpacity = (lockedAt: number, now: number): number => {
  const age = now - lockedAt;
  if (age <= LOCK_VISIBILITY_MS) return 1;
  const t = (age - LOCK_VISIBILITY_MS) / GHOST_FADE_MS;
  return Math.max(GHOST_MIN_OPACITY, 1 - t * (1 - GHOST_MIN_OPACITY));
};

/** Merge the current piece into the board + lockedAt grids (mutates clones). */
const stampPiece = (
  board: Board,
  lockedAt: number[][],
  piece: Piece,
  now: number,
): void => {
  for (let y = 0; y < piece.shape.length; y += 1) {
    for (let x = 0; x < piece.shape[y].length; x += 1) {
      if (!piece.shape[y][x]) continue;
      const tx = piece.x + x;
      const ty = piece.y + y;
      if (ty < 0 || ty >= BOARD_H || tx < 0 || tx >= BOARD_W) continue;
      board[ty][tx] = piece.id;
      lockedAt[ty][tx] = now;
    }
  }
};

/**
 * Lock the current piece, clear lines, score, and spawn the next piece.
 * If the freshly spawned piece cannot be placed the game is over.
 */
export const lockCurrent = (
  state: GameState,
  now: number = Date.now(),
  rng: () => number = Math.random,
): GameState => {
  const board = cloneGrid(state.board);
  const lockedAt = cloneGrid(state.lockedAt);
  stampPiece(board, lockedAt, state.current, now);

  const { board: nextBoard, lockedAt: nextAt, cleared, rows } = clearLines(board, lockedAt);
  const lines = state.lines + cleared;
  const level = levelForLines(lines);
  const score = state.score + lineScore(cleared, state.level);

  const current = makePiece(state.next.id);
  const { id: nextId, bag } = drawFromBag(state.bag, rng);
  const next = makePiece(nextId);

  if (!canPlace(nextBoard, current.shape, current.x, current.y)) {
    return {
      ...state,
      board: nextBoard,
      lockedAt: nextAt,
      score,
      lines,
      level,
      clearing: rows,
      phase: 'gameover',
    };
  }

  return {
    ...state,
    board: nextBoard,
    lockedAt: nextAt,
    current,
    next,
    bag,
    score,
    lines,
    level,
    clearing: rows,
  };
};

/** Advance one gravity step. Locks the piece when it can't fall further. */
export const step = (
  state: GameState,
  now: number = Date.now(),
  bonus = 0,
  rng: () => number = Math.random,
): GameState => {
  if (canPlace(state.board, state.current.shape, state.current.x, state.current.y + 1)) {
    return {
      ...state,
      current: { ...state.current, y: state.current.y + 1 },
      score: state.score + bonus,
    };
  }
  return lockCurrent({ ...state, score: state.score + bonus }, now, rng);
};

/** Hard drop: slam to the bottom, award 2 pts per cell, and lock immediately. */
export const hardDrop = (
  state: GameState,
  now: number = Date.now(),
  rng: () => number = Math.random,
): GameState => {
  const y = dropY(state.board, state.current);
  const dropped = y - state.current.y;
  return lockCurrent(
    {
      ...state,
      current: { ...state.current, y },
      score: state.score + dropped * 2,
    },
    now,
    rng,
  );
};

export const moveHorizontally = (state: GameState, dx: number): GameState => {
  const nx = state.current.x + dx;
  if (canPlace(state.board, state.current.shape, nx, state.current.y)) {
    return { ...state, current: { ...state.current, x: nx } };
  }
  return state;
};

export const rotate = (state: GameState, direction: 'cw' | 'ccw' = 'cw'): GameState => {
  const rotated = tryRotate(state.board, state.current, direction);
  return rotated ? { ...state, current: rotated } : state;
};

export const createGame = (rng: () => number = Math.random): GameState => {
  const first = drawFromBag([], rng);
  const second = drawFromBag(first.bag, rng);
  return {
    phase: 'menu',
    board: emptyBoard(),
    lockedAt: emptyLockedAt(),
    current: makePiece(first.id),
    next: makePiece(second.id),
    bag: second.bag,
    score: 0,
    lines: 0,
    level: 0,
    clearing: [],
  };
};
