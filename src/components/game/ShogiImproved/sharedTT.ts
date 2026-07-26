/**
 * sharedTT.ts — lock-free shared transposition table for Lazy SMP.
 *
 * Multi-thread search (see shogi-ai.worker.ts / shogi-ai-helper.worker.ts)
 * runs one private WASM engine instance per worker and shares ONLY the
 * transposition table: all instances probe/store the same SharedArrayBuffer
 * through the tiny JS shims below, which the WASM engine calls via its
 * `sharedTtProbe` / `sharedTtStore` / `sharedShouldStop` imports. That is the
 * whole Lazy SMP coupling — helpers search the same position slightly
 * desynchronized, and their TT entries steer the main thread deeper.
 *
 * Why the TT is shared on the JS side instead of inside a `--sharedMemory`
 * WASM build: AssemblyScript places ALL static data (board, history tables,
 * NNUE accumulators, ...) at fixed linear-memory addresses, so instances
 * sharing one memory would share all mutable search state, not just the TT.
 * Per-worker private memories + a JS-side shared TT gives the exact Lazy SMP
 * semantics without refactoring the engine into thread-local arenas.
 *
 * Entry format (8 x i32 = 32 bytes, index = hashA & MASK):
 *   [0] check  = hashA ^ hashB ^ value ^ flagDepth ^ best ^ second
 *   [1] value
 *   [2] flagDepth = flag(2b) | depth<<2 (8b) | USED bit (1<<30)
 *   [3] best   (packed jsMoveKey)
 *   [4] second (previous best, for the engine's 2nd-move ordering)
 *   [5] hashB  (independent secondary position lock)
 *   [6..7] padding
 *
 * Concurrency model (standard lock-free "XOR trick", Hyatt/Mann): fields are
 * written with Atomics.store, check last. A torn read (another thread wrote
 * in between) fails the XOR test and is treated as a miss; a torn write is
 * likewise unreadable rather than wrong. The USED bit keeps flagDepth nonzero
 * so an empty slot can never validate. TT move keys are only used for move
 * ordering (matched against generated moves) and value cutoffs carry the same
 * dual-hash identity guarantee as the single-thread table.
 *
 * The header also holds the stop/generation cell: the main thread publishes
 * the active search generation before searching and 0 when done; every
 * thread's `sharedShouldStop` compares the cell against the generation it
 * was started with (checked every ~2048 nodes inside the engine).
 */

/** Must stay 2^20 to mirror the engine's private TT sizing (~32MB SAB). */
export const SHARED_TT_ENTRIES = 1 << 20;
const MASK = SHARED_TT_ENTRIES - 1;
const ENTRY_I32 = 8;
/** Header: [0] = active search generation (0 = idle). Padded to 16 i32. */
const HEADER_I32 = 16;
const GEN_CELL = 0;

export const SHARED_TT_BYTES = (HEADER_I32 + SHARED_TT_ENTRIES * ENTRY_I32) * 4;

/**
 * Create the SharedArrayBuffer for one game session, or null when the
 * environment cannot do multi-threading (no cross-origin isolation, no SAB,
 * or the ~32MB allocation fails). Callers treat null as "stay single-thread".
 */
export function createSharedTTBuffer(): SharedArrayBuffer | null {
  if (typeof SharedArrayBuffer === 'undefined') return null;
  try {
    return new SharedArrayBuffer(SHARED_TT_BYTES);
  } catch {
    return null; // allocation failure (e.g. memory-constrained mobile)
  }
}

/** True when `sab` has the exact layout createSharedTTBuffer() produces. */
export function isSharedTTBuffer(sab: unknown): sab is SharedArrayBuffer {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    sab instanceof SharedArrayBuffer &&
    sab.byteLength === SHARED_TT_BYTES
  );
}

/**
 * Per-worker view over the shared TT. The probe/store methods are handed to
 * the WASM instance as imports (see wasmEngine.enableSharedTT); everything is
 * monomorphic and allocation-free because they run on the search hot path.
 */
export class SharedTT {
  private readonly view: Int32Array;

  constructor(sab: SharedArrayBuffer) {
    if (!isSharedTTBuffer(sab)) throw new Error('sharedTT: buffer has the wrong size');
    this.view = new Int32Array(sab);
  }

  /**
   * Probe for the (`hashA`, `hashB`) pair. `hashA` chooses the slot; both
   * hashes authenticate its identity. On a hit writes
   * [value, flagDepth, best, second] into `scratch` and returns 1.
   */
  probe(hashA: number, hashB: number, scratch: Int32Array): number {
    const view = this.view;
    const keyA = hashA | 0;
    const keyB = hashB | 0;
    const base = HEADER_I32 + ((keyA & MASK) << 3);
    const check = Atomics.load(view, base);
    const value = Atomics.load(view, base + 1);
    const flagDepth = Atomics.load(view, base + 2);
    const best = Atomics.load(view, base + 3);
    const second = Atomics.load(view, base + 4);
    const storedHashB = Atomics.load(view, base + 5);
    if (flagDepth === 0) return 0; // never written (USED bit keeps real entries nonzero)
    if (storedHashB !== keyB) return 0;
    if ((check ^ storedHashB ^ value ^ flagDepth ^ best ^ second) !== keyA) return 0;
    scratch[0] = value;
    scratch[1] = flagDepth;
    scratch[2] = best;
    scratch[3] = second;
    return 1;
  }

  /**
   * Store an entry. Ports the engine's replacement policy: the same hash pair
   * is only replaced by an equal-or-deeper search (the old best move becomes
   * the `second` ordering hint); a different pair always replaces.
   */
  store(hashA: number, hashB: number, value: number, flagDepth: number, best: number): void {
    const view = this.view;
    const keyA = hashA | 0;
    const keyB = hashB | 0;
    const base = HEADER_I32 + ((keyA & MASK) << 3);
    const oCheck = Atomics.load(view, base);
    const oValue = Atomics.load(view, base + 1);
    const oFlagDepth = Atomics.load(view, base + 2);
    const oBest = Atomics.load(view, base + 3);
    const oSecond = Atomics.load(view, base + 4);
    const oHashB = Atomics.load(view, base + 5);
    let second = 0;
    if (
      oFlagDepth !== 0 &&
      oHashB === keyB &&
      (oCheck ^ oHashB ^ oValue ^ oFlagDepth ^ oBest ^ oSecond) === keyA
    ) {
      if (((flagDepth >> 2) & 0xff) < ((oFlagDepth >> 2) & 0xff)) return; // depth-preferred
      second = oBest;
    }
    Atomics.store(view, base + 1, value);
    Atomics.store(view, base + 2, flagDepth);
    Atomics.store(view, base + 3, best);
    Atomics.store(view, base + 4, second);
    Atomics.store(view, base + 5, keyB);
    // check last: readers that saw a partial write fail the XOR test above.
    Atomics.store(view, base, keyA ^ keyB ^ value ^ flagDepth ^ best ^ second);
  }

  /** Drop every entry (new game / eval-function switch). */
  clear(): void {
    // Zeroing `check` first, then flagDepth, keeps concurrent readers safe;
    // plain fill is fine because any half-cleared entry fails the XOR check
    // and flagDepth==0 entries are ignored outright.
    this.view.fill(0, HEADER_I32);
  }

  /** Publish the active search generation (main thread only; 0 = idle). */
  publishGeneration(gen: number): void {
    Atomics.store(this.view, GEN_CELL, gen | 0);
  }

  /** The generation currently published (compared against a search's own). */
  readGeneration(): number {
    return Atomics.load(this.view, GEN_CELL);
  }
}
