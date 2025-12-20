/**
 * TranspositionTableImprovedPacked
 *
 * Goal:
 * - Keep the same "direct-mapped TT" behavior as `TranspositionTableImproved`,
 *   but avoid allocating `TTEntryImproved` and `Te` objects at every node.
 *
 * Why this matters (in JS/TS):
 * - A typical alpha-beta search visits tens/hundreds of thousands of nodes per move.
 * - The previous TT stored `Te` objects (`best`/`second`) and cloned them for most nodes,
 *   which creates significant GC pressure and slows the engine down.
 *
 * This packed TT stores only:
 * - `HashVal` (position key)
 * - `value` / `flag` / `remainDepth`
 * - `bestKey` / `secondKey` where the key is `moveKey(te)` used by the engine for ordering.
 *
 * Notes:
 * - Direct-mapped by `HashVal & 0x0fffff` (1,048,576 slots), matching the legacy table size.
 * - Uses a separate `used[]` byte array so `HashVal === 0` is still storable (rare but possible).
 * - Replacement policy: only overwrite an existing entry for the *same* position if the new entry
 *   has `remainDepth >= oldRemainDepth` (keeps deeper info).
 */
export class TranspositionTableImprovedPacked {
  static readonly EXACTLY_VALUE = 0; // Exact evaluation value
  static readonly LOWER_BOUND = 1; // Value is at least this (fail high)
  static readonly UPPER_BOUND = 2; // Value is at most this (fail low)

  private static readonly SIZE = 0x100000;
  private static readonly MASK = 0x0fffff;

  // Public readonly arrays for hot-path reads (engine accesses them after `probe()`).
  readonly hash: Uint32Array;
  readonly value: Int32Array;
  readonly flag: Uint8Array;
  readonly remainDepth: Uint8Array;
  readonly bestKey: Uint32Array;
  readonly secondKey: Uint32Array;

  private readonly used: Uint8Array;
  private usedCount = 0;

  constructor() {
    this.hash = new Uint32Array(TranspositionTableImprovedPacked.SIZE);
    this.value = new Int32Array(TranspositionTableImprovedPacked.SIZE);
    this.flag = new Uint8Array(TranspositionTableImprovedPacked.SIZE);
    this.remainDepth = new Uint8Array(TranspositionTableImprovedPacked.SIZE);
    this.bestKey = new Uint32Array(TranspositionTableImprovedPacked.SIZE);
    this.secondKey = new Uint32Array(TranspositionTableImprovedPacked.SIZE);
    this.used = new Uint8Array(TranspositionTableImprovedPacked.SIZE);
  }

  size(): number {
    return this.hash.length;
  }

  usedEntries(): number {
    return this.usedCount;
  }

  fillRate(): number {
    return (this.usedCount / this.size()) * 100;
  }

  clear(): void {
    // Clearing 1M slots is not something we do per move; only when starting a new game.
    this.used.fill(0);
    this.usedCount = 0;
  }

  /**
   * Probe the TT.
   * @returns the table index if present, otherwise -1.
   */
  probe(hashVal: number): number {
    const index = hashVal & TranspositionTableImprovedPacked.MASK;
    if (this.used[index] === 0) return -1;
    if (this.hash[index] !== (hashVal >>> 0)) return -1;
    return index;
  }

  /**
   * Store an entry.
   *
   * Inputs:
   * - `bestKey`/`secondKey` are move keys created by the engine's `moveKey(te)`.
   * - `remainDepth` is the remaining depth searched at this node.
   */
  add(
    hashVal: number,
    value: number,
    alpha: number,
    beta: number,
    bestKey: number,
    remainDepth: number
  ): void {
    const index = hashVal & TranspositionTableImprovedPacked.MASK;
    const hashU = hashVal >>> 0;

    let flag = TranspositionTableImprovedPacked.EXACTLY_VALUE;
    if (value <= alpha) flag = TranspositionTableImprovedPacked.UPPER_BOUND;
    else if (value >= beta) flag = TranspositionTableImprovedPacked.LOWER_BOUND;

    // Replacement policy:
    // - If the slot currently holds the same position, keep the deeper entry.
    if (this.used[index] !== 0 && this.hash[index] === hashU) {
      const oldRemain = this.remainDepth[index] | 0;
      if (remainDepth < oldRemain) return;

      // Save previous best as second-best (useful for move ordering).
      this.secondKey[index] = this.bestKey[index];
    } else {
      // New position overwriting this slot.
      if (this.used[index] === 0) this.usedCount++;
      this.used[index] = 1;
      this.hash[index] = hashU;
      this.secondKey[index] = 0;
    }

    this.bestKey[index] = bestKey >>> 0;
    this.value[index] = value | 0;
    this.flag[index] = flag;
    this.remainDepth[index] = remainDepth & 0xff;
  }
}

