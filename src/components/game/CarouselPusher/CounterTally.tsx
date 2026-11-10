'use client';

import type { CarouselStrings } from './i18n';
import { LEAST_SHARE, tallyRows, tallyTotal, tooSmallToShow, type Tally } from './tally';
import styles from './CarouselPusher.module.css';

export interface CounterTallyProps {
  tally: Tally;
  t: CarouselStrings;
  locale: string;
}

/**
 * What the counter has stopped on this visit, beside each outcome's chance on any one spin. Every row is there from the
 * start and the number columns have widths of their own, so the panel is the same height whatever the counts.
 */
export const CounterTally = ({ tally, t, locale }: CounterTallyProps) => {
  const pct = (v: number) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const total = tallyTotal(tally);
  return (
    <section className={styles.panel} aria-labelledby="cp-tally-title">
      <h2 id="cp-tally-title" className={styles.panelTitle}>
        {t.tallyTitle}
      </h2>
      <table className={`${styles.oddsTable} ${styles.tallyTable}`} aria-labelledby="cp-tally-title" aria-describedby="cp-tally-note" data-testid="cp-tally" data-total={total}>
        <colgroup>
          <col />
          <col className={styles.tallyTimes} />
          <col className={styles.tallyPart} />
          <col className={styles.tallyPart} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t.tallyShows}</th>
            <th scope="col" className={styles.num}>
              {t.tallyTimes}
            </th>
            <th scope="col" className={styles.num}>
              {t.tallyShare}
            </th>
            <th scope="col" className={styles.num}>
              {t.tallyChance}
            </th>
          </tr>
        </thead>
        <tbody>
          {tallyRows(tally).map((row) => (
            <tr key={row.id} data-outcome={row.id} data-count={row.count}>
              <th scope="row">{t.outcomeName[row.id]}</th>
              <td className={styles.num}>{row.count.toLocaleString(locale)}</td>
              <td className={styles.num}>{row.share === null ? '—' : tooSmallToShow(row) ? `<${pct(LEAST_SHARE)}` : pct(row.share)}</td>
              <td className={styles.num}>{pct(row.chance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t.tallyAll}</th>
            <td className={styles.num} data-testid="cp-tally-total">
              {total.toLocaleString(locale)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <p id="cp-tally-note" className={`${styles.muted} ${styles.tallyNote}`}>
        {t.tallyNote}
      </p>
    </section>
  );
};

export default CounterTally;
