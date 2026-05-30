/**
 * Board class - Othello game board with move validation and execution
 * Based on Thell 3.0.3 implementation
 */

import { getMobilityTable } from './MobilityTable';
import {
BLACK,
BOARD_SIZE,
Color,
createDisc,
Disc,
EMPTY,
MAX_TURNS,
Point,
POINT_PRIORITY_LIST,
POWER3,
WALL,
WHITE,
} from './types';

/**
 * Indexer for pattern-based evaluation
 * Tracks indices for horizontal, vertical, and diagonal lines
 */
export class Indexer {
  horizontal: number[] = new Array(BOARD_SIZE).fill(0);
  vertical: number[] = new Array(BOARD_SIZE).fill(0);
  diagDownto: number[] = new Array((BOARD_SIZE - 3) * 2 + 1).fill(0); // 11 diagonals
  diagUpto: number[] = new Array((BOARD_SIZE - 3) * 2 + 1).fill(0);   // 11 diagonals

  /**
   * Recalculate all indices from the board state
   */
  recalc(board: Board): void {
    // Clear all indices
    this.horizontal.fill(0);
    this.vertical.fill(0);
    this.diagDownto.fill(0);
    this.diagUpto.fill(0);

    // Calculate horizontal and vertical indices
    for (let y = 1; y <= BOARD_SIZE; y++) {
      for (let x = 1; x <= BOARD_SIZE; x++) {
        const color = board.getColor(x, y);
        this.horizontal[y - 1] += POWER3[x - 1] * (color + 1);
        this.vertical[x - 1] += POWER3[y - 1] * (color + 1);
      }
    }

    // Calculate diagonal indices (non-main diagonals)
    for (let len = 3; len < BOARD_SIZE; len++) {
      const i1 = len - 3;
      const i2 = BOARD_SIZE * 2 - 3 - len;

      for (let i = 0; i < len; i++) {
        // diag_upto: goes from lower-left to upper-right
        this.diagUpto[i1] += POWER3[i] * (board.getColor(i + 1, len - i) + 1);
        this.diagUpto[i2] += POWER3[i] * (board.getColor(BOARD_SIZE - len + i + 1, BOARD_SIZE - i) + 1);

        // diag_downto: goes from upper-left to lower-right
        this.diagDownto[i1] += POWER3[i] * (board.getColor(i + 1, BOARD_SIZE - len + i + 1) + 1);
        this.diagDownto[i2] += POWER3[i] * (board.getColor(BOARD_SIZE - len + i + 1, 1 + i) + 1);
      }

      // Fill remaining positions with EMPTY
      for (let i = len; i < BOARD_SIZE; i++) {
        this.diagUpto[i1] += POWER3[i] * (EMPTY + 1);
        this.diagUpto[i2] += POWER3[i] * (EMPTY + 1);
        this.diagDownto[i1] += POWER3[i] * (EMPTY + 1);
        this.diagDownto[i2] += POWER3[i] * (EMPTY + 1);
      }
    }

    // Calculate main diagonal indices
    for (let i = 0; i < BOARD_SIZE; i++) {
      // Main diagonal (upper-left to lower-right)
      this.diagDownto[BOARD_SIZE - 3] += POWER3[i] * (board.getColor(i + 1, i + 1) + 1);
      // Anti-diagonal (lower-left to upper-right)
      this.diagUpto[BOARD_SIZE - 3] += POWER3[i] * (board.getColor(i + 1, BOARD_SIZE - i) + 1);
    }
  }

  /**
   * Update indices after a move
   */
  update(updates: Disc[]): void {
    if (updates.length === 0) return;

    // First disc is the placed disc
    const first = updates[0];
    this.updateSingle(first.x, first.y, first.color);

    // Remaining discs are flipped discs
    for (let i = 1; i < updates.length; i++) {
      // Flipped discs change by 2 * color (from -color to +color)
      this.updateSingle(updates[i].x, updates[i].y, 2 * updates[i].color as Color);
    }
  }

  /**
   * Reverse index updates (for undo)
   */
  reverse(updates: Disc[]): void {
    if (updates.length === 0) return;

    const first = updates[0];
    this.updateSingle(first.x, first.y, -first.color as Color);

    for (let i = 1; i < updates.length; i++) {
      this.updateSingle(updates[i].x, updates[i].y, -2 * updates[i].color as Color);
    }
  }

  /**
   * Update indices for a single position change
   */
  private updateSingle(x: number, y: number, offset: number): void {
    // Horizontal
    this.horizontal[y - 1] += offset * POWER3[x - 1];

    // Vertical
    this.vertical[x - 1] += offset * POWER3[y - 1];

    // Diagonal (upper-left to lower-right direction)
    const ddIndex = x - y;
    if (-BOARD_SIZE + 3 <= ddIndex && ddIndex <= BOARD_SIZE - 3) {
      const index = Math.min(x - 1, y - 1);
      this.diagDownto[ddIndex + BOARD_SIZE - 3] += offset * POWER3[index];
    }

    // Anti-diagonal (lower-left to upper-right direction)
    const duIndex = x + y;
    if (3 < duIndex && duIndex < BOARD_SIZE * 2 - 1) {
      const index = Math.min(x - 1, BOARD_SIZE - y);
      this.diagUpto[duIndex - 4] += offset * POWER3[index];
    }
  }
}

/**
 * Board class representing the Othello game state
 */
export class Board {
  // Board state (10x10 with walls)
  private rawBoard: Color[][] = [];

  // Turn counter
  private turns: number = 0;

  // Current player's color
  private currentColor: Color = BLACK;

  // Disc counts
  private discs: { [key: number]: number } = {
    [EMPTY]: 60,
    [BLACK]: 2,
    [WHITE]: 2,
  };

  // Index table for pattern evaluation
  private indexTable: Indexer = new Indexer();

  // Update history (for undo)
  private updateLog: Disc[][] = [];

  // Empty squares list (for fast move generation)
  private emptyList: Point[] = [];

  constructor(rawBoard?: Color[], turnColor?: Color) {
    if (rawBoard && turnColor !== undefined) {
      this.initFromArray(rawBoard, turnColor);
    } else {
      this.init();
    }
  }

  /**
   * Initialize board to starting position
   */
  init(): void {
    // Initialize raw board with walls
    this.rawBoard = new Array(BOARD_SIZE + 2);
    for (let x = 0; x < BOARD_SIZE + 2; x++) {
      this.rawBoard[x] = new Array(BOARD_SIZE + 2).fill(EMPTY);
    }

    // Set walls
    for (let y = 0; y < BOARD_SIZE + 2; y++) {
      this.rawBoard[0][y] = WALL;
      this.rawBoard[BOARD_SIZE + 1][y] = WALL;
    }
    for (let x = 0; x < BOARD_SIZE + 2; x++) {
      this.rawBoard[x][0] = WALL;
      this.rawBoard[x][BOARD_SIZE + 1] = WALL;
    }

    // Initial disc placement
    this.rawBoard[4][4] = WHITE;
    this.rawBoard[5][5] = WHITE;
    this.rawBoard[4][5] = BLACK;
    this.rawBoard[5][4] = BLACK;

    // Initialize counts
    this.discs = {
      [EMPTY]: BOARD_SIZE * BOARD_SIZE - 4,
      [BLACK]: 2,
      [WHITE]: 2,
    };

    this.turns = 0;
    this.currentColor = BLACK;

    this.indexTable.recalc(this);
    this.updateLog = [];
    this.setupEmptyList();
  }

  /**
   * Initialize from array representation
   */
  private initFromArray(rawBoard: Color[], turnColor: Color): void {
    // Initialize raw board with walls
    this.rawBoard = new Array(BOARD_SIZE + 2);
    for (let x = 0; x < BOARD_SIZE + 2; x++) {
      this.rawBoard[x] = new Array(BOARD_SIZE + 2).fill(WALL);
    }

    // Set walls and copy board
    this.discs = { [EMPTY]: 0, [BLACK]: 0, [WHITE]: 0 };

    for (let y = 1; y <= BOARD_SIZE; y++) {
      for (let x = 1; x <= BOARD_SIZE; x++) {
        const color = rawBoard[(y - 1) * BOARD_SIZE + (x - 1)];
        this.rawBoard[x][y] = color;
        this.discs[color]++;
      }
    }

    this.turns = MAX_TURNS - this.discs[EMPTY];
    this.currentColor = turnColor;

    this.indexTable.recalc(this);
    this.updateLog = [];
    this.setupEmptyList();
  }

  /**
   * Get color at position
   */
  getColor(x: number, y: number): Color {
    return this.rawBoard[x][y];
  }

  /**
   * Get current turn number
   */
  getTurns(): number {
    return this.turns;
  }

  /**
   * Get current player's color
   */
  getCurrentColor(): Color {
    return this.currentColor;
  }

  /**
   * Count discs of a given color
   */
  countDisc(color: Color): number {
    return this.discs[color] || 0;
  }

  /**
   * Set color at a position (for network sync)
   */
  setColor(x: number, y: number, color: Color): void {
    const oldColor = this.rawBoard[x][y];
    if (oldColor !== color) {
      if (oldColor !== WALL) {
        this.discs[oldColor]--;
      }
      this.rawBoard[x][y] = color;
      this.discs[color]++;
    }
  }

  /**
   * Set current player's color (for network sync)
   */
  setCurrentColor(color: Color): void {
    this.currentColor = color;
  }

  /**
   * Set turn number (for network sync)
   */
  setTurns(turns: number): void {
    this.turns = turns;
  }

  /**
   * Recalculate indices after bulk update (for network sync)
   */
  recalcIndices(): void {
    this.indexTable.recalc(this);
    this.setupEmptyList();
  }

  /**
   * Get the index table (for evaluation)
   */
  getIndexTable(): Indexer {
    return this.indexTable;
  }

  /**
   * Get the last update (for UI)
   */
  getUpdate(): Disc[] {
    if (this.updateLog.length === 0) return [];
    return this.updateLog[this.updateLog.length - 1];
  }

  /**
   * Set up the empty list for fast move generation
   */
  setupEmptyList(): void {
    this.emptyList = [];
    for (const p of POINT_PRIORITY_LIST) {
      if (this.rawBoard[p.x][p.y] === EMPTY) {
        this.emptyList.push({ x: p.x, y: p.y });
      }
    }
  }

  /**
   * Check if a move is valid at the given position
   */
  private isMovable(p: Point): boolean {
    if (this.rawBoard[p.x][p.y] !== EMPTY) return false;

    const mt = getMobilityTable(this.currentColor);
    const idx = this.indexTable;

    // Check horizontal
    if (mt.isMovable(idx.horizontal[p.y - 1], p.x - 1)) return true;

    // Check vertical
    if (mt.isMovable(idx.vertical[p.x - 1], p.y - 1)) return true;

    // Check diagonal (up-to direction)
    const duIndex = p.x + p.y;
    if (3 < duIndex && duIndex < BOARD_SIZE * 2 - 1) {
      const index = Math.min(p.x - 1, BOARD_SIZE - p.y);
      if (mt.isMovable(idx.diagUpto[duIndex - 4], index)) return true;
    }

    // Check diagonal (down-to direction)
    const ddIndex = p.x - p.y;
    if (-BOARD_SIZE + 3 <= ddIndex && ddIndex <= BOARD_SIZE - 3) {
      const index = Math.min(p.x - 1, p.y - 1);
      if (mt.isMovable(idx.diagDownto[ddIndex + BOARD_SIZE - 3], index)) return true;
    }

    return false;
  }

  /**
   * Get all movable positions for the current player
   */
  getMovablePos(): Point[] {
    const movables: Point[] = [];

    if (this.emptyList.length === 0) {
      // Fallback to priority list
      for (const p of POINT_PRIORITY_LIST) {
        if (this.isMovable(p)) {
          movables.push({ x: p.x, y: p.y });
        }
      }
    } else {
      for (const p of this.emptyList) {
        if (this.isMovable(p)) {
          movables.push({ x: p.x, y: p.y });
        }
      }
    }

    return movables;
  }

  /**
   * Count mobility for current player
   */
  countMobility(): number {
    let count = 0;
    if (this.emptyList.length === 0) {
      for (const p of POINT_PRIORITY_LIST) {
        if (this.isMovable(p)) count++;
      }
    } else {
      for (const p of this.emptyList) {
        if (this.isMovable(p)) count++;
      }
    }
    return count;
  }

  /**
   * Check if a given color can make a move
   */
  canMove(color: Color): boolean {
    const originalColor = this.currentColor;
    this.currentColor = color;

    const mt = getMobilityTable(color);
    const idx = this.indexTable;

    // Check all lines for any movable position
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (mt.get(idx.horizontal[i]).movables > 0) {
        this.currentColor = originalColor;
        return true;
      }
      if (mt.get(idx.vertical[i]).movables > 0) {
        this.currentColor = originalColor;
        return true;
      }
    }

    // Check main diagonals
    if (mt.get(idx.diagDownto[BOARD_SIZE - 3]).movables > 0) {
      this.currentColor = originalColor;
      return true;
    }
    if (mt.get(idx.diagUpto[BOARD_SIZE - 3]).movables > 0) {
      this.currentColor = originalColor;
      return true;
    }

    // Check other diagonals (need more careful check)
    for (let len = 3; len < BOARD_SIZE; len++) {
      const item1d = mt.get(idx.diagDownto[len - 3]);
      const item2d = mt.get(idx.diagDownto[BOARD_SIZE * 2 - 3 - len]);
      const item1u = mt.get(idx.diagUpto[len - 3]);
      const item2u = mt.get(idx.diagUpto[BOARD_SIZE * 2 - 3 - len]);

      for (let i = 0; i < len; i++) {
        if (item1d.flip[i].upper !== item1d.flip[i].lower) {
          this.currentColor = originalColor;
          return true;
        }
        if (item2d.flip[i].upper !== item2d.flip[i].lower) {
          this.currentColor = originalColor;
          return true;
        }
        if (item1u.flip[i].upper !== item1u.flip[i].lower) {
          this.currentColor = originalColor;
          return true;
        }
        if (item2u.flip[i].upper !== item2u.flip[i].lower) {
          this.currentColor = originalColor;
          return true;
        }
      }
    }

    this.currentColor = originalColor;
    return false;
  }

  /**
   * Check if game is over
   */
  isGameOver(): boolean {
    if (this.turns === MAX_TURNS) return true;
    return !this.canMove(BLACK) && !this.canMove(WHITE);
  }

  /**
   * Make a move at the given position
   * Returns true if successful, false if invalid
   */
  move(point: Point): boolean {
    const update: Disc[] = [];

    // Place the disc
    const c = this.currentColor;
    update.push(createDisc(point.x, point.y, c));

    const mt = getMobilityTable(c);
    const idx = this.indexTable;

    // Flip horizontal
    const horzFlip = mt.get(idx.horizontal[point.y - 1]).flip[point.x - 1];
    for (let i = horzFlip.lower; i < 0; i++) {
      this.rawBoard[point.x + i][point.y] = c;
      update.push(createDisc(point.x + i, point.y, c));
    }
    for (let i = horzFlip.upper; i > 0; i--) {
      this.rawBoard[point.x + i][point.y] = c;
      update.push(createDisc(point.x + i, point.y, c));
    }

    // Flip vertical
    const vertFlip = mt.get(idx.vertical[point.x - 1]).flip[point.y - 1];
    for (let i = vertFlip.lower; i < 0; i++) {
      this.rawBoard[point.x][point.y + i] = c;
      update.push(createDisc(point.x, point.y + i, c));
    }
    for (let i = vertFlip.upper; i > 0; i--) {
      this.rawBoard[point.x][point.y + i] = c;
      update.push(createDisc(point.x, point.y + i, c));
    }

    // Flip diagonal (up-to direction)
    const duIndex = point.x + point.y;
    if (3 < duIndex && duIndex < BOARD_SIZE * 2 - 1) {
      const index = Math.min(point.x - 1, BOARD_SIZE - point.y);
      const diagFlip = mt.get(idx.diagUpto[duIndex - 4]).flip[index];
      for (let i = diagFlip.lower; i < 0; i++) {
        this.rawBoard[point.x + i][point.y - i] = c;
        update.push(createDisc(point.x + i, point.y - i, c));
      }
      for (let i = diagFlip.upper; i > 0; i--) {
        this.rawBoard[point.x + i][point.y - i] = c;
        update.push(createDisc(point.x + i, point.y - i, c));
      }
    }

    // Flip diagonal (down-to direction)
    const ddIndex = point.x - point.y;
    if (-BOARD_SIZE + 3 <= ddIndex && ddIndex <= BOARD_SIZE - 3) {
      const index = Math.min(point.x - 1, point.y - 1);
      const diagFlip = mt.get(idx.diagDownto[ddIndex + BOARD_SIZE - 3]).flip[index];
      for (let i = diagFlip.lower; i < 0; i++) {
        this.rawBoard[point.x + i][point.y + i] = c;
        update.push(createDisc(point.x + i, point.y + i, c));
      }
      for (let i = diagFlip.upper; i > 0; i--) {
        this.rawBoard[point.x + i][point.y + i] = c;
        update.push(createDisc(point.x + i, point.y + i, c));
      }
    }

    // No discs flipped = invalid move
    if (update.length === 1) {
      return false;
    }

    // Place the disc
    this.rawBoard[point.x][point.y] = c;

    // Update disc counts
    const discDiff = update.length;
    this.discs[c] += discDiff;
    this.discs[-c as Color] -= discDiff - 1;
    this.discs[EMPTY]--;

    // Update indices
    this.indexTable.update(update);

    // Store update log
    this.updateLog.push(update);

    // Update turn
    this.turns++;
    this.currentColor = -this.currentColor as Color;

    return true;
  }

  /**
   * Pass the turn
   */
  pass(): boolean {
    this.currentColor = -this.currentColor as Color;
    this.updateLog.push([]); // Empty update for pass
    return true;
  }

  /**
   * Undo the last move
   */
  undo(): boolean {
    if (this.updateLog.length === 0) return false;

    this.currentColor = -this.currentColor as Color;

    const update = this.updateLog.pop()!;

    if (update.length === 0) {
      // Was a pass
      return true;
    }

    this.turns--;

    // Reverse index updates
    this.indexTable.reverse(update);

    // Restore placed disc
    this.rawBoard[update[0].x][update[0].y] = EMPTY;

    // Restore flipped discs
    const enemyColor = -update[0].color as Color;
    for (let i = 1; i < update.length; i++) {
      this.rawBoard[update[i].x][update[i].y] = enemyColor;
    }

    // Restore disc counts
    const discDiff = update.length;
    this.discs[update[0].color] -= discDiff;
    this.discs[enemyColor] += discDiff - 1;
    this.discs[EMPTY]++;

    // Invalidate empty list (will be rebuilt when needed)
    if (this.emptyList.length < this.discs[EMPTY]) {
      this.emptyList = [];
    }

    return true;
  }

  /**
   * Clone the board
   */
  clone(): Board {
    const newBoard = new Board();

    // Copy raw board
    for (let x = 0; x < BOARD_SIZE + 2; x++) {
      for (let y = 0; y < BOARD_SIZE + 2; y++) {
        newBoard.rawBoard[x][y] = this.rawBoard[x][y];
      }
    }

    // Copy state
    newBoard.turns = this.turns;
    newBoard.currentColor = this.currentColor;
    newBoard.discs = { ...this.discs };

    // Recalculate indices
    newBoard.indexTable.recalc(newBoard);
    newBoard.updateLog = [];
    newBoard.setupEmptyList();

    return newBoard;
  }

  /**
   * Get move history
   */
  getHistory(): Point[] {
    const history: Point[] = [];
    for (const update of this.updateLog) {
      if (update.length > 0) {
        history.push({ x: update[0].x, y: update[0].y });
      }
    }
    return history;
  }

  /**
   * Fast check for final disc count after placing at last empty square
   * Used for endgame optimization
   */
  fastCheckFinalResult(p: Point): number {
    const mt = getMobilityTable(this.currentColor);
    const idx = this.indexTable;

    let flip = 0;

    // Horizontal
    const horzFlip = mt.get(idx.horizontal[p.y - 1]).flip[p.x - 1];
    flip -= horzFlip.lower;
    flip += horzFlip.upper;

    // Vertical
    const vertFlip = mt.get(idx.vertical[p.x - 1]).flip[p.y - 1];
    flip -= vertFlip.lower;
    flip += vertFlip.upper;

    // Diagonal (up-to)
    const duIndex = p.x + p.y;
    if (3 < duIndex && duIndex < BOARD_SIZE * 2 - 1) {
      const index = Math.min(p.x - 1, BOARD_SIZE - p.y);
      const diagFlip = mt.get(idx.diagUpto[duIndex - 4]).flip[index];
      flip -= diagFlip.lower;
      flip += diagFlip.upper;
    }

    // Diagonal (down-to)
    const ddIndex = p.x - p.y;
    if (-BOARD_SIZE + 3 <= ddIndex && ddIndex <= BOARD_SIZE - 3) {
      const index = Math.min(p.x - 1, p.y - 1);
      const diagFlip = mt.get(idx.diagDownto[ddIndex + BOARD_SIZE - 3]).flip[index];
      flip -= diagFlip.lower;
      flip += diagFlip.upper;
    }

    // Calculate final result
    const blackFinal = this.discs[BLACK] + (this.currentColor === BLACK ? 1 + flip : -flip);
    const whiteFinal = this.discs[WHITE] + (this.currentColor === WHITE ? 1 + flip : -flip);

    return blackFinal - whiteFinal;
  }

  /**
   * Get empty list for endgame solver
   */
  getEmptyList(): Point[] {
    const list: Point[] = [];
    for (const p of POINT_PRIORITY_LIST) {
      if (this.rawBoard[p.x][p.y] === EMPTY) {
        list.push({ x: p.x, y: p.y });
      }
    }
    return list;
  }
}
