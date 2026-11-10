'use client';

import { RoundRecord, latestRecords, recordSwitched, recordWon } from './history';
import type { MontyHallStrings } from './i18n';
import styles from './MontyHall.module.css';

export const HISTORY_SHOWN = 50;

/** Finished rounds of the current record, newest first. */
export const RoundHistory = ({ records, t }: { records: readonly RoundRecord[]; t: MontyHallStrings }) => {
  const shown = latestRecords(records, HISTORY_SHOWN);
  return (
    <>
      <h3 className={styles.historyHeading}>{t.historyTitle}</h3>
      {shown.length === 0 ? (
        <p className={styles.note}>{t.historyEmpty}</p>
      ) : (
        <>
          <div className={styles.historyScroll} role="region" aria-label={t.historyTitle} tabIndex={0}>
            <ul className={styles.historyList}>
              {shown.map((r) => {
                const win = recordWon(r);
                return (
                  <li key={r.id} className={styles.historyRow}>
                    <span className={styles.historyNum}>#{r.id}</span>
                    <span className={styles.historyText}>{t.historyRow(r, recordSwitched(r))}</span>
                    <span className={`${styles.historyBadge} ${win ? styles.historyWin : styles.historyLose}`}>
                      {win ? t.historyWin : t.historyLose}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {records.length > shown.length && (
            <p className={styles.note}>{t.historyShowing(shown.length, records.length)}</p>
          )}
        </>
      )}
    </>
  );
};
