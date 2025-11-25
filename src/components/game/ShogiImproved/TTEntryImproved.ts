import { Te } from './types';

// Transposition Table Entry
export class TTEntryImproved {
  // Constants for bound types
  static readonly EXACTLY_VALUE = 0;  // Exact evaluation value
  static readonly LOWER_BOUND = 1;    // Value is at least this (fail high)
  static readonly UPPER_BOUND = 2;    // Value is at most this (fail low)

  // Hash value for position verification
  HashVal: number;

  // Best move from previous search
  best: Te | null;

  // Second best move from previous search
  second: Te | null;

  // Evaluation value from previous search
  value: number;

  // Type of value (exact, lower, or upper bound)
  flag: number;

  // Move number when evaluated
  tesu: number;

  // Depth in search tree
  depth: number;

  // Remaining depth searched
  remainDepth: number;

  constructor() {
    this.HashVal = 0;
    this.best = null;
    this.second = null;
    this.value = 0;
    this.flag = TTEntryImproved.EXACTLY_VALUE;
    this.tesu = 0;
    this.depth = 0;
    this.remainDepth = 0;
  }
}