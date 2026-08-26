/**
 * Riichi Mahjong — hand and game result.
 *
 * Two screens behind one component, because they are the same dialog at
 * different depths:
 *
 * - **hand result** — the winning hand laid out tile by tile, the yaku list
 *   with han values, the dora line, fu / han / total points, and the per-seat
 *   score deltas. On a draw it shows the reason plus who was tenpai.
 * - **game result** — the final standings once the tonpuusen is over.
 *
 * Nothing is recomputed: the numbers come straight from `RoundResult`, which
 * the engine already settled, so the dialog can never disagree with the score
 * the players were actually paid.
 */

import type { JSX } from 'react';

import { seatWindOf } from './engine/actions';
import {
  SEATS,
  type AgariResult,
  type GameState,
  type HandValue,
  type RoundState,
  type Seat,
} from './engine/types';
import type { MahjongCopy } from './i18n';
import styles from './ResultModal.module.css';
import { TileById } from './TileSvg';

/** How a seat is named in the result: "You" for the hero, wind otherwise. */
export function seatLabel(
  state: RoundState,
  seat: Seat,
  hero: Seat,
  copy: MahjongCopy,
): string {
  if (seat === hero) return copy.you;
  return copy.seatName(copy.winds[seatWindOf(state, seat)]);
}

/**
 * Han that came from dora rather than from yaku.
 *
 * `evaluateHand` folds dora, aka and ura into `HandValue.han` but deliberately
 * keeps them out of `HandValue.yaku` (they are not yaku), so the difference is
 * exactly the dora count. A yakuman reports `han` as `13 × multiplier`, where
 * dora is not part of the value at all.
 */
export function doraHanOf(value: HandValue): number {
  if (value.yakuman > 0) return 0;
  const fromYaku = value.yaku.reduce((sum, entry) => sum + entry.han, 0);
  return Math.max(0, value.han - fromYaku);
}

/** Signed, thousand-separated score delta, e.g. `+8,000` / `-3,900`. */
export function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '±';
  return `${sign}${Math.abs(delta).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Winning hand
// ---------------------------------------------------------------------------

function WinningHand({
  state,
  win,
  copy,
}: {
  state: RoundState;
  win: AgariResult;
  copy: MahjongCopy;
}): JSX.Element {
  const player = state.players[win.winner];
  // On a tsumo the winning tile is still in `hand`; on a ron it never was.
  const concealed =
    win.type === 'tsumo'
      ? player.hand.filter((tile) => tile !== win.winTile)
      : [...player.hand];

  return (
    <div className={styles.handLayout} aria-label={copy.winningHand}>
      <div className={styles.handTiles}>
        {concealed.map((tile) => (
          <TileById key={tile} tileId={tile} ariaLabel="" />
        ))}
      </div>
      <div className={styles.winTile}>
        <TileById tileId={win.winTile} />
      </div>
      {player.melds.length > 0 && (
        <div className={styles.resultMelds}>
          {player.melds.map((meld, index) => (
            <div className={styles.resultMeld} key={`${meld.type}-${index}`}>
              {meld.tiles.map((tile, tileIndex) => (
                <TileById
                  key={`${tile}-${tileIndex}`}
                  tileId={tile}
                  rotated={tile === meld.calledTile}
                  ariaLabel=""
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgariBlock({
  state,
  win,
  hero,
  copy,
}: {
  state: RoundState;
  win: AgariResult;
  hero: Seat;
  copy: MahjongCopy;
}): JSX.Element {
  const value = win.value;
  const dora = doraHanOf(value);
  const limit = value.limit === null ? null : copy.limitNames[value.limit] ?? value.limit;

  return (
    <div className={styles.agari}>
      <h3 className={styles.agariTitle}>
        {win.type === 'tsumo'
          ? copy.tsumoBy(seatLabel(state, win.winner, hero, copy))
          : copy.ronBy(
            seatLabel(state, win.winner, hero, copy),
            seatLabel(state, win.loser ?? win.winner, hero, copy),
          )}
      </h3>

      <WinningHand state={state} win={win} copy={copy} />

      <ul className={styles.yakuList} aria-label={copy.yakuTitle}>
        {value.yaku.map((entry) => (
          <li className={styles.yakuRow} key={entry.id}>
            <span className={styles.yakuName}>{copy.yakuId(entry.id)}</span>
            <span className={styles.yakuHan}>
              {entry.yakuman > 0
                ? copy.yakumanLabel(entry.yakuman)
                : `${entry.han} ${copy.hanLabel}`}
            </span>
          </li>
        ))}
        {dora > 0 && (
          <li className={styles.yakuRow} key="dora">
            <span className={styles.yakuName}>{copy.doraHan}</span>
            <span className={styles.yakuHan}>
              {dora} {copy.hanLabel}
            </span>
          </li>
        )}
      </ul>

      <div className={styles.valueRow}>
        {value.yakuman === 0 && (
          <span className={styles.valueChip}>
            {value.han} {copy.hanLabel} / {value.fu} {copy.fuLabel}
          </span>
        )}
        {limit !== null && <span className={styles.limitChip}>{limit}</span>}
        <span className={styles.pointsChip}>
          {value.points.toLocaleString('en-US')} {copy.pointsLabel}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface ResultModalProps {
  open: boolean;
  /** The finished round; `null` once the game itself is over. */
  round: RoundState | null;
  game: GameState;
  hero: Seat;
  copy: MahjongCopy;
  onNext: () => void;
  onPlayAgain: () => void;
}

export function ResultModal({
  open,
  round,
  game,
  hero,
  copy,
  onNext,
  onPlayAgain,
}: ResultModalProps): JSX.Element | null {
  if (!open) return null;

  const result = round?.result ?? null;
  const finished = game.finished;

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={finished ? copy.gameResultTitle : copy.handResultTitle}
      >
        <h2 className={styles.heading}>
          {finished ? copy.gameResultTitle : copy.handResultTitle}
        </h2>

        {!finished && round !== null && result !== null && (
          <>
            {result.agari.map((win) => (
              <AgariBlock
                key={`${win.winner}-${win.winTile}`}
                state={round}
                win={win}
                hero={hero}
                copy={copy}
              />
            ))}

            {result.draw !== null && (
              <div className={styles.drawBlock}>
                <p className={styles.drawReason}>
                  {copy.logDraw(copy.drawReason[result.draw.reason])}
                </p>
                <p className={styles.drawSeats}>
                  <span className={styles.drawSeatsLabel}>{copy.tenpaiSeats}:</span>{' '}
                  {result.draw.tenpaiSeats.length === 0
                    ? copy.none
                    : result.draw.tenpaiSeats
                      .map((seat) => seatLabel(round, seat, hero, copy))
                      .join(', ')}
                </p>
                <p className={styles.drawSeats}>
                  <span className={styles.drawSeatsLabel}>{copy.notenSeats}:</span>{' '}
                  {SEATS.filter((seat) => !result.draw?.tenpaiSeats.includes(seat)).length === 0
                    ? copy.none
                    : SEATS.filter((seat) => !result.draw?.tenpaiSeats.includes(seat))
                      .map((seat) => seatLabel(round, seat, hero, copy))
                      .join(', ')}
                </p>
              </div>
            )}

            <div className={styles.deltas} aria-label={copy.deltasTitle}>
              <span className={styles.deltasTitle}>{copy.deltasTitle}</span>
              {SEATS.map((seat) => (
                <div className={styles.deltaRow} key={seat}>
                  <span className={styles.deltaSeat}>
                    {seatLabel(round, seat, hero, copy)}
                  </span>
                  <span
                    className={styles.deltaValue}
                    data-sign={
                      result.scoreDeltas[seat] > 0
                        ? 'up'
                        : result.scoreDeltas[seat] < 0
                          ? 'down'
                          : 'flat'
                    }
                  >
                    {formatDelta(result.scoreDeltas[seat])}
                  </span>
                  <span className={styles.deltaTotal}>
                    {round.players[seat].score.toLocaleString('en-US')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {finished && (
          <div className={styles.standings} aria-label={copy.finalStandings}>
            <span className={styles.deltasTitle}>{copy.finalStandings}</span>
            {(game.placements ?? SEATS).map((seat, index) => (
              <div className={styles.standingRow} key={seat} data-hero={seat === hero}>
                <span className={styles.place}>{copy.placeLabel(index + 1)}</span>
                <span className={styles.deltaSeat}>
                  {seat === hero ? copy.you : copy.seatName(copy.winds[seat])}
                </span>
                <span className={styles.deltaTotal}>
                  {game.scores[seat].toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          {finished ? (
            <button type="button" className={styles.primary} onClick={onPlayAgain}>
              {copy.playAgain}
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={onNext}>
              {copy.nextHand}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResultModal;
