/**
 * Blokus rules engine.
 *
 * Pure TypeScript with no React, so the UI, the AI worker, the unit tests and
 * `scripts/blokus-ai-match.ts` all run the same rules.
 *
 * The board is held as one 32-bit mask per row, for each colour:
 * - `blocked`: cells the colour may not occupy (taken, or edge-adjacent to its
 *   own pieces);
 * - `corners`: cells diagonal to its own pieces (the start square before its
 *   first move). A placement is legal when it misses `blocked` and covers at
 *   least one `corners` cell.
 *
 * A move is one integer (see {@link encodeMove}) so the AI can keep thousands
 * of them without allocating objects. The AI searches by copying a state with
 * {@link copyState} and applying moves to the copy.
 */

export type Mode = 'classic' | 'duo';

export interface Rules {
  mode: Mode;
  size: number;
  /** One colour per player, in turn order. */
  colors: number;
  /** The cell each colour's first piece must cover: [row, col]. */
  starts: ReadonlyArray<readonly [number, number]>;
}

export const RULES: Record<Mode, Rules> = {
  classic: {
    mode: 'classic',
    size: 20,
    colors: 4,
    starts: [
      [0, 0],
      [0, 19],
      [19, 19],
      [19, 0],
    ],
  },
  duo: {
    mode: 'duo',
    size: 14,
    colors: 2,
    starts: [
      [4, 4],
      [9, 9],
    ],
  },
};

/** Row stride of a move id. Fixed at the classic size so ids mean the same in both modes. */
const STRIDE = 20;
const MAX_CELLS = STRIDE * STRIDE;

export const PASS = -1;

export interface Piece {
  /** Index into {@link PIECES}, and the piece's bit in a hand mask. */
  index: number;
  name: string;
  size: number;
  /** The shape as drawn in the tray. */
  shape: ReadonlyArray<readonly [number, number]>;
  /** Indices into {@link ORIENTATIONS}. */
  orientations: readonly number[];
}

export interface Orientation {
  index: number;
  piece: number;
  height: number;
  width: number;
  /** One bitmask per row, bit 0 at the left column. */
  rows: readonly number[];
  cells: ReadonlyArray<readonly [number, number]>;
  /** Cells flattened to [r, c, r, c, …]: every cell of the piece. */
  allContacts: readonly number[];
  /**
   * The cells that can touch an own corner diagonally, flattened the same way.
   * Such a cell has a free corner: both its neighbours towards that corner are
   * outside the piece, because the piece may not touch its own colour by edge.
   */
  contacts: readonly number[];
}

const SHAPES: ReadonlyArray<readonly [string, string]> = [
  ['I1', 'X'],
  ['I2', 'XX'],
  ['I3', 'XXX'],
  ['V3', 'XX/X.'],
  ['I4', 'XXXX'],
  ['L4', 'XXX/X..'],
  ['O4', 'XX/XX'],
  ['T4', 'XXX/.X.'],
  ['Z4', 'XX./.XX'],
  ['F5', '.XX/XX./.X.'],
  ['I5', 'XXXXX'],
  ['L5', 'XXXX/X...'],
  ['N5', '.XXX/XX..'],
  ['P5', 'XX/XX/X.'],
  ['T5', 'XXX/.X./.X.'],
  ['U5', 'X.X/XXX'],
  ['V5', 'XXX/X../X..'],
  ['W5', 'X../XX./.XX'],
  ['X5', '.X./XXX/.X.'],
  ['Y5', 'XXXX/.X..'],
  ['Z5', 'XX./.X./.XX'],
];

const parseShape = (shape: string): Array<[number, number]> => {
  const cells: Array<[number, number]> = [];
  shape.split('/').forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === 'X') cells.push([r, c]);
    });
  });
  return cells;
};

const normalize = (cells: ReadonlyArray<readonly [number, number]>): Array<[number, number]> => {
  const top = Math.min(...cells.map(([r]) => r));
  const left = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]): [number, number] => [r - top, c - left])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

export const rotateCells = (cells: ReadonlyArray<readonly [number, number]>): Array<[number, number]> =>
  normalize(cells.map(([r, c]): [number, number] => [c, -r]));

export const flipCells = (cells: ReadonlyArray<readonly [number, number]>): Array<[number, number]> =>
  normalize(cells.map(([r, c]): [number, number] => [r, -c]));

const shapeKey = (cells: ReadonlyArray<readonly [number, number]>): string => cells.map((cell) => cell.join(',')).join(';');

const buildOrientation = (index: number, piece: number, cells: ReadonlyArray<readonly [number, number]>): Orientation => {
  const has = new Set(cells.map(([r, c]) => `${r},${c}`));
  const inPiece = (r: number, c: number) => has.has(`${r},${c}`);
  const height = Math.max(...cells.map(([r]) => r)) + 1;
  const width = Math.max(...cells.map(([, c]) => c)) + 1;
  const rows = Array.from({ length: height }, () => 0);
  const allContacts: number[] = [];
  const contacts: number[] = [];
  for (const [r, c] of cells) {
    rows[r] |= 1 << c;
    allContacts.push(r, c);
    const freeCorner = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].some(([dr, dc]) => !inPiece(r + dr, c) && !inPiece(r, c + dc) && !inPiece(r + dr, c + dc));
    if (freeCorner) contacts.push(r, c);
  }
  return { index, piece, height, width, rows, cells, allContacts, contacts };
};

const buildPieces = (): { pieces: Piece[]; orientations: Orientation[] } => {
  const pieces: Piece[] = [];
  const orientations: Orientation[] = [];
  SHAPES.forEach(([name, drawing], index) => {
    const shape = normalize(parseShape(drawing));
    const found = new Map<string, Array<[number, number]>>();
    let cells = shape;
    for (let flip = 0; flip < 2; flip++) {
      for (let turn = 0; turn < 4; turn++) {
        if (!found.has(shapeKey(cells))) found.set(shapeKey(cells), cells);
        cells = rotateCells(cells);
      }
      cells = flipCells(cells);
    }
    const own: number[] = [];
    for (const variant of found.values()) {
      own.push(orientations.length);
      orientations.push(buildOrientation(orientations.length, index, variant));
    }
    pieces.push({ index, name, size: shape.length, shape, orientations: own });
  });
  return { pieces, orientations };
};

const built = buildPieces();

/** The 21 pieces every colour starts with. */
export const PIECES: readonly Piece[] = built.pieces;
/** All 91 distinct orientations of the 21 pieces. */
export const ORIENTATIONS: readonly Orientation[] = built.orientations;

export const FULL_HAND = (1 << PIECES.length) - 1;
export const TOTAL_SQUARES = PIECES.reduce((sum, piece) => sum + piece.size, 0);

/** Find the orientation with these cells (the UI turns cells, the engine plays orientations). */
export const orientationOf = (piece: number, cells: ReadonlyArray<readonly [number, number]>): Orientation => {
  const key = shapeKey(normalize(cells));
  const match = PIECES[piece].orientations.map((o) => ORIENTATIONS[o]).find((o) => shapeKey(o.cells) === key);
  if (!match) throw new Error(`[blokus] these cells are not piece ${PIECES[piece].name}`);
  return match;
};

export interface GameState {
  rules: Rules;
  /** size × size, the colour on each cell or -1. */
  board: Int8Array;
  /** colors × size rows. */
  blocked: Int32Array;
  /** colors × size rows. */
  corners: Int32Array;
  /** Pieces in hand per colour, one bit per piece. */
  hands: Int32Array;
  /** The piece each colour played last, -1 before its first. */
  last: Int8Array;
  /** Squares each colour has placed. */
  placed: Int16Array;
  /** 1 once a colour has no legal move. It never has one again: its corners only change when it plays. */
  out: Uint8Array;
  toMove: number;
  over: boolean;
}

export const newGame = (mode: Mode): GameState => {
  const rules = RULES[mode];
  const { size, colors, starts } = rules;
  const state: GameState = {
    rules,
    board: new Int8Array(size * size).fill(-1),
    blocked: new Int32Array(colors * size),
    corners: new Int32Array(colors * size),
    hands: new Int32Array(colors).fill(FULL_HAND),
    last: new Int8Array(colors).fill(-1),
    placed: new Int16Array(colors),
    out: new Uint8Array(colors),
    toMove: 0,
    over: false,
  };
  starts.forEach(([row, col], color) => {
    state.corners[color * size + row] = 1 << col;
  });
  return state;
};

export const cloneState = (state: GameState): GameState => ({
  ...state,
  board: state.board.slice(),
  blocked: state.blocked.slice(),
  corners: state.corners.slice(),
  hands: state.hands.slice(),
  last: state.last.slice(),
  placed: state.placed.slice(),
  out: state.out.slice(),
});

/** Overwrite `target` with `source`. Both must come from the same mode. */
export const copyState = (target: GameState, source: GameState): void => {
  target.board.set(source.board);
  target.blocked.set(source.blocked);
  target.corners.set(source.corners);
  target.hands.set(source.hands);
  target.last.set(source.last);
  target.placed.set(source.placed);
  target.out.set(source.out);
  target.toMove = source.toMove;
  target.over = source.over;
};

export const encodeMove = (orientation: number, row: number, col: number): number =>
  orientation * MAX_CELLS + row * STRIDE + col;

export const moveOrientation = (move: number): Orientation => ORIENTATIONS[Math.floor(move / MAX_CELLS)];
export const movePiece = (move: number): number => moveOrientation(move).piece;
export const moveRow = (move: number): number => Math.floor(move / STRIDE) % STRIDE;
export const moveCol = (move: number): number => move % STRIDE;

/** The board cells a move covers, as [row, col]. */
export const moveCells = (move: number): Array<[number, number]> => {
  const row = moveRow(move);
  const col = moveCol(move);
  return moveOrientation(move).cells.map(([r, c]): [number, number] => [row + r, col + c]);
};

export const hasPiece = (state: GameState, color: number, piece: number): boolean =>
  (state.hands[color] & (1 << piece)) !== 0;

const fits = (blocked: Int32Array, base: number, rows: readonly number[], left: number): boolean => {
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] << left) & blocked[base + i]) return false;
  }
  return true;
};

/** Whether a piece can go here, for the colour to move or any other. */
export const isLegalPlacement = (state: GameState, color: number, orientation: Orientation, row: number, col: number): boolean => {
  const { size } = state.rules;
  if (row < 0 || col < 0 || row + orientation.height > size || col + orientation.width > size) return false;
  if (!hasPiece(state, color, orientation.piece)) return false;
  const base = color * size + row;
  if (!fits(state.blocked, base, orientation.rows, col)) return false;
  for (let i = 0; i < orientation.rows.length; i++) {
    if ((orientation.rows[i] << col) & state.corners[base + i]) return true;
  }
  return false;
};

/** One stamp per move id: a placement can touch several corners, and is listed and tested once. */
const seen = new Uint32Array(ORIENTATIONS.length * MAX_CELLS);
let stamp = 0;

const walkMoves = (state: GameState, color: number, visit: (move: number) => boolean): void => {
  const { size } = state.rules;
  const hand = state.hands[color];
  if (hand === 0) return;
  stamp = (stamp + 1) >>> 0;
  if (stamp === 0) {
    seen.fill(0);
    stamp = 1;
  }
  const base = color * size;
  const blocked = state.blocked;
  const corners = state.corners;
  const first = state.placed[color] === 0;
  for (let row = 0; row < size; row++) {
    let open = corners[base + row] & ~blocked[base + row];
    while (open !== 0) {
      const col = 31 - Math.clz32(open & -open);
      open &= open - 1;
      for (let p = 0; p < PIECES.length; p++) {
        if ((hand & (1 << p)) === 0) continue;
        const own = PIECES[p].orientations;
        for (let n = 0; n < own.length; n++) {
          const orientation = ORIENTATIONS[own[n]];
          const contacts = first ? orientation.allContacts : orientation.contacts;
          for (let k = 0; k < contacts.length; k += 2) {
            const top = row - contacts[k];
            const left = col - contacts[k + 1];
            if (top < 0 || left < 0 || top + orientation.height > size || left + orientation.width > size) continue;
            const move = orientation.index * MAX_CELLS + top * STRIDE + left;
            if (seen[move] === stamp) continue;
            seen[move] = stamp;
            if (fits(blocked, base + top, orientation.rows, left) && visit(move)) return;
          }
        }
      }
    }
  }
};

export const legalMoves = (state: GameState, color: number = state.toMove): number[] => {
  const moves: number[] = [];
  walkMoves(state, color, (move) => {
    moves.push(move);
    return false;
  });
  return moves;
};

export const hasLegalMove = (state: GameState, color: number = state.toMove): boolean => {
  let found = false;
  walkMoves(state, color, () => {
    found = true;
    return true;
  });
  return found;
};

const advance = (state: GameState): void => {
  const { colors } = state.rules;
  for (let step = 1; step <= colors; step++) {
    const next = (state.toMove + step) % colors;
    if (!state.out[next]) {
      state.toMove = next;
      return;
    }
  }
  state.over = true;
};

/** Play a legal move for the colour to move. Legality is the caller's: the AI has just generated it. */
export const applyMove = (state: GameState, move: number): void => {
  const { size, colors } = state.rules;
  const color = state.toMove;
  const orientation = moveOrientation(move);
  const top = moveRow(move);
  const left = moveCol(move);
  const full = (1 << size) - 1;
  const { blocked, corners } = state;
  const { rows } = orientation;
  const base = color * size;

  for (let i = 0; i < rows.length; i++) {
    const row = top + i;
    const mask = rows[i] << left;
    for (let other = 0; other < colors; other++) blocked[other * size + row] |= mask;
    const sides = ((mask << 1) | (mask >>> 1)) & full;
    blocked[base + row] |= sides;
    if (row > 0) {
      blocked[base + row - 1] |= mask;
      corners[base + row - 1] |= sides;
    }
    if (row + 1 < size) {
      blocked[base + row + 1] |= mask;
      corners[base + row + 1] |= sides;
    }
  }
  const cells = orientation.cells;
  for (let i = 0; i < cells.length; i++) state.board[(top + cells[i][0]) * size + left + cells[i][1]] = color;

  state.hands[color] &= ~(1 << orientation.piece);
  state.last[color] = orientation.piece;
  state.placed[color] += cells.length;
  advance(state);
};

/** The colour to move has no legal move: it is out for the rest of the game. */
export const passTurn = (state: GameState): void => {
  state.out[state.toMove] = 1;
  advance(state);
};

export const SINGLE_LAST_BONUS = 5;
export const ALL_PLACED_BONUS = 15;

/** The official advanced score: -1 per square left in hand, +15 for placing everything, +5 more if the single went last. */
export const scoreOf = (state: GameState, color: number): number => {
  if (state.hands[color] === 0) {
    return ALL_PLACED_BONUS + (state.last[color] === 0 ? SINGLE_LAST_BONUS : 0);
  }
  return state.placed[color] - TOTAL_SQUARES;
};

export const scores = (state: GameState): number[] =>
  Array.from({ length: state.rules.colors }, (_, color) => scoreOf(state, color));

/** The colours on the top score. */
export const winners = (state: GameState): number[] => {
  const all = scores(state);
  const best = Math.max(...all);
  return all.flatMap((score, color) => (score === best ? [color] : []));
};
