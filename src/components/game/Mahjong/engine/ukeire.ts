/**
 * Riichi Mahjong — ukeire (受け入れ) and discard evaluation.
 *
 * Ukeire is the set of tile kinds that would lower the hand's shanten, scored
 * by how many copies could still be drawn. "Could still be drawn" is decided
 * from the player's own point of view: a `visible` histogram counts every tile
 * this player can see — their concealed hand, their own and everyone else's
 * melds, every discard on the table, and every face-up dora indicator. Tiles
 * hidden in the wall or in another player's hand are indistinguishable from
 * each other and both count as live.
 */

import { TILE_KIND_COUNT, type DiscardCandidate, type TileCounts, type TileKind, type UkeireEntry, type UkeireResult } from './types';
import { shanten } from './shanten';

/** A fresh all-zero visibility histogram. */
export function emptyVisible(): TileCounts {
  return new Uint8Array(TILE_KIND_COUNT);
}

/**
 * Record `n` more copies of `kind` as seen. Mutates and returns `visible` so
 * callers can accumulate a whole table in one pass. Counts saturate at four.
 */
export function addVisible(visible: TileCounts, kind: TileKind, n = 1): TileCounts {
  visible[kind] = Math.min(4, visible[kind] + n);
  return visible;
}

/** Copies of `kind` the player has not yet seen. */
function remainingOf(visible: TileCounts, kind: TileKind): number {
  return Math.max(0, 4 - visible[kind]);
}

/**
 * Kinds that reduce the shanten of a waiting hand.
 *
 * `counts` must sum to `13 - 3 * meldCount` concealed tiles — a hand waiting
 * on a draw. (The constraint is on the histogram's *sum*; `counts.length` is
 * always 34.)
 * At tenpai the result is exactly the winning tiles, so this doubles as an
 * ukeire-weighted wait list.
 *
 * Kinds are ascending. A kind that improves the hand but has no copies left is
 * still listed, with `remaining: 0`, so callers can tell "no longer possible"
 * apart from "does not help".
 */
export function ukeire(counts: TileCounts, meldCount: number, visible: TileCounts): UkeireResult {
  const base = shanten(counts, meldCount);
  const work = Uint8Array.from(counts);
  const tiles: UkeireEntry[] = [];
  let total = 0;

  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (work[kind] >= 4) continue;
    work[kind] += 1;
    const improved = shanten(work, meldCount) < base;
    work[kind] -= 1;
    if (!improved) continue;
    const remaining = remainingOf(visible, kind);
    tiles.push({ kind, remaining });
    total += remaining;
  }

  return { shanten: base, tiles, total };
}

/**
 * One entry per distinct *kind* held by a hand that has just drawn (the
 * histogram sums to `14 - 3 * meldCount`), giving the shanten and ukeire of
 * what would be left behind after discarding it.
 *
 * Sorted best first: lowest resulting shanten, then widest acceptance, then
 * lowest kind. `DiscardCandidate.tile` is the representative id `kind * 4`;
 * it identifies the *kind* to discard, and the caller is expected to map it
 * back onto a concrete tile it actually holds (choosing, for instance, a
 * non-red copy of a five).
 */
export function bestDiscards(counts: TileCounts, meldCount: number, visible: TileCounts): DiscardCandidate[] {
  const work = Uint8Array.from(counts);
  const candidates: DiscardCandidate[] = [];

  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (work[kind] === 0) continue;
    work[kind] -= 1;
    const result = ukeire(work, meldCount, visible);
    work[kind] += 1;
    candidates.push({ tile: kind * 4, shanten: result.shanten, ukeire: result });
  }

  candidates.sort((a, b) => {
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    if (a.ukeire.total !== b.ukeire.total) return b.ukeire.total - a.ukeire.total;
    return a.tile - b.tile;
  });
  return candidates;
}
