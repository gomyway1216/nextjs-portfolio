/**
 * Riichi Mahjong — the hero's concealed hand.
 *
 * Every interactive decision here is derived from the action list the engine
 * produced (`legalActions(state, seat)`); this component never reasons about
 * the rules itself. A tile is tappable exactly when a matching
 * {@link DiscardAction} exists, which is what makes riichi's tsumogiri lock,
 * the red-five distinction and the "armed riichi" restriction fall out for
 * free rather than being re-implemented in the UI.
 *
 * The helpers below are pure and exported so they can be unit-tested without
 * rendering anything.
 */

import type { JSX } from 'react';

import { isFuriten } from './engine/furiten';
import { isComplete, shanten as shantenOf, waits as waitsOf } from './engine/shanten';
import { isRedFive, kindOf, tilesToCounts } from './engine/tiles';
import type {
  Action,
  DiscardAction,
  PlayerState,
  RoundState,
  Seat,
  TileId,
  TileKind,
} from './engine/types';
import type { MahjongCopy } from './i18n';
import styles from './HandView.module.css';
import { TileById, tileLabel } from './TileSvg';

// ---------------------------------------------------------------------------
// Legal-discard derivation
// ---------------------------------------------------------------------------

/**
 * Group key for tiles the player cannot tell apart.
 *
 * `legalActions` enumerates one discard per *distinguishable* tile, so a hand
 * holding two ordinary 5m offers a single action naming one of them. Clicking
 * either copy has to submit that one action, hence the grouping — and the red
 * five is deliberately its own group, because discarding it costs a han.
 *
 * This mirrors the engine's private `tileClass`; the two must agree, which the
 * unit tests pin down by round-tripping real `legalActions` output.
 */
export function discardGroupKey(tile: TileId, redFives: boolean): number {
  return kindOf(tile) * 2 + (redFives && isRedFive(tile) ? 1 : 0);
}

/**
 * Map every discardable tile group to the action that plays it.
 *
 * With `riichiArmed` only the riichi-flagged discards are offered, which is
 * exactly the "restrict the clickable tiles to the riichi-legal discards"
 * behaviour the riichi toggle needs.
 */
export function buildDiscardMap(
  actions: readonly Action[],
  redFives: boolean,
  riichiArmed: boolean,
): Map<number, DiscardAction> {
  const map = new Map<number, DiscardAction>();
  for (const action of actions) {
    if (action.type !== 'discard') continue;
    if ((action.riichi === true) !== riichiArmed) continue;
    map.set(discardGroupKey(action.tile, redFives), action);
  }
  return map;
}

/** True when at least one riichi-flagged discard is on offer. */
export function canArmRiichi(actions: readonly Action[]): boolean {
  return actions.some((action) => action.type === 'discard' && action.riichi === true);
}

// ---------------------------------------------------------------------------
// Shape feedback
// ---------------------------------------------------------------------------

export interface HandShape {
  /** `-1` complete, `0` tenpai, `n` tiles away otherwise. */
  shanten: number;
  /** Tile kinds that complete the hand once the best discard is made. */
  waits: TileKind[];
}

/**
 * Shanten and waits for a player's concealed hand.
 *
 * A 13-tile hand is read directly. A 14-tile hand (the player is holding a
 * draw) is complete or else read as "the best I can do after discarding": the
 * minimum shanten over every distinct discard, and — when that minimum is
 * tenpai — the union of the waits those discards produce. That is the number a
 * player actually cares about while deciding what to throw.
 */
export function handShape(player: PlayerState): HandShape {
  const meldCount = player.melds.length;
  const base = 13 - 3 * meldCount;
  const counts = tilesToCounts(player.hand);

  if (player.hand.length <= base) {
    return { shanten: shantenOf(counts, meldCount), waits: waitsOf(counts, meldCount) };
  }
  if (isComplete(counts, meldCount)) return { shanten: -1, waits: [] };

  const seen = new Set<TileKind>();
  let best = Number.POSITIVE_INFINITY;
  const perKind: { kind: TileKind; value: number }[] = [];
  for (const tile of player.hand) {
    const kind = kindOf(tile);
    if (seen.has(kind)) continue;
    seen.add(kind);
    counts[kind] -= 1;
    const value = shantenOf(counts, meldCount);
    counts[kind] += 1;
    perKind.push({ kind, value });
    if (value < best) best = value;
  }
  if (perKind.length === 0) return { shanten: 0, waits: [] };

  const waits = new Set<TileKind>();
  if (best === 0) {
    for (const entry of perKind) {
      if (entry.value !== 0) continue;
      counts[entry.kind] -= 1;
      for (const kind of waitsOf(counts, meldCount)) waits.add(kind);
      counts[entry.kind] += 1;
    }
  }
  return { shanten: best, waits: [...waits].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface HandViewProps {
  state: RoundState;
  seat: Seat;
  copy: MahjongCopy;
  /** `legalActions(state, seat)` — the single source of what may be played. */
  actions: readonly Action[];
  riichiArmed: boolean;
  onToggleRiichi: (next: boolean) => void;
  onDiscard: (action: DiscardAction) => void;
  /** False while an AI seat is being awaited, so the hand goes inert. */
  interactive: boolean;
}

export function HandView({
  state,
  seat,
  copy,
  actions,
  riichiArmed,
  onToggleRiichi,
  onDiscard,
  interactive,
}: HandViewProps): JSX.Element {
  const player = state.players[seat];
  const drawn = player.drawn;
  const rest = drawn === null ? player.hand : player.hand.filter((tile) => tile !== drawn);

  const discardMap = buildDiscardMap(actions, state.rules.redFives, riichiArmed);
  const riichiAvailable = canArmRiichi(actions);
  const shape = handShape(player);
  const furiten = isFuriten(player, state);

  const renderTile = (tile: TileId, isDrawn: boolean): JSX.Element => {
    const action = discardMap.get(discardGroupKey(tile, state.rules.redFives));
    const playable = interactive && action !== undefined;
    return (
      <button
        key={tile}
        type="button"
        className={styles.tileButton}
        data-playable={playable}
        data-drawn={isDrawn}
        disabled={!playable}
        aria-label={tileLabel(kindOf(tile), isRedFive(tile))}
        /*
         * The action is submitted verbatim: `legalActions` names one physical
         * copy per interchangeable group and `isLegalAction` compares tile ids
         * exactly, so substituting the copy that was clicked would be refused.
         * The two copies are indistinguishable by definition, so the resulting
         * position is the same either way.
         */
        onClick={
          playable && action !== undefined ? () => onDiscard(action) : undefined
        }
      >
        <TileById tileId={tile} ariaLabel="" />
      </button>
    );
  };

  const shapeText =
    shape.shanten < 0
      ? copy.complete
      : shape.shanten === 0
        ? copy.tenpai
        : copy.shantenAway(shape.shanten);

  return (
    <section className={styles.handArea} aria-label={copy.yourHand}>
      <div className={styles.statusRow}>
        <span className={styles.shapeBadge} data-tenpai={shape.shanten <= 0}>
          {shapeText}
        </span>
        {shape.shanten <= 0 && shape.waits.length > 0 && (
          <span className={styles.waits}>
            <span className={styles.waitsLabel}>{copy.waitsLabel}</span>
            <span className={styles.waitTiles}>
              {shape.waits.map((kind) => (
                <TileById key={kind} tileId={kind * 4} size="sm" red={false} />
              ))}
            </span>
          </span>
        )}
        {furiten && <span className={styles.furiten}>{copy.furiten}</span>}
        {riichiAvailable && (
          <button
            type="button"
            className={styles.riichiToggle}
            data-armed={riichiArmed}
            aria-pressed={riichiArmed}
            onClick={() => onToggleRiichi(!riichiArmed)}
          >
            {riichiArmed ? copy.cancelRiichi : copy.armRiichi}
          </button>
        )}
      </div>

      <div className={styles.handRow}>
        <div className={styles.concealedRow}>{rest.map((tile) => renderTile(tile, false))}</div>
        {drawn !== null && (
          <div className={styles.drawnSlot} aria-label={copy.drawnTile}>
            {renderTile(drawn, true)}
          </div>
        )}
      </div>

      <p className={styles.hint}>
        {riichiArmed
          ? copy.riichiArmedHint
          : player.riichi !== null
            ? copy.riichiLocked
            : copy.chooseDiscard}
      </p>
    </section>
  );
}

export default HandView;
