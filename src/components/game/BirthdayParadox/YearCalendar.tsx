'use client';

import { useMemo } from 'react';
import { MONTH_LENGTHS, countByDay, dayLabel, pairCount } from './engine';
import type { SharedBirthday } from './engine';
import type { BirthdayStrings } from './i18n';
import styles from './BirthdayParadox.module.css';

interface YearCalendarProps {
  /** The birthdays currently on show (day of year, 0-364), in dealing order. */
  birthdays: number[];
  shared: SharedBirthday[];
  dealing: boolean;
  t: BirthdayStrings;
}

const peopleList = (indices: number[]) => indices.map((i) => `#${i + 1}`).join(', ');

const MONTHS = MONTH_LENGTHS.map((length, m) => ({
  number: m + 1,
  start: MONTH_LENGTHS.slice(0, m).reduce((a, b) => a + b, 0),
  length,
}));

/**
 * The same group laid out on a 12 × 31 year grid, plus a list of every day
 * that two or more people share. Purely a view of the dealt birthdays.
 */
export const YearCalendar = ({ birthdays, shared, dealing, t }: YearCalendarProps) => {
  const counts = useMemo(() => countByDay(birthdays), [birthdays]);
  const peopleByDay = useMemo(() => {
    const map = new Map<number, number[]>();
    birthdays.forEach((d, i) => {
      const existing = map.get(d);
      if (existing) existing.push(i);
      else map.set(d, [i]);
    });
    return map;
  }, [birthdays]);

  const distinctDays = peopleByDay.size;

  return (
    <section className={`${styles.card} ${styles.calendarCard}`}>
      <h3 className={styles.sectionTitle}>{t.calendarTitle}</h3>
      <p className={styles.calendarSummary}>
        {dealing
          ? t.dealing
          : t.calendarSummary(birthdays.length, pairCount(birthdays.length), distinctDays)}
      </p>

      <div className={styles.calendarLayout}>
        <div>
          <div
            className={styles.calendar}
            role="img"
            aria-label={
              dealing ? t.dealing : t.calendarAria(birthdays.length, distinctDays, shared.length)
            }
          >
            {MONTHS.map((month) => (
              <div key={month.number} className={styles.calRow} aria-hidden>
                <span className={styles.calMonth}>{t.monthShort(month.number)}</span>
                {Array.from({ length: month.length }, (_, d) => {
                  const day = month.start + d;
                  const count = counts[day];
                  const cls = count >= 2 ? styles.calShared : count === 1 ? styles.calSingle : '';
                  return (
                    <span
                      key={day}
                      className={`${styles.calCell} ${cls}`}
                      title={
                        count > 0
                          ? t.cellTitle(dayLabel(day), peopleList(peopleByDay.get(day) ?? []))
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.calSwatch} ${styles.calSingle}`} aria-hidden />
              {t.legendSingle}
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.calSwatch} ${styles.calShared}`} aria-hidden />
              {t.legendShared}
            </span>
          </div>
        </div>

        <div className={styles.sharedPanel}>
          <h4 className={styles.sharedTitle}>{t.sharedTitle(shared.length)}</h4>
          <div
            className={styles.sharedScroll}
            role="region"
            aria-label={t.sharedListAria}
            tabIndex={0}
          >
            {shared.length === 0 ? (
              <p className={styles.sharedEmpty}>{dealing ? t.dealing : t.sharedNone}</p>
            ) : (
              <ul className={styles.sharedList}>
                {shared.map((s) => (
                  <li key={s.day} className={styles.sharedItem}>
                    <span className={styles.sharedDay}>{dayLabel(s.day)}</span>
                    <span className={styles.sharedPeople}>{peopleList(s.indices)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
