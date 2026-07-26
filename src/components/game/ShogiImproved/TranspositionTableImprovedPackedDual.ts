/**
 * Packed direct-mapped transposition table locked by two independent hashes.
 *
 * The primary hash retains the existing 30-bit production identity and index.
 * The secondary full-u32 hash only verifies that identity, preventing a primary
 * collision from reusing a value or move from another position.
 */
export class TranspositionTableImprovedPackedDual {
  static readonly EXACTLY_VALUE = 0;
  static readonly LOWER_BOUND = 1;
  static readonly UPPER_BOUND = 2;

  private static readonly SIZE = 0x100000;
  private static readonly MASK = 0x0fffff;

  readonly primaryHash: Uint32Array;
  readonly secondaryHash: Uint32Array;
  readonly value: Int32Array;
  readonly flag: Uint8Array;
  readonly remainDepth: Uint8Array;
  readonly bestKey: Uint32Array;
  readonly secondKey: Uint32Array;

  private readonly used: Uint8Array;
  private usedCount = 0;

  constructor() {
    this.primaryHash = new Uint32Array(TranspositionTableImprovedPackedDual.SIZE);
    this.secondaryHash = new Uint32Array(TranspositionTableImprovedPackedDual.SIZE);
    this.value = new Int32Array(TranspositionTableImprovedPackedDual.SIZE);
    this.flag = new Uint8Array(TranspositionTableImprovedPackedDual.SIZE);
    this.remainDepth = new Uint8Array(TranspositionTableImprovedPackedDual.SIZE);
    this.bestKey = new Uint32Array(TranspositionTableImprovedPackedDual.SIZE);
    this.secondKey = new Uint32Array(TranspositionTableImprovedPackedDual.SIZE);
    this.used = new Uint8Array(TranspositionTableImprovedPackedDual.SIZE);
  }

  size(): number {
    return this.primaryHash.length;
  }

  usedEntries(): number {
    return this.usedCount;
  }

  fillRate(): number {
    return (this.usedCount / this.size()) * 100;
  }

  clear(): void {
    this.used.fill(0);
    this.usedCount = 0;
  }

  /** @returns the table index if the complete hash pair is present, otherwise -1. */
  probe(primaryHash: number, secondaryHash: number): number {
    const index = primaryHash & TranspositionTableImprovedPackedDual.MASK;
    if (this.used[index] === 0) return -1;
    if (this.primaryHash[index] !== (primaryHash >>> 0)) return -1;
    if (this.secondaryHash[index] !== (secondaryHash >>> 0)) return -1;
    return index;
  }

  add(
    primaryHash: number,
    secondaryHash: number,
    value: number,
    alpha: number,
    beta: number,
    bestKey: number,
    remainDepth: number
  ): void {
    const index = primaryHash & TranspositionTableImprovedPackedDual.MASK;
    const primaryU = primaryHash >>> 0;
    const secondaryU = secondaryHash >>> 0;

    let flag = TranspositionTableImprovedPackedDual.EXACTLY_VALUE;
    if (value <= alpha) flag = TranspositionTableImprovedPackedDual.UPPER_BOUND;
    else if (value >= beta) flag = TranspositionTableImprovedPackedDual.LOWER_BOUND;

    const samePosition =
      this.used[index] !== 0 &&
      this.primaryHash[index] === primaryU &&
      this.secondaryHash[index] === secondaryU;

    if (samePosition) {
      if (remainDepth < (this.remainDepth[index] | 0)) return;
      this.secondKey[index] = this.bestKey[index];
    } else {
      if (this.used[index] === 0) this.usedCount++;
      this.used[index] = 1;
      this.primaryHash[index] = primaryU;
      this.secondaryHash[index] = secondaryU;
      this.secondKey[index] = 0;
    }

    this.bestKey[index] = bestKey >>> 0;
    this.value[index] = value | 0;
    this.flag[index] = flag;
    this.remainDepth[index] = remainDepth & 0xff;
  }
}
