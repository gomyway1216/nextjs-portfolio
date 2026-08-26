/**
 * Riichi Mahjong — seeded pseudo-random number generator.
 *
 * The A/B self-play harness replays the *same* wall for both arms (duplicate
 * mahjong), so every source of randomness in the engine and the AI has to be
 * reproducible from a seed. `Math.random` is therefore banned everywhere under
 * `engine/` and `ai/`, and no external RNG dependency is used: this file is the
 * single source of randomness.
 *
 * The generator is xorshift128 (Marsaglia 2003) seeded through splitmix32, so
 * the same seed always yields a byte-identical stream on every platform —
 * everything is done in 32-bit integer arithmetic, with no floating point in
 * the state transition.
 *
 * Like the rest of `engine/`, this module has no React or DOM dependency.
 */

/** A deterministic uint32 stream. */
export interface Rng {
  /** Next raw value, an integer in `[0, 2^32)`. */
  next(): number;
  /**
   * Next integer in `[0, n)`, uniformly distributed. Rejection sampling is
   * used rather than `next() % n`, so there is no modulo bias even when `n`
   * does not divide 2^32.
   */
  nextInt(n: number): number;
}

const UINT32 = 0x100000000;

/** FNV-1a (32-bit) — turns a string seed into a 32-bit integer. */
function hashString(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * splitmix32 — used only to expand a single 32-bit seed into the four words of
 * the xorshift128 state. Seeding a small-state xorshift directly with a
 * low-entropy value (`1`, `2`, ...) leaves it correlated for the first few
 * outputs; splitmix32 avalanches the seed first.
 */
function splitmix32(state: number): () => number {
  let x = state >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/**
 * Create a deterministic generator. Equal seeds (by value, and for numbers by
 * their uint32 truncation) always produce the identical sequence.
 *
 * Number seeds are coerced with `>>> 0`, so only the low 32 bits matter; use a
 * string seed when a wider seed space is wanted.
 */
export function createRng(seed: number | string): Rng {
  const base = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const mix = splitmix32(base);

  let x = mix();
  let y = mix();
  let z = mix();
  let w = mix();

  // The all-zero state is a fixed point of xorshift; splitmix32 essentially
  // never produces it, but the engine must not have a silent dead branch.
  if ((x | y | z | w) === 0) {
    x = 0x9e3779b9;
    y = 0x243f6a88;
    z = 0xb7e15162;
    w = 0x85ebca6b;
  }

  const next = (): number => {
    const t = (x ^ (x << 11)) >>> 0;
    x = y;
    y = z;
    z = w;
    w = ((w ^ (w >>> 19)) ^ (t ^ (t >>> 8))) >>> 0;
    return w;
  };

  const nextInt = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`nextInt bound must be a positive integer, got ${n}`);
    }
    if (n > UINT32) {
      throw new Error(`nextInt bound must be at most 2^32, got ${n}`);
    }
    // Largest multiple of n that fits in a uint32; values at or above it would
    // make the low residues more likely, so they are rejected and redrawn.
    const limit = UINT32 - (UINT32 % n);
    let value = next();
    while (value >= limit) value = next();
    return value % n;
  };

  return { next, nextInt };
}

/**
 * Fisher-Yates shuffle. Returns a new array; the input is never mutated.
 *
 * Each of the `n!` orderings is equally likely given a uniform `rng`, which is
 * what the wall conservation tests assume.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}
