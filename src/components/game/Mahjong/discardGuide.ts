/**
 * Riichi Mahjong — the discard guide (tile efficiency for the hero).
 *
 * For a hand that is holding one tile too many, answers "what does each
 * discard leave me with?": the shanten of the remaining thirteen-tile shape
 * and its ukeire — the kinds that would lower that shanten, weighted by how
 * many copies the player has not yet seen.
 *
 * This is tile efficiency and nothing else. It does not look at danger, at
 * whether the resulting hand has a yaku, at furiten, or at what the hand is
 * worth, and the UI copy says so.
 *
 * Pure and React-free, so it is unit-tested directly.
 */

import { visibleCounts } from './ai/safety';
import { kindOf, tilesToCounts } from './engine/tiles';
import type { RoundState, Seat, TileKind, UkeireEntry } from './engine/types';
import { bestDiscards } from './engine/ukeire';

export interface DiscardAdvice {
  /** The kind to discard. */
  kind: TileKind;
  /** Shanten of the hand left behind. */
  shanten: number;
  /** Unseen tiles that would lower that shanten (complete the hand at tenpai). */
  total: number;
  /** The kinds behind `total`, ascending, each with its unseen copies. */
  accepts: UkeireEntry[];
  /** Keeps the lowest reachable shanten with the widest acceptance. */
  best: boolean;
}

/**
 * Advice for every discardable kind, best first (lowest shanten, then widest
 * acceptance, then lowest kind).
 *
 * `allowed` restricts the answer to kinds the engine actually lets the player
 * discard right now (kuikae after a chi, the riichi-armed subset), and "best"
 * is judged among those only. Empty when the hand is not holding an extra
 * tile, i.e. when there is no discard to choose.
 */
export function discardAdvice(
  state: RoundState,
  seat: Seat,
  allowed?: ReadonlySet<TileKind>,
): DiscardAdvice[] {
  const player = state.players[seat];
  const meldCount = player.melds.length;
  if (player.hand.length !== 14 - 3 * meldCount) return [];

  const candidates = bestDiscards(
    tilesToCounts(player.hand),
    meldCount,
    visibleCounts(state, seat),
  ).filter((candidate) => allowed === undefined || allowed.has(kindOf(candidate.tile)));
  if (candidates.length === 0) return [];

  const top = candidates[0];
  return candidates.map((candidate) => ({
    kind: kindOf(candidate.tile),
    shanten: candidate.shanten,
    total: candidate.ukeire.total,
    accepts: candidate.ukeire.tiles,
    best:
      candidate.shanten === top.shanten && candidate.ukeire.total === top.ukeire.total,
  }));
}

/**
 * Unseen copies of each kind from `seat`'s point of view, in the order given.
 *
 * "Seen" is the player's own hand, every meld, every pond and every face-up
 * dora indicator — the same histogram the advice above is weighted by.
 */
export function unseenCounts(
  state: RoundState,
  seat: Seat,
  kinds: readonly TileKind[],
): UkeireEntry[] {
  const visible = visibleCounts(state, seat);
  return kinds.map((kind) => ({ kind, remaining: Math.max(0, 4 - visible[kind]) }));
}
