'use client';

import { useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { SHEET_WEEKS, WEEK_DAYS, pickOf, pickedIn, sheetOf, shownMonth, spanOf, stepMonth, type Month, type Pick } from './playedCalendar';
import { LIMITS, type Day, type DaySet } from './records';
import type { RecordsState } from './recordsStore';
import { getRecordStrings } from './recordsStrings';
import styles from './Records.module.css';

const BLANK_WEEKS: null[][] = Array.from({ length: SHEET_WEEKS }, () => Array.from({ length: WEEK_DAYS }, () => null));

/**
 * The calendar on the Records tab: the days the book has as played, a month at
 * a time. It shows what the book already keeps and nothing else. The month it
 * is turned to is the page's alone, and is forgotten when the records are
 * cleared: a book from a later era opens at today's month again.
 */
export const PlayedCalendar = ({ state }: { state: RecordsState }) => {
  const [pick, setPick] = useState<Pick | null>(null);
  const { book, day } = state;
  const era = book?.era ?? 0;
  const played = book ? book.played : null;
  return <PlayedCalendarView played={played} today={day} picked={pickedIn(pick, era)} onPick={(month) => setPick(pickOf(played ? spanOf(played, day) : null, month, era))} />;
};

export interface PlayedCalendarViewProps {
  /** The days played, or null until the book has been read. */
  played: DaySet | null;
  today: Day | null;
  /** The month the player turned to, or null for the month today is in. */
  picked: Month | null;
  /** Turns to a month. */
  onPick?: (month: Month) => void;
}

/** The calendar for a given set of days. Until the book has been read it is a blank sheet of the same size. */
export const PlayedCalendarView = ({ played, today, picked, onPick }: PlayedCalendarViewProps) => {
  const { language } = useGameLanguage();
  const t = getRecordStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const span = played ? spanOf(played, today) : null;
  const sheet = played && span ? sheetOf(played, shownMonth(span, picked), today) : null;
  const earlier = span && sheet ? stepMonth(span, sheet.month, -1) : null;
  const later = span && sheet ? stepMonth(span, sheet.month, 1) : null;
  const title = sheet ? t.calendarMonth(sheet.year, sheet.number) : t.none;
  // A step that has nowhere to go stays in the tab order, so the focus is not thrown off the button that was just pressed.
  const turn = (month: Month | null) => {
    if (month !== null) onPick?.(month);
  };

  return (
    <section className={`${styles.card} ${styles.calendar}`} aria-label={t.calendarTitle} data-month={sheet?.month ?? ''} data-testid="pusher-calendar">
      <div className={styles.cardHead}>
        <span className={styles.cardBrand} aria-hidden>
          PLAY DAYS
        </span>
        <h2 className={styles.cardTitle}>{t.calendarTitle}</h2>
      </div>
      <p className={styles.cardLead}>{t.calendarLead}</p>
      <div className={styles.calendarNav}>
        <button type="button" className={styles.calendarStep} aria-label={t.calendarPrev} aria-disabled={earlier === null} data-testid="pusher-calendar-prev" onClick={() => turn(earlier)}>
          <span aria-hidden>‹</span>
        </button>
        <strong className={styles.calendarMonth} aria-live="polite" data-testid="pusher-calendar-month">
          {title}
        </strong>
        <button type="button" className={styles.calendarStep} aria-label={t.calendarNext} aria-disabled={later === null} data-testid="pusher-calendar-next" onClick={() => turn(later)}>
          <span aria-hidden>›</span>
        </button>
      </div>
      <table className={styles.calendarSheet}>
        <caption className={styles.srOnly}>{sheet ? t.calendarCaption(title) : t.calendarTitle}</caption>
        <thead>
          <tr>
            {t.weekdays.map((weekday, index) => (
              <th key={weekday} scope="col" abbr={t.weekdaysFull[index]}>
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(sheet ? sheet.weeks : BLANK_WEEKS).map((week, row) => (
            <tr key={row}>
              {week.map((cell, column) =>
                cell ? (
                  <td key={column} data-day={cell.day} data-played={cell.played} data-now={cell.today}>
                    <span className={styles.calendarDay}>{cell.date}</span>
                    {(cell.played || cell.today) && <span className={styles.srOnly}>{t.calendarMark(cell.played, cell.today)}</span>}
                  </td>
                ) : (
                  <td key={column} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.calendarCount} data-testid="pusher-calendar-count">
        {sheet ? t.calendarCount(sheet.played.toLocaleString(locale)) : t.none}
      </p>
      <p className={styles.calendarLegend} aria-hidden>
        <span className={styles.calendarKey} data-played="true">
          <span className={styles.calendarDay}>1</span>
          {t.calendarPlayed}
        </span>
        <span className={styles.calendarKey} data-now="true">
          <span className={styles.calendarDay}>1</span>
          {t.calendarToday}
        </span>
      </p>
      <p className={styles.cardNote}>{t.calendarNote(LIMITS.months)}</p>
    </section>
  );
};
