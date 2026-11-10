'use client';

import type { CSSProperties } from 'react';
import { SPOTS } from './engine';
import type { BigWheelStrings } from './i18n';
import { expectedDigits, expectedOf, linesOf, type EndedSpin, type VisitTally } from './visitTally';
import { lookOf } from './Wheel';
import styles from './BigWheel.module.css';

/** A spin in the record beside the machine. */
export interface LoggedSpin extends EndedSpin {
  id: string;
  /** Its place among this visit's spins, from 1; null for the last spin from before the page opened. */
  no: number | null;
  bonus: boolean;
  won: number;
  wagered: number;
}

const signed = (n: number, fmt: (n: number) => string): string => `${n > 0 ? '+' : ''}${fmt(n)}`;

export interface SpinLogProps {
  t: BigWheelStrings;
  fmt: (n: number) => string;
  /** The last spins, the newest first. */
  history: readonly LoggedSpin[];
  /** The spin picked to look at; the newest is shown while none is, or once the one picked is no longer among them. */
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The last spins as chips to press, and under them what the one picked did with the medals on the board. */
export const SpinLog = ({ t, fmt, history, selectedId, onSelect }: SpinLogProps) => {
  const shown = history.find((entry) => entry.id === selectedId) ?? history[0] ?? null;
  const net = shown ? shown.won - shown.wagered : 0;
  return (
    <section className={styles.panel} aria-labelledby="bw-history-title">
      <h2 id="bw-history-title" className={styles.panelTitle}>
        {t.historyTitle}
      </h2>
      <div className={styles.historyBox}>
        {history.length === 0 ? (
          <p className={styles.muted}>{t.historyEmpty}</p>
        ) : (
          <ol className={styles.historyList} data-testid="bw-history">
            {history.map((entry) => {
              const look = lookOf(entry.spot);
              const picked = shown?.id === entry.id;
              return (
                <li key={entry.id} data-bonus={entry.bonus ? 'true' : 'false'} data-won={entry.won > 0 ? 'true' : 'false'}>
                  <button
                    type="button"
                    className={styles.historyChip}
                    style={{ '--fill': look.fill, '--ink': look.ink } as CSSProperties}
                    data-testid={`bw-history-${entry.id}`}
                    data-won={entry.won > 0 ? 'true' : 'false'}
                    aria-pressed={picked}
                    aria-label={t.chipAria(entry.no === null ? t.detailEarlier : t.detailTitle(entry.no), entry.bonus ? t.historyBonus(entry.multiplier) : '', entry.spot)}
                    title={entry.bonus ? t.historyBonus(entry.multiplier) : undefined}
                    onClick={() => onSelect(entry.id)}
                  >
                    {entry.bonus && (
                      <span className={styles.historyStar} aria-hidden="true">
                        ★×{entry.multiplier}
                      </span>
                    )}
                    <span aria-hidden="true">{entry.spot}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Always there and always as tall, whichever spin it shows: nothing under it moves as the spins come in. */}
      <div className={styles.spinDetail} data-testid="bw-spin-detail" data-spin={shown?.id ?? ''}>
        {shown === null ? (
          <p className={styles.muted}>{t.detailEmpty}</p>
        ) : (
          <>
            <h3 className={styles.detailTitle} data-testid="bw-detail-title">
              {shown.no === null ? t.detailEarlier : t.detailTitle(shown.no)}
            </h3>
            <p className={styles.detailPath} data-testid="bw-detail-path">
              {shown.bonus ? t.detailPathBonus(shown.multiplier, shown.spot) : t.detailPath(shown.spot)}
            </p>
            <ul className={styles.detailBets} aria-label={t.detailBets}>
              {linesOf(shown).map((line) => {
                const look = lookOf(line.spot);
                return (
                  <li key={line.spot} className={styles.detailBet} data-paying={line.paying ? 'true' : 'false'} data-testid={`bw-detail-bet-${line.spot}`}>
                    <span className={styles.detailSpot} style={{ '--fill': look.fill, '--ink': look.ink } as CSSProperties} aria-hidden="true">
                      ×{line.spot}
                    </span>
                    <span className={styles.detailAmount} aria-hidden="true">
                      {line.amount > 0 ? line.amount : '–'}
                    </span>
                    <span className={styles.srOnly}>{t.detailBetAria(line.spot, line.amount, line.back)}</span>
                  </li>
                );
              })}
            </ul>
            <dl className={styles.detailSums}>
              <div>
                <dt>{t.played}</dt>
                <dd data-testid="bw-detail-played">{fmt(shown.wagered)}</dd>
              </div>
              <div>
                <dt>{t.won}</dt>
                <dd data-testid="bw-detail-won">{fmt(shown.won)}</dd>
              </div>
              <div>
                <dt>{t.net}</dt>
                <dd className={net > 0 ? styles.pos : net < 0 ? styles.neg : undefined} data-testid="bw-detail-net">
                  {signed(net, fmt)}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </section>
  );
};

export interface NumberTallyProps {
  t: BigWheelStrings;
  locale: string;
  tally: VisitTally;
}

/** This visit number by number: how often each came up next to what its chance comes to, and what the medals on it did. */
export const NumberTally = ({ t, locale, tally }: NumberTallyProps) => {
  const fmt = (n: number) => n.toLocaleString(locale);
  return (
    <section className={styles.panel} aria-labelledby="bw-tally-title">
      <h2 id="bw-tally-title" className={styles.panelTitle}>
        {t.tallyTitle}
      </h2>
      <table className={styles.tallyTable} data-testid="bw-tally" data-spins={tally.spins}>
        <thead>
          <tr>
            <th scope="col">{t.colNumber}</th>
            <th scope="col">{t.colCameUp}</th>
            <th scope="col">{t.colExpected}</th>
            <th scope="col">{t.colPlaced}</th>
            <th scope="col">{t.net}</th>
          </tr>
        </thead>
        <tbody>
          {SPOTS.map((spot) => {
            const look = lookOf(spot);
            const row = tally.spots[spot];
            const expected = expectedOf(tally.spins, spot);
            const digits = expectedDigits(expected);
            const net = row.back - row.placed;
            return (
              <tr key={spot} data-tally={spot}>
                <th scope="row">
                  <span className={styles.swatch} style={{ '--fill': look.fill, '--ink': look.ink } as CSSProperties}>
                    ×{spot}
                  </span>
                </th>
                <td data-testid={`bw-tally-up-${spot}`}>{fmt(row.cameUp)}</td>
                <td data-testid={`bw-tally-expected-${spot}`}>{tally.spins === 0 ? '—' : expected.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}</td>
                <td>{fmt(row.placed)}</td>
                <td className={net > 0 ? styles.pos : net < 0 ? styles.neg : undefined} data-testid={`bw-tally-net-${spot}`}>
                  {signed(net, fmt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.tallyNote}>{t.tallyNote}</p>
    </section>
  );
};
