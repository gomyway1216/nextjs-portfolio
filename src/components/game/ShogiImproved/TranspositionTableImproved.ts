import { Te } from './types';
import { TTEntryImproved } from './TTEntryImproved';

/**
 * Simple fixed-size Transposition Table (TT).
 *
 * Design:
 * - Direct-mapped by `HashVal & 0x0fffff` (1,048,576 entries).
 * - Each slot stores a full `HashVal` for verification (to avoid using collided entries).
 * - Stores the best move and a "second best" (legacy from the Java version; still useful for move ordering).
 *
 * Why `usedCount` exists:
 * - Counting filled entries by scanning the whole array is O(N) and expensive if done frequently.
 * - We maintain an approximate used count by tracking empty->non-empty transitions.
 */
export class TranspositionTableImproved {
  // Table array - 1MB size (0x100000 entries)
  private table: (TTEntryImproved | null)[];
  private usedCount: number;

  constructor() {
    // Initialize table with 1MB entries (matching Java)
    this.table = new Array(0x100000).fill(null);
    this.usedCount = 0;
  }

  // Get entry from table
  get(HashVal: number): TTEntryImproved | null {
    const index = HashVal & 0x0fffff;

    if (this.table[index] !== null &&
        this.table[index]!.HashVal === HashVal) {
      return this.table[index];
    }

    return null;
  }

  // Add entry to table
  add(
    HashVal: number,
    value: number,
    alpha: number,
    beta: number,
    best: Te | null,
    depth: number,
    remainDepth: number,
    tesu: number
  ): void {
    const index = HashVal & 0x0fffff;
    const wasEmpty = this.table[index] === null;

    let e = this.get(HashVal);

    if (e === null) {
      e = new TTEntryImproved();
      e.second = null;
    } else {
      // Save previous best as second
      e.second = e.best;
    }

    // Update entry
    e.HashVal = HashVal;
    e.best = best;
    e.value = value;

    // Determine bound type
    if (value <= alpha) {
      e.flag = TTEntryImproved.UPPER_BOUND;
    } else if (value >= beta) {
      e.flag = TTEntryImproved.LOWER_BOUND;
    } else {
      e.flag = TTEntryImproved.EXACTLY_VALUE;
    }

    e.depth = depth;
    e.remainDepth = remainDepth;
    e.tesu = tesu;

    // Store in table
    this.table[index] = e;
    if (wasEmpty) this.usedCount++;
  }

  // Clear the table
  clear(): void {
    this.table.fill(null);
    this.usedCount = 0;
  }

  // Get table size
  size(): number {
    return this.table.length;
  }

  // Get number of entries used
  used(): number {
    return this.usedCount;
  }

  // Get fill percentage
  fillRate(): number {
    return (this.used() / this.size()) * 100;
  }
}
