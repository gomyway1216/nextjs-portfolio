/**
 * Riichi Mahjong — wall, dead wall, dora and the deal.
 *
 * The index layout is the one frozen in the {@link WallState} doc comment in
 * `types.ts`; this module is its only implementation and every other module
 * must go through these helpers rather than indexing `wall.tiles` directly.
 *
 *     index:  0 ............ drawIndex ........ liveEnd | 122 ........... 135
 *             +---- drawn ----+---- live wall ---+------ dead wall -------+
 *
 * - Live wall: `[drawIndex, liveEnd)`. Normal draws advance `drawIndex`; the
 *   haitei (last) tile is `tiles[liveEnd - 1]`.
 * - Dead wall *slots*: `122..135`, the fourteen fixed positions that hold the
 *   ten indicator tiles and the four replacement tiles. These indices never
 *   move. Each kan additionally pulls one tile out of the live end — modelled
 *   by decrementing `liveEnd` — so after `k` kans the non-drawable region
 *   starts at `liveEnd = 122 - k`, i.e. `k` tiles *before* the fixed slots,
 *   and the number of drawable tiles per hand shrinks by one per kan.
 * - Dora indicator `i` lives at `130 - 2 * i`, its ura at `131 - 2 * i`
 *   (`i` in `0..4`): 130/131, 128/129, 126/127, 124/125, 122/123.
 * - Replacement (rinshan) draw `n` (0-based) takes `tiles[135 - n]`:
 *   135, 134, 133, 132. These four never overlap the ten indicator slots.
 *
 * `wall.tiles` is fixed once {@link buildWall} returns — tiles are never moved
 * within the array, only the `drawIndex` / `liveEnd` cursors move. That keeps
 * the "136 tiles exist exactly once" invariant trivially checkable.
 *
 * Mutation contract: a round owns exactly one `WallState`, so the drawing
 * helpers ({@link dealHands}, {@link drawTile}, {@link drawReplacementTile},
 * {@link revealKanDora}) **mutate the wall passed to them in place** and return
 * only the tiles they produced. The query helpers are pure.
 */

import { shuffle, type Rng } from './random';
import { MAX_KAN_COUNT } from './rules';
import { doraFromIndicator, sortTiles } from './tiles';
import {
  DEAD_WALL_START,
  TILE_COUNT,
  type TileId,
  type TileKind,
  type WallState,
} from './types';

/**
 * Maximum number of kans in a hand, hence of dora indicators beyond the first.
 * Re-exported from `rules.ts` so there is a single definition of the limit.
 */
export const MAX_KANS = MAX_KAN_COUNT;
/** Maximum number of dora indicators (the initial one plus one per kan). */
export const MAX_DORA_INDICATORS = MAX_KANS + 1;
/** Number of tiles dealt to each seat. */
export const HAND_SIZE = 13;
/** Number of seats dealt to. */
const SEAT_COUNT = 4;

/** Index of dora indicator `i` (`0..4`). */
function doraIndicatorIndex(i: number): number {
  return 130 - 2 * i;
}

/** Index of ura indicator `i` (`0..4`). */
function uraIndicatorIndex(i: number): number {
  return 131 - 2 * i;
}

/** Index of replacement (rinshan) tile `n` (`0..3`). */
function replacementIndex(n: number): number {
  return 135 - n;
}

/**
 * Reveal indicator `i` and record its ura counterpart. The ura indicator is
 * always stored, even when `rules.uraDora` is off — whether it counts is a
 * scoring decision, not a wall decision.
 */
function revealIndicator(wall: WallState, i: number): TileId {
  const indicator = wall.tiles[doraIndicatorIndex(i)];
  wall.doraIndicators.push(indicator);
  wall.uraIndicators.push(wall.tiles[uraIndicatorIndex(i)]);
  return indicator;
}

/**
 * Build a fresh wall: all 136 tile ids shuffled with `rng`, the live wall set
 * to `[0, 122)`, and the first dora indicator turned face up (with its ura
 * recorded but hidden).
 *
 * The same `rng` seed always produces the same wall, which is what the
 * duplicate-wall A/B harness relies on.
 */
export function buildWall(rng: Rng): WallState {
  const ordered: TileId[] = Array.from({ length: TILE_COUNT }, (_, i) => i);
  const tiles = shuffle(ordered, rng);
  const wall: WallState = {
    tiles,
    drawIndex: 0,
    liveEnd: DEAD_WALL_START,
    rinshanDrawn: 0,
    doraIndicators: [],
    uraIndicators: [],
  };
  revealIndicator(wall, 0);
  return wall;
}

/**
 * Deal the starting hands. Mutates `wall` (advances `drawIndex` by 52) and
 * returns 13 tiles per seat, ascending, indexed by seat `0..3`.
 *
 * Real play deals in blocks of four and then one apiece; this takes 13
 * consecutive tiles per seat instead. The two are indistinguishable from
 * inside the game — the wall order is already uniformly random, so both
 * procedures induce the same distribution over (hand, remaining wall), and
 * nothing observable depends on which physical tile of the block a seat got.
 */
export function dealHands(wall: WallState): TileId[][] {
  const needed = SEAT_COUNT * HAND_SIZE;
  if (liveTilesRemaining(wall) < needed) {
    throw new Error(
      `Cannot deal: only ${liveTilesRemaining(wall)} live tiles left, need ${needed}`,
    );
  }
  const hands: TileId[][] = [];
  for (let seat = 0; seat < SEAT_COUNT; seat += 1) {
    const start = wall.drawIndex + seat * HAND_SIZE;
    hands.push(sortTiles(wall.tiles.slice(start, start + HAND_SIZE)));
  }
  wall.drawIndex += needed;
  return hands;
}

/**
 * Take the next live tile. Mutates `wall` (advances `drawIndex`).
 * Throws when the live wall is exhausted — callers must check
 * {@link isExhausted} and end the hand in an exhaustive draw instead.
 */
export function drawTile(wall: WallState): TileId {
  if (isExhausted(wall)) {
    throw new Error('Cannot draw: the live wall is exhausted');
  }
  const tile = wall.tiles[wall.drawIndex];
  wall.drawIndex += 1;
  return tile;
}

/**
 * Take a replacement (rinshan) tile after a kan. Mutates `wall`: the live wall
 * loses its last tile to the dead wall (`liveEnd -= 1`, so the haitei shifts
 * one tile earlier) and `rinshanDrawn` increases.
 *
 * Throws after four replacements — a fifth kan is impossible with only 14 dead
 * wall tiles, and the round should have ended in suukaikan (not a v1 rule) or
 * been rejected as an illegal kan before reaching here.
 */
export function drawReplacementTile(wall: WallState): TileId {
  if (wall.rinshanDrawn >= MAX_KANS) {
    throw new Error(`Cannot draw a ${MAX_KANS + 1}th replacement tile`);
  }
  if (isExhausted(wall)) {
    throw new Error('Cannot kan: the live wall is exhausted');
  }
  const tile = wall.tiles[replacementIndex(wall.rinshanDrawn)];
  wall.rinshanDrawn += 1;
  wall.liveEnd -= 1;
  return tile;
}

/**
 * Turn the next kan dora indicator face up and record its ura. Mutates `wall`.
 * Returns the newly revealed indicator tile (not the dora kind it points at —
 * use {@link visibleDoraKinds} for that).
 *
 * Throws once all five indicators are face up (the initial one plus one per
 * kan).
 */
export function revealKanDora(wall: WallState): TileId {
  const i = wall.doraIndicators.length;
  if (i >= MAX_DORA_INDICATORS) {
    throw new Error(`Cannot reveal more than ${MAX_DORA_INDICATORS} dora indicators`);
  }
  return revealIndicator(wall, i);
}

/** Tiles still drawable from the live wall. */
export function liveTilesRemaining(wall: WallState): number {
  return wall.liveEnd - wall.drawIndex;
}

/** True when no live tiles remain, i.e. the hand ends in an exhaustive draw. */
export function isExhausted(wall: WallState): boolean {
  return liveTilesRemaining(wall) <= 0;
}

/** Dora kinds indicated by the face-up indicators, in reveal order. */
export function visibleDoraKinds(wall: WallState): TileKind[] {
  return wall.doraIndicators.map(doraFromIndicator);
}

/**
 * Dora kinds indicated by the ura indicators, in reveal order. Only a riichi
 * winner may look at these, and only when `rules.uraDora` is on — the wall
 * itself does not enforce that.
 */
export function uraDoraKinds(wall: WallState): TileKind[] {
  return wall.uraIndicators.map(doraFromIndicator);
}
