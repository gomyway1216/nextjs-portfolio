/**
 * Riichi Mahjong — furiten (振聴).
 *
 * A furiten player may never win by ron; tsumo is always allowed. Three
 * separate situations produce it, and this module owns all three:
 *
 * 1. **Pond furiten** — any kind the hand waits on already sits in the
 *    player's *own* discard pile. This is recomputed from the pond on every
 *    query, so it appears and disappears as the wait changes (a common way
 *    out of furiten is to change the wait to kinds you have never discarded).
 * 2. **Temporary furiten** ({@link PlayerState.temporaryFuriten}) — the player
 *    declined (or could not declare) a winning tile that another seat put on
 *    the table. It lasts until that player's next draw.
 * 3. **Riichi furiten** ({@link PlayerState.riichiFuriten}) — the same miss
 *    after a riichi declaration. The wait can no longer change, so the
 *    restriction lasts for the rest of the hand.
 *
 * Furiten is a property of the hand's *shape*, not of its value: passing on a
 * tile that completes the hand but carries no yaku still makes the player
 * furiten, which is why {@link markIfMissedWin} is driven by
 * {@link completesHand} rather than by whether a ron was legal.
 *
 * Like every other `engine/` module this file is free of React/DOM so the
 * self-play harness in `scripts/` can import it directly.
 */

import { isComplete, waits } from './shanten';
import { kindOf, tilesToCounts } from './tiles';
import type { PlayerState, RoundState, TileId, TileKind } from './types';

/**
 * The player's concealed tiles in *waiting* form, i.e. `13 - 3 * melds`
 * tiles, or `null` when the hand is not currently waiting on a tile.
 *
 * A hand holding one extra tile (the player has drawn and not yet discarded)
 * is reduced by removing the drawn tile, which is the shape the wait was
 * defined on. A hand holding an extra tile with nothing marked as drawn — the
 * moment after a chi/pon, before the caller discards — has no well-defined
 * wait yet and yields `null`.
 */
export function waitingTiles(player: PlayerState): TileId[] | null {
  const needed = 13 - 3 * player.melds.length;
  if (player.hand.length === needed) return player.hand;
  if (player.hand.length === needed + 1 && player.drawn !== null) {
    const drawn = player.drawn;
    return player.hand.filter((tile) => tile !== drawn);
  }
  return null;
}

/**
 * Tile kinds that complete the player's hand right now, ascending. Empty when
 * the hand is not tenpai (or has no defined waiting shape — see
 * {@link waitingTiles}).
 */
export function playerWaits(player: PlayerState): TileKind[] {
  const tiles = waitingTiles(player);
  if (tiles === null) return [];
  return waits(tilesToCounts(tiles), player.melds.length);
}

/** Distinct kinds sitting in the player's own pond, called tiles included. */
export function pondKinds(player: PlayerState): Set<TileKind> {
  const kinds = new Set<TileKind>();
  for (const entry of player.discards) kinds.add(kindOf(entry.tile));
  return kinds;
}

/**
 * True when at least one of the player's own waits is already in their own
 * pond. This is evaluated fresh every time rather than cached, because the
 * answer changes whenever the wait changes.
 */
export function isPondFuriten(player: PlayerState): boolean {
  const pond = pondKinds(player);
  if (pond.size === 0) return false;
  return playerWaits(player).some((kind) => pond.has(kind));
}

/**
 * True when the player may not declare ron.
 *
 * `state` is the round the player belongs to; it is used to reject a stale or
 * detached {@link PlayerState}, which would otherwise silently answer for the
 * wrong hand.
 */
export function isFuriten(player: PlayerState, state: RoundState): boolean {
  if (state.players[player.seat] !== player) {
    throw new Error(
      `isFuriten: the player passed for seat ${player.seat} is not the one in this round`,
    );
  }
  if (player.temporaryFuriten || player.riichiFuriten) return true;
  return isPondFuriten(player);
}

/**
 * Record that a winning tile went past the player uncalled.
 *
 * Sets temporary furiten always, and permanent riichi furiten when the player
 * has already declared — after a declaration the wait is frozen, so nothing
 * can ever clear it.
 */
export function markMissedWin(player: PlayerState): void {
  player.temporaryFuriten = true;
  if (player.riichi !== null) player.riichiFuriten = true;
}

/**
 * True when `kind` completes the player's hand.
 *
 * Equivalent to `playerWaits(player).includes(kind)` but a single shanten
 * evaluation instead of thirty-four, which matters: this runs for every seat
 * on every discard.
 */
export function completesHand(player: PlayerState, kind: TileKind): boolean {
  const tiles = waitingTiles(player);
  if (tiles === null) return false;
  const counts = tilesToCounts(tiles);
  if (counts[kind] >= 4) return false;
  counts[kind] += 1;
  return isComplete(counts, player.melds.length);
}

/**
 * Apply {@link markMissedWin} only when `kind` actually completes the hand.
 * Returns whether the player was made furiten by this tile.
 */
export function markIfMissedWin(player: PlayerState, kind: TileKind): boolean {
  if (!completesHand(player, kind)) return false;
  markMissedWin(player);
  return true;
}

/** Clear temporary furiten. Called from the player's next draw, and only there. */
export function clearTemporaryFuriten(player: PlayerState): void {
  player.temporaryFuriten = false;
}
