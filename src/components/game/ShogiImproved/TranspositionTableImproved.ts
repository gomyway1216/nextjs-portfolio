import { Te } from './types';
import { TTEntryImproved } from './TTEntryImproved';

// Transposition Table for position caching
export class TranspositionTableImproved {
  // Table array - 1MB size (0x100000 entries)
  private table: (TTEntryImproved | null)[];

  constructor() {
    // Initialize table with 1MB entries (matching Java)
    this.table = new Array(0x100000).fill(null);
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
    const index = HashVal & 0x0fffff;
    this.table[index] = e;
  }

  // Clear the table
  clear(): void {
    this.table.fill(null);
  }

  // Get table size
  size(): number {
    return this.table.length;
  }

  // Get number of entries used
  used(): number {
    let count = 0;
    for (const entry of this.table) {
      if (entry !== null) {
        count++;
      }
    }
    return count;
  }

  // Get fill percentage
  fillRate(): number {
    return (this.used() / this.size()) * 100;
  }
}