/**
 * Riichi Mahjong — the table.
 *
 * Pure presentation: everything is derived from the {@link RoundState} handed
 * in, nothing is decided here. The hero seat's own concealed tiles are drawn
 * by `HandView`; this component owns the three opponent seats, the four ponds,
 * the meld strips and the centre panel (round, honba, sticks, live wall count
 * and dora indicators).
 *
 * Seats are laid out relative to the hero rather than by absolute index, so
 * the human always sits at the bottom of the screen whichever seat number they
 * hold. See {@link relativeSeat}.
 */

import type { JSX } from 'react';

import { seatWindOf } from './engine/actions';
import { tileToString } from './engine/tiles';
import type {
  DiscardEntry,
  Meld,
  PlayerState,
  RoundState,
  Seat,
  TileId,
} from './engine/types';
import { liveTilesRemaining } from './engine/wall';
import type { MahjongCopy } from './i18n';
import styles from './TableView.module.css';
import { TileById } from './TileSvg';

/** Where a seat sits on screen once the hero is pinned to the bottom. */
export type TableSide = 'self' | 'right' | 'across' | 'left';

const SIDE_ORDER: readonly TableSide[] = ['self', 'right', 'across', 'left'];

/**
 * Screen position of `seat` from `hero`'s point of view.
 *
 * Turn order runs 0 -> 1 -> 2 -> 3, and seat `n + 1` is the shimocha (the
 * player to the right), so the offset maps straight onto the compass:
 * `0` self, `1` right, `2` across, `3` left.
 */
export function relativeSeat(seat: Seat, hero: Seat): TableSide {
  return SIDE_ORDER[(((seat - hero) % 4) + 4) % 4];
}

/** Absolute seat sitting on `side` of the table from `hero`'s point of view. */
export function seatOnSide(side: TableSide, hero: Seat): Seat {
  return ((hero + SIDE_ORDER.indexOf(side)) % 4) as Seat;
}

/**
 * Split a pond into fixed-width rows, the way a real table is laid out.
 *
 * The last row is short rather than padded, and an empty pond yields no rows
 * at all (so the caller renders nothing rather than an empty grid).
 */
export function chunkPond<T>(entries: readonly T[], perRow = 6): T[][] {
  if (perRow < 1) throw new Error('chunkPond needs at least one column');
  const rows: T[][] = [];
  for (let i = 0; i < entries.length; i += perRow) {
    rows.push(entries.slice(i, i + perRow));
  }
  return rows;
}

/** Discards per pond row — the standard six-wide table layout. */
export const POND_COLUMNS = 6;

// ---------------------------------------------------------------------------
// Melds
// ---------------------------------------------------------------------------

/**
 * How each tile of a meld is drawn.
 *
 * - a called tile lies sideways, the way it is placed on a real table
 * - an ankan shows its two outer tiles face down
 */
export interface MeldTileView {
  tile: TileId;
  rotated: boolean;
  faceDown: boolean;
}

export function meldTileViews(meld: Meld): MeldTileView[] {
  return meld.tiles.map((tile, index) => {
    if (meld.type === 'ankan') {
      const hidden = index === 0 || index === meld.tiles.length - 1;
      return { tile, rotated: false, faceDown: hidden };
    }
    return {
      tile,
      rotated: tile === meld.calledTile,
      faceDown: false,
    };
  });
}

function MeldStrip({
  player,
  label,
}: {
  player: PlayerState;
  label: string;
}): JSX.Element | null {
  if (player.melds.length === 0) return null;
  return (
    <div className={styles.melds} aria-label={label}>
      {player.melds.map((meld, meldIndex) => (
        <div className={styles.meld} key={`${meld.type}-${meldIndex}-${meld.tiles[0]}`}>
          {meldTileViews(meld).map((view, tileIndex) => (
            <TileById
              key={`${view.tile}-${tileIndex}`}
              tileId={view.tile}
              rotated={view.rotated}
              faceDown={view.faceDown}
              ariaLabel=""
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pond
// ---------------------------------------------------------------------------

function Pond({
  discards,
  label,
}: {
  discards: readonly DiscardEntry[];
  label: string;
}): JSX.Element {
  const rows = chunkPond(discards, POND_COLUMNS);
  return (
    <div className={styles.pond} aria-label={label} data-empty={discards.length === 0}>
      {rows.map((row, rowIndex) => (
        <div className={styles.pondRow} key={rowIndex}>
          {row.map((entry, index) => (
            <TileById
              key={`${rowIndex}-${index}-${entry.tile}`}
              tileId={entry.tile}
              rotated={entry.riichi}
              dimmed={entry.calledBy !== null}
              ariaLabel=""
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seat panels
// ---------------------------------------------------------------------------

function SeatHeader({
  state,
  seat,
  hero,
  copy,
  active,
}: {
  state: RoundState;
  seat: Seat;
  hero: Seat;
  copy: MahjongCopy;
  active: boolean;
}): JSX.Element {
  const player = state.players[seat];
  const wind = copy.winds[seatWindOf(state, seat)];
  const isDealer = state.dealer === seat;
  return (
    <div className={styles.seatHeader} data-active={active}>
      <span className={styles.seatWind} data-dealer={isDealer}>
        {wind}
      </span>
      <span className={styles.seatName}>
        {seat === hero ? copy.you : copy.seatName(wind)}
      </span>
      {isDealer && (
        <span className={styles.dealerBadge} title={copy.dealerMark}>
          {copy.dealerMark}
        </span>
      )}
      {player.riichi !== null && (
        <span className={styles.riichiBadge} title={copy.riichiStickLabel}>
          <span className={styles.riichiStick} aria-hidden="true" />
          {copy.riichiStickLabel}
        </span>
      )}
      <span className={styles.seatScore}>{player.score.toLocaleString('en-US')}</span>
    </div>
  );
}

function OpponentSeat({
  state,
  seat,
  hero,
  copy,
  active,
  side,
}: {
  state: RoundState;
  seat: Seat;
  hero: Seat;
  copy: MahjongCopy;
  active: boolean;
  side: TableSide;
}): JSX.Element {
  const player = state.players[seat];
  const wind = copy.winds[seatWindOf(state, seat)];
  const name = copy.seatName(wind);
  return (
    <section className={styles.seat} data-side={side} aria-label={name}>
      <SeatHeader state={state} seat={seat} hero={hero} copy={copy} active={active} />
      <div
        className={styles.concealed}
        aria-label={copy.concealedLabel(name, player.hand.length)}
      >
        {player.hand.map((tile, index) => (
          <TileById key={`${tile}-${index}`} tileId={tile} faceDown ariaLabel="" />
        ))}
      </div>
      <MeldStrip player={player} label={copy.meldsLabel(name)} />
      <Pond discards={player.discards} label={copy.pondLabel(name)} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Centre panel
// ---------------------------------------------------------------------------

function CentrePanel({
  state,
  copy,
  handIndex,
}: {
  state: RoundState;
  copy: MahjongCopy;
  handIndex: number;
}): JSX.Element {
  const remaining = liveTilesRemaining(state.wall);
  const showUra =
    state.phase === 'ended' &&
    state.result !== null &&
    state.result.agari.some((win) => state.players[win.winner].riichi !== null);

  return (
    <div className={styles.centre}>
      <div className={styles.roundLine}>
        <span className={styles.roundName}>
          {copy.roundLabel(copy.winds[state.roundWind], (handIndex % 4) + 1)}
        </span>
        <span className={styles.counter}>
          {copy.honbaLabel} {state.honba}
        </span>
        <span className={styles.counter}>
          {copy.sticksLabel} {state.riichiSticks}
        </span>
      </div>

      <div className={styles.wallLine} data-low={remaining <= 8}>
        <span className={styles.wallLabel}>{copy.wallRemaining}</span>
        <span className={styles.wallCount}>{remaining}</span>
      </div>

      <div className={styles.doraBlock}>
        <span className={styles.doraLabel}>{copy.doraLabel}</span>
        <div className={styles.doraTiles}>
          {state.wall.doraIndicators.map((tile, index) => (
            <TileById key={`${tile}-${index}`} tileId={tile} size="sm" />
          ))}
        </div>
      </div>

      {showUra && (
        <div className={styles.doraBlock}>
          <span className={styles.doraLabel}>{copy.uraDoraLabel}</span>
          <div className={styles.doraTiles}>
            {state.wall.uraIndicators.map((tile, index) => (
              <TileById key={`ura-${tile}-${index}`} tileId={tile} size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface TableViewProps {
  state: RoundState;
  /** Seat the human plays — always drawn at the bottom. */
  hero: Seat;
  copy: MahjongCopy;
  /** Index of the hand in the game (0 = East 1), for the round label. */
  handIndex: number;
  /** Seats the engine is currently waiting on, highlighted in their header. */
  activeSeats?: readonly Seat[];
}

export function TableView({
  state,
  hero,
  copy,
  handIndex,
  activeSeats = [],
}: TableViewProps): JSX.Element {
  const heroPlayer = state.players[hero];
  const heroWind = copy.winds[seatWindOf(state, hero)];

  return (
    <div className={styles.table}>
      {(['across', 'left', 'right'] as const).map((side) => {
        const seat = seatOnSide(side, hero);
        return (
          <OpponentSeat
            key={side}
            side={side}
            seat={seat}
            hero={hero}
            state={state}
            copy={copy}
            active={activeSeats.includes(seat)}
          />
        );
      })}

      <div className={styles.centreCell}>
        <CentrePanel state={state} copy={copy} handIndex={handIndex} />
      </div>

      <section className={styles.seat} data-side="self" aria-label={copy.you}>
        <SeatHeader
          state={state}
          seat={hero}
          hero={hero}
          copy={copy}
          active={activeSeats.includes(hero)}
        />
        <MeldStrip player={heroPlayer} label={copy.meldsLabel(copy.you)} />
        <Pond discards={heroPlayer.discards} label={copy.pondLabel(copy.you)} />
      </section>

      <span className={styles.srOnly}>
        {copy.seatName(heroWind)}
        {' · '}
        {state.wall.doraIndicators.map((tile) => tileToString(tile)).join(' ')}
      </span>
    </div>
  );
}

export default TableView;
