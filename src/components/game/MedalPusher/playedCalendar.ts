/**
 * The record book's days played, laid out as a wall calendar: one month to a
 * sheet, a week to a row. It is only arithmetic on the set of days the book
 * already keeps (`played` in records.ts). Nothing here is stored, and nothing
 * here reads the clock: the page passes in today.
 */

import { dayFrom, dayNumber, hasDay, type Day, type DaySet } from './records';

/** A calendar month: `2026-10`. Written this way, an earlier month sorts before a later one. */
export type Month = string;

/** A sheet is always this many weeks tall, the most a month can run over, so that it is the same height for every month. */
export const SHEET_WEEKS = 6;
export const WEEK_DAYS = 7;

const MONTH_SHAPE = /^(\d{4})-(\d{2})$/;

/** A month's year and its number, 1 to 12, or null when the text is not a month. */
function partsOf(month: Month): [number, number] | null {
  const parts = MONTH_SHAPE.exec(month);
  if (!parts) return null;
  const [year, number] = [Number(parts[1]), Number(parts[2])];
  return number >= 1 && number <= 12 ? [year, number] : null;
}

/** The month a day is in, or null for a day that is not on the book's calendar. */
export const monthOf = (day: Day | null): Month | null => (day !== null && dayNumber(day) !== null ? day.slice(0, 7) : null);

/** The months the calendar can be turned to, and the one today is in, if today is a day on the book's calendar. */
export interface Span {
  first: Month;
  last: Month;
  now: Month | null;
}

/**
 * From the earliest month with a day played to the latest, and never short of
 * the month today is in. Null when there is neither a day played nor a today
 * to show: an empty book on a device whose clock is off the calendar.
 */
export function spanOf(played: DaySet, today: Day | null): Span | null {
  const now = monthOf(today);
  const months = Object.keys(played).filter((month) => partsOf(month) !== null && played[month] > 0);
  if (now !== null) months.push(now);
  if (months.length === 0) return null;
  months.sort();
  return { first: months[0], last: months[months.length - 1], now };
}

/** The month on show: the one that was picked, kept within the span, or else the one today is in. */
export function shownMonth(span: Span, picked: Month | null): Month {
  const wanted = picked !== null && partsOf(picked) !== null ? picked : (span.now ?? span.last);
  return wanted < span.first ? span.first : wanted > span.last ? span.last : wanted;
}

/** The month before (`by` -1) or after (`by` 1) a month, or null where the span ends. */
export function stepMonth(span: Span, month: Month, by: -1 | 1): Month | null {
  const parts = partsOf(month);
  if (!parts) return null;
  const index = parts[0] * 12 + (parts[1] - 1) + by;
  const next = dayFrom(Math.floor(index / 12), (index % 12) + 1, 1).slice(0, 7);
  return next < span.first || next > span.last ? null : next;
}

/** A month the player turned to, and the era of the book it was turned to in. */
export interface Pick {
  month: Month;
  era: number;
}

/** What turning to a month leaves picked. Turning back to the month today is in picks nothing, so the calendar follows the day again. */
export const pickOf = (span: Span | null, month: Month, era: number): Pick | null => (span !== null && month === span.now ? null : { month, era });

/** The month that is still picked in a book of this era. Clearing the records starts a new era, and a pick from before it is dropped. */
export const pickedIn = (pick: Pick | null, era: number): Month | null => (pick !== null && pick.era === era ? pick.month : null);

/** One day on a sheet. */
export interface SheetDay {
  /** The day of the month, 1 to 31. */
  date: number;
  day: Day;
  played: boolean;
  today: boolean;
}

/** A month's sheet: its weeks from Sunday to Saturday, with a blank wherever a week runs outside the month. */
export interface Sheet {
  month: Month;
  year: number;
  /** The month's number, 1 to 12. */
  number: number;
  weeks: (SheetDay | null)[][];
  /** How many of the month's days were played. */
  played: number;
}

/** The sheet for a month, or null when the text is not a month. */
export function sheetOf(played: DaySet, month: Month, today: Day | null): Sheet | null {
  const parts = partsOf(month);
  if (!parts) return null;
  const [year, number] = parts;
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  let count = 0;
  const weeks = Array.from({ length: SHEET_WEEKS }, (_, week) =>
    Array.from({ length: WEEK_DAYS }, (_, weekday): SheetDay | null => {
      const date = week * WEEK_DAYS + weekday - offset + 1;
      if (date < 1 || date > length) return null;
      const day = dayFrom(year, number, date);
      const was = hasDay(played, day);
      if (was) count++;
      return { date, day, played: was, today: day === today };
    }),
  );
  return { month, year, number, weeks, played: count };
}
