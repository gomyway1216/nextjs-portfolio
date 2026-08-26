/**
 * Riichi Mahjong — shanten (向聴数).
 *
 * Shanten is the number of tile exchanges still needed to reach tenpai:
 * `-1` is a complete hand, `0` is tenpai, `1` is one-shanten, and so on. Three
 * winning shapes exist and the hand's shanten is the minimum over all of them:
 *
 * - the standard shape (four sets plus a pair),
 * - chiitoitsu (seven distinct pairs),
 * - kokushi musou (the thirteen terminals/honours plus a pair).
 *
 * Everything here works on a {@link TileCounts} histogram of the *concealed*
 * tiles only; called melds are passed separately as `meldCount` because each
 * one already contributes a finished set (a kan counts as one set, and its
 * fourth tile is not part of the histogram).
 *
 * ## The standard formula
 *
 * A decomposition of the concealed tiles picks `S` complete sets, `P` partial
 * sets (a pair or a two-tile proto-run), and optionally one pair as the head.
 * The winning shape has five blocks in total — four sets and the head — so:
 *
 * - with a head: `meldCount + S + P + 1 <= 5`
 * - without a head: `meldCount + S + P <= 4`
 *
 * Both reduce to `S + P <= 4 - meldCount`. The refusal to count a fifth block
 * when no head exists is what makes shapes like `123m456m789m12p34s` correctly
 * one-shanten rather than tenpai: a five-block hand with no pair anywhere still
 * has to rework one block into the head.
 *
 * The shanten of such a decomposition is
 *
 * ```
 * 8 - 2 * (meldCount + S) - P - (head ? 1 : 0)
 * ```
 *
 * and the hand's standard shanten is the minimum over every decomposition.
 *
 * ## How the minimum is found
 *
 * Writing `B = S + P` for the number of blocks, the score to maximise is
 * `2 * S + P = S + B`. Blocks never span two suits, so each of the four
 * suit groups (manzu, pinzu, souzu, honours) is decomposed independently into
 * a small profile — "the most sets reachable while using exactly `b` blocks" —
 * and a four-step DP joins the profiles under the shared block budget. Suit
 * profiles are memoised on the suit's packed count signature, so a hand costs
 * a handful of map lookups plus a 4x5x5 DP per head candidate.
 */

import { TILE_KIND_COUNT, type ShantenBreakdown, type TileCounts, type TileKind } from './types';
import { HONOR_START, PIN_START, SOU_START, YAOCHUU_KINDS } from './tiles';

/**
 * Sentinel returned for a shape that cannot apply to the hand at all —
 * chiitoitsu and kokushi are impossible once any meld has been called. It is
 * deliberately far above the worst real shanten (8) so it loses every `min`
 * comparison while staying a plain finite number.
 */
export const SHANTEN_UNREACHABLE = 99;

/** A winning hand needs four sets plus a head: five blocks, never more. */
const MAX_BLOCKS = 5;

/** Ranges of the four independent decomposition groups. */
const GROUPS: readonly { start: number; length: number; runs: boolean }[] = [
  { start: 0, length: 9, runs: true },
  { start: PIN_START, length: 9, runs: true },
  { start: SOU_START, length: 9, runs: true },
  { start: HONOR_START, length: 7, runs: false },
];

/**
 * `profile[b]` is the largest number of complete sets reachable using exactly
 * `b` blocks from one suit group, or `-1` when `b` blocks are unreachable.
 */
type SuitProfile = Int8Array;

const numberProfiles = new Map<number, SuitProfile>();
const honorProfiles = new Map<number, SuitProfile>();

/** Scratch buffer for the recursive decomposition; never escapes this module. */
const scratch = new Int8Array(9);

/**
 * Enumerate every way to carve `scratch[0..length)` into sets and partial sets,
 * recording the best set count for each block total. Blocks are taken in
 * non-decreasing order of their lowest rank, which covers every decomposition
 * exactly once per shape.
 */
function decompose(length: number, runs: boolean, best: SuitProfile, index: number, sets: number, partials: number): void {
  const blocks = sets + partials;
  if (sets > best[blocks]) best[blocks] = sets;
  if (blocks >= MAX_BLOCKS || index >= length) return;

  if (scratch[index] === 0) {
    decompose(length, runs, best, index + 1, sets, partials);
    return;
  }

  // Triplet.
  if (scratch[index] >= 3) {
    scratch[index] -= 3;
    decompose(length, runs, best, index, sets + 1, partials);
    scratch[index] += 3;
  }
  // Run.
  if (runs && index + 2 < length && scratch[index + 1] > 0 && scratch[index + 2] > 0) {
    scratch[index] -= 1;
    scratch[index + 1] -= 1;
    scratch[index + 2] -= 1;
    decompose(length, runs, best, index, sets + 1, partials);
    scratch[index] += 1;
    scratch[index + 1] += 1;
    scratch[index + 2] += 1;
  }
  // Pair (a partial set here; the head is handled by the caller).
  if (scratch[index] >= 2) {
    scratch[index] -= 2;
    decompose(length, runs, best, index, sets, partials + 1);
    scratch[index] += 2;
  }
  // Adjacent proto-run (ryanmen or penchan).
  if (runs && index + 1 < length && scratch[index + 1] > 0) {
    scratch[index] -= 1;
    scratch[index + 1] -= 1;
    decompose(length, runs, best, index, sets, partials + 1);
    scratch[index] += 1;
    scratch[index + 1] += 1;
  }
  // Gapped proto-run (kanchan).
  if (runs && index + 2 < length && scratch[index + 2] > 0) {
    scratch[index] -= 1;
    scratch[index + 2] -= 1;
    decompose(length, runs, best, index, sets, partials + 1);
    scratch[index] += 1;
    scratch[index + 2] += 1;
  }
  // Leave this tile floating.
  scratch[index] -= 1;
  decompose(length, runs, best, index, sets, partials);
  scratch[index] += 1;
}

/**
 * Cache signature of one suit group: three bits per kind, so the key stays a
 * small integer (27 bits at most) and stays collision-free even if a caller
 * hands over a malformed histogram with more than four copies of a kind.
 */
function suitKey(counts: TileCounts, start: number, length: number): number {
  let key = 0;
  for (let i = 0; i < length; i += 1) key = (key << 3) | Math.min(7, counts[start + i]);
  return key;
}

function profileFor(counts: TileCounts, group: number): SuitProfile {
  const { start, length, runs } = GROUPS[group];
  const cache = runs ? numberProfiles : honorProfiles;
  const key = suitKey(counts, start, length);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  for (let i = 0; i < length; i += 1) scratch[i] = counts[start + i];
  const best = new Int8Array(MAX_BLOCKS + 1).fill(-1);
  decompose(length, runs, best, 0, 0, 0);
  cache.set(key, best);
  return best;
}

/**
 * Maximum of `S + B` (complete sets plus blocks) over every decomposition of
 * the whole concealed hand that uses at most `cap` blocks.
 */
function maxSetsPlusBlocks(counts: TileCounts, cap: number): number {
  if (cap <= 0) return 0;

  let dp = new Int8Array(cap + 1).fill(-1);
  dp[0] = 0;
  for (let group = 0; group < GROUPS.length; group += 1) {
    const profile = profileFor(counts, group);
    const next = new Int8Array(cap + 1).fill(-1);
    for (let used = 0; used <= cap; used += 1) {
      if (dp[used] < 0) continue;
      for (let take = 0; take <= cap - used; take += 1) {
        const sets = profile[take];
        if (sets < 0) continue;
        const value = dp[used] + sets;
        if (value > next[used + take]) next[used + take] = value;
      }
    }
    dp = next;
  }

  let best = 0;
  for (let blocks = 0; blocks <= cap; blocks += 1) {
    if (dp[blocks] >= 0 && dp[blocks] + blocks > best) best = dp[blocks] + blocks;
  }
  return best;
}

/**
 * Shanten for the standard four-sets-plus-a-pair shape.
 *
 * `counts` holds only the concealed tiles; `meldCount` is how many sets have
 * already been called (0..4). A kan counts as one meld.
 */
export function standardShanten(counts: TileCounts, meldCount: number): number {
  if (meldCount < 0 || meldCount > 4) {
    throw new Error(`meldCount must be 0..4, got ${meldCount}`);
  }
  const cap = 4 - meldCount;
  const base = 8 - 2 * meldCount;

  // No head: the four remaining blocks are all sets or partial sets.
  let best = base - maxSetsPlusBlocks(counts, cap);

  // With a head: every pair in hand is a candidate, and it is the fifth block.
  const work = Uint8Array.from(counts);
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (work[kind] < 2) continue;
    work[kind] -= 2;
    const value = base - maxSetsPlusBlocks(work, cap) - 1;
    work[kind] += 2;
    if (value < best) best = value;
  }
  return best;
}

/**
 * Shanten for chiitoitsu (seven distinct pairs).
 *
 * A kind held three or four times still only supplies one pair, and a hand
 * with fewer than seven distinct kinds must first acquire the missing ones —
 * hence the `7 - distinct` term. Only meaningful with no melds called.
 */
export function chiitoitsuShanten(counts: TileCounts): number {
  let pairs = 0;
  let distinct = 0;
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    const n = counts[kind];
    if (n === 0) continue;
    distinct += 1;
    if (n >= 2) pairs += 1;
  }
  return 6 - pairs + Math.max(0, 7 - distinct);
}

/**
 * Shanten for kokushi musou (all thirteen terminals and honours plus a pair).
 * Only meaningful with no melds called.
 */
export function kokushiShanten(counts: TileCounts): number {
  let distinct = 0;
  let hasPair = false;
  for (const kind of YAOCHUU_KINDS) {
    const n = counts[kind];
    if (n === 0) continue;
    distinct += 1;
    if (n >= 2) hasPair = true;
  }
  return 13 - distinct - (hasPair ? 1 : 0);
}

/**
 * Shanten of the hand across all three shapes.
 *
 * Chiitoitsu and kokushi are only considered when nothing has been called;
 * with a meld the standard shape is the only one left.
 */
export function shanten(counts: TileCounts, meldCount = 0): number {
  const standard = standardShanten(counts, meldCount);
  if (meldCount > 0) return standard;
  return Math.min(standard, chiitoitsuShanten(counts), kokushiShanten(counts));
}

/**
 * Shanten of each shape alongside the minimum. Shapes that cannot apply
 * (chiitoitsu and kokushi once a meld exists) report
 * {@link SHANTEN_UNREACHABLE}.
 */
export function shantenBreakdown(counts: TileCounts, meldCount = 0): ShantenBreakdown {
  const standard = standardShanten(counts, meldCount);
  const chiitoitsu = meldCount > 0 ? SHANTEN_UNREACHABLE : chiitoitsuShanten(counts);
  const kokushi = meldCount > 0 ? SHANTEN_UNREACHABLE : kokushiShanten(counts);
  return {
    shanten: Math.min(standard, chiitoitsu, kokushi),
    standard,
    chiitoitsu,
    kokushi,
  };
}

/** True when the tiles already form a winning shape. */
export function isComplete(counts: TileCounts, meldCount: number): boolean {
  return shanten(counts, meldCount) === -1;
}

/** True when the hand is waiting on at least one tile. */
export function isTenpai(counts: TileCounts, meldCount: number): boolean {
  return shanten(counts, meldCount) === 0;
}

/**
 * Kinds that complete the hand, ascending.
 *
 * `counts` must be a waiting hand (`13 - 3 * meldCount` concealed tiles). A
 * kind already held four times is never a wait because no fifth copy exists.
 * Furiten is a separate concern and is not applied here.
 */
export function waits(counts: TileCounts, meldCount: number): TileKind[] {
  const result: TileKind[] = [];
  const work = Uint8Array.from(counts);
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (work[kind] >= 4) continue;
    work[kind] += 1;
    if (isComplete(work, meldCount)) result.push(kind);
    work[kind] -= 1;
  }
  return result;
}
