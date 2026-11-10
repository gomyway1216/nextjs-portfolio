'use client';

import { useMemo } from 'react';
import { totalOnTable, type Bets, type PointNumber } from './engine';
import type { CrapsStrings } from './i18n';
import { DICE_WAYS, rollOutlook } from './outlook';
import styles from './Craps.module.css';

export interface RollOutlookProps {
  point: PointNumber | null;
  bets: Bets;
  t: CrapsStrings;
  locale: string;
}

const signOf = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
const signed = (n: number, text: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${text}`;

/** What the bets on the table would win or lose on the next roll alone, for each total (outlook.ts). */
export const RollOutlook = ({ point, bets, t, locale }: RollOutlookProps) => {
  const outlook = useMemo(() => rollOutlook(point, bets), [point, bets]);
  const signClass = (n: number) => (n > 0 ? styles.pos : n < 0 ? styles.neg : undefined);
  const medals = (n: number) => signed(n, Math.abs(n).toLocaleString(locale));
  const share = (ways: number) => `${t.outlookWays(ways)} (${((ways / DICE_WAYS) * 100).toFixed(1)}%)`;
  // The average is shown to two places, and its sign is that of what is shown.
  const average = Number(outlook.average.toFixed(2));

  return (
    <section className={styles.panel} aria-labelledby="craps-outlook-title" data-testid="craps-outlook">
      <h2 id="craps-outlook-title" className={`${styles.sectionLabel} ${styles.outlookTitle}`}>
        {t.outlookTitle}
      </h2>
      {totalOnTable(bets) === 0 ? (
        <p className={styles.muted} data-testid="craps-outlook-empty">
          {t.outlookEmpty}
        </p>
      ) : (
        <>
          <p className={styles.outlookIntro}>{t.outlookIntro}</p>
          <ul className={styles.outlookGrid}>
            {outlook.rows.map((row) => {
              const roll = row.hard === null ? String(row.total) : row.hard ? t.outlookHard(row.total) : t.outlookEasy(row.total);
              return (
                <li
                  key={`${row.total}-${row.hard}`}
                  className={styles.outlookCell}
                  data-sign={signOf(row.net)}
                  data-roll={`${row.total}${row.hard === null ? '' : row.hard ? 'h' : 'e'}`}
                >
                  <span className={styles.srOnly}>{t.outlookAria(roll, row.ways, medals(row.net), Math.abs(row.net) === 1)}</span>
                  <span className={styles.outlookRoll} aria-hidden="true">
                    {roll}
                  </span>
                  <span className={`${styles.outlookNet} ${signClass(row.net) ?? ''}`} aria-hidden="true">
                    {medals(row.net)}
                  </span>
                  <span className={styles.outlookWays} aria-hidden="true">
                    {t.outlookWays(row.ways)}
                  </span>
                </li>
              );
            })}
          </ul>
          <dl className={styles.statList}>
            <div>
              <dt>{t.outlookAhead}</dt>
              <dd data-testid="craps-outlook-ahead">{share(outlook.ahead)}</dd>
            </div>
            <div>
              <dt>{t.outlookBehind}</dt>
              <dd data-testid="craps-outlook-behind">{share(outlook.behind)}</dd>
            </div>
            <div>
              <dt>{t.outlookLevel}</dt>
              <dd data-testid="craps-outlook-level">{share(outlook.level)}</dd>
            </div>
            <div>
              <dt>{t.outlookAverage}</dt>
              <dd className={signClass(average)} data-testid="craps-outlook-average">
                {signed(average, Math.abs(average).toFixed(2))}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
};
