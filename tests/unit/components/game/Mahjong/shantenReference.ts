/**
 * Deliberately slow reference implementations for the shanten tests.
 *
 * Nothing here is memoised, split per suit, or pruned beyond the block budget:
 * the point is that each function is short enough to be checked by eye, so the
 * fast DP in `engine/shanten.ts` can be cross-checked against it on tens of
 * thousands of random hands. Never import this from production code.
 */

import { TILE_KIND_COUNT, type TileCounts } from '@/components/game/Mahjong/engine/types';

/** True when `kind` can start a run (a number tile of rank 1..7). */
function canStartRun(kind: number): boolean {
  return kind < 27 && kind % 9 <= 6;
}

/** True when `kind` and `kind + 1` are in the same number suit. */
function canStartPartialRun(kind: number): boolean {
  return kind < 27 && kind % 9 <= 7;
}

/**
 * Brute-force standard shanten.
 *
 * Walks every multiset of blocks that can be carved out of the hand: complete
 * sets (triplet or run), partial sets (pair, adjacent proto-run, gapped
 * proto-run) and at most one pair reserved as the head. Blocks are always taken
 * in non-decreasing order of their lowest kind, so every shape is reached and
 * none is reached twice by a different ordering.
 *
 * The winning shape is four sets plus a head, i.e. five blocks. The head is the
 * fifth, so sets plus partial sets may never exceed `4 - meldCount` whether or
 * not a head has been reserved. Each node of the recursion scores
 * `8 - 2 * (meldCount + sets) - partials - (head ? 1 : 0)` and the answer is
 * the minimum over the whole tree.
 */
export function referenceStandardShanten(counts: TileCounts, meldCount: number): number {
  const hand = Uint8Array.from(counts);
  const cap = 4 - meldCount;
  let best = Number.POSITIVE_INFINITY;

  const visit = (start: number, sets: number, partials: number, head: boolean): void => {
    const value = 8 - 2 * (meldCount + sets) - partials - (head ? 1 : 0);
    if (value < best) best = value;

    // The head is the fifth block, so it stays available even once the four
    // set/partial slots are full.
    const room = sets + partials < cap;
    if (!room && head) return;

    for (let kind = start; kind < TILE_KIND_COUNT; kind += 1) {
      if (hand[kind] === 0) continue;

      if (room && hand[kind] >= 3) {
        hand[kind] -= 3;
        visit(kind, sets + 1, partials, head);
        hand[kind] += 3;
      }
      if (room && canStartRun(kind) && hand[kind + 1] > 0 && hand[kind + 2] > 0) {
        hand[kind] -= 1;
        hand[kind + 1] -= 1;
        hand[kind + 2] -= 1;
        visit(kind, sets + 1, partials, head);
        hand[kind] += 1;
        hand[kind + 1] += 1;
        hand[kind + 2] += 1;
      }
      if (hand[kind] >= 2) {
        hand[kind] -= 2;
        if (room) visit(kind, sets, partials + 1, head);
        if (!head) visit(kind, sets, partials, true);
        hand[kind] += 2;
      }
      if (room && canStartPartialRun(kind) && hand[kind + 1] > 0) {
        hand[kind] -= 1;
        hand[kind + 1] -= 1;
        visit(kind, sets, partials + 1, head);
        hand[kind] += 1;
        hand[kind + 1] += 1;
      }
      if (room && canStartRun(kind) && hand[kind + 2] > 0) {
        hand[kind] -= 1;
        hand[kind + 2] -= 1;
        visit(kind, sets, partials + 1, head);
        hand[kind] += 1;
        hand[kind + 2] += 1;
      }
    }
  };

  visit(0, 0, 0, false);
  return best;
}

/**
 * Independent winning-shape check: is this histogram exactly `4 - meldCount`
 * concealed sets plus one pair? Written without any reference to the shanten
 * formula so it can anchor the definition of tenpai in the tests.
 */
export function isWinningShape(counts: TileCounts, meldCount: number): boolean {
  const hand = Uint8Array.from(counts);
  const needSets = 4 - meldCount;

  const takeSets = (remaining: number): boolean => {
    if (remaining === 0) return hand.every((n) => n === 0);
    let kind = 0;
    while (kind < TILE_KIND_COUNT && hand[kind] === 0) kind += 1;
    if (kind === TILE_KIND_COUNT) return false;

    if (hand[kind] >= 3) {
      hand[kind] -= 3;
      const ok = takeSets(remaining - 1);
      hand[kind] += 3;
      if (ok) return true;
    }
    if (canStartRun(kind) && hand[kind + 1] > 0 && hand[kind + 2] > 0) {
      hand[kind] -= 1;
      hand[kind + 1] -= 1;
      hand[kind + 2] -= 1;
      const ok = takeSets(remaining - 1);
      hand[kind] += 1;
      hand[kind + 1] += 1;
      hand[kind + 2] += 1;
      if (ok) return true;
    }
    return false;
  };

  for (let pair = 0; pair < TILE_KIND_COUNT; pair += 1) {
    if (hand[pair] < 2) continue;
    hand[pair] -= 2;
    const ok = takeSets(needSets);
    hand[pair] += 2;
    if (ok) return true;
  }
  return false;
}
