/**
 * MobilityTable - Precomputed table for fast move generation
 * Based on Thell 3.0.3 implementation
 *
 * For each possible line pattern (3^8 = 6561 patterns), stores:
 * - Which positions are movable
 * - How many discs would flip in each direction
 */

import {
  BOARD_SIZE,
  BOARD_POWER_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  Color,
  Flipable,
} from './types';

/**
 * Item for a single line pattern
 */
export interface MobilityItem {
  movables: number;           // Count of movable positions in this pattern
  flip: Flipable[];           // Flip info for each position (0-7)
}

/**
 * MobilityTable class
 * Stores precomputed mobility information for all possible line patterns
 */
export class MobilityTable {
  private items: MobilityItem[];

  constructor(color: Color) {
    this.items = new Array(BOARD_POWER_SIZE);
    this.init(color);
  }

  /**
   * Get mobility item for a line pattern index
   */
  get(index: number): MobilityItem {
    return this.items[index];
  }

  /**
   * Check if position i is movable for this line pattern
   */
  isMovable(index: number, position: number): boolean {
    const item = this.items[index];
    const flip = item.flip[position];
    return flip.upper !== flip.lower;
  }

  /**
   * Initialize the mobility table for a given color
   */
  private init(color: Color): void {
    for (let idx = 0; idx < BOARD_POWER_SIZE; idx++) {
      // Decode the index into a line pattern
      let index = idx;
      const line: Color[] = new Array(BOARD_SIZE);
      for (let i = 0; i < BOARD_SIZE; i++) {
        line[i] = (index % 3 - 1) as Color;
        index = Math.floor(index / 3);
      }

      const item: MobilityItem = {
        movables: 0,
        flip: new Array(BOARD_SIZE),
      };

      // Check each position in the line
      for (let i = 0; i < BOARD_SIZE; i++) {
        let lower = 0;
        let upper = 0;

        if (line[i] === EMPTY) {
          // Check negative direction (lower)
          if (i > 0 && line[i - 1] === -color) {
            let j = -2;
            while (i + j >= 0 && line[i + j] === -color) {
              j--;
            }
            if (i + j >= 0 && line[i + j] === color) {
              lower = j + 1;
            }
          }

          // Check positive direction (upper)
          if (i < BOARD_SIZE - 1 && line[i + 1] === -color) {
            let j = 2;
            while (i + j < BOARD_SIZE && line[i + j] === -color) {
              j++;
            }
            if (i + j < BOARD_SIZE && line[i + j] === color) {
              upper = j - 1;
            }
          }
        }

        item.flip[i] = { lower, upper };

        // Count movable positions
        if (upper !== lower) {
          item.movables++;
        }
      }

      this.items[idx] = item;
    }
  }
}

/**
 * Precomputed mobility tables for both colors
 */
let blackMobilityTable: MobilityTable | null = null;
let whiteMobilityTable: MobilityTable | null = null;

/**
 * Get the mobility table for a given color
 */
export function getMobilityTable(color: Color): MobilityTable {
  if (color === BLACK) {
    if (!blackMobilityTable) {
      blackMobilityTable = new MobilityTable(BLACK);
    }
    return blackMobilityTable;
  } else {
    if (!whiteMobilityTable) {
      whiteMobilityTable = new MobilityTable(WHITE);
    }
    return whiteMobilityTable;
  }
}

/**
 * Initialize both mobility tables (call at startup for better performance)
 */
export function initMobilityTables(): void {
  getMobilityTable(BLACK);
  getMobilityTable(WHITE);
}
