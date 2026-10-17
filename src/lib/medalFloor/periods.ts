/**
 * The floor's days and weeks. A medal floor is one place, so its day is one
 * day for everybody, whatever their device's clock says: the floor keeps Japan
 * time (JST, UTC+9, no summer time), a day starts at midnight there and a week
 * on Monday. The server's clock decides which day a win is counted in.
 */

export const FLOOR_UTC_OFFSET_MS = 9 * 3_600_000;
export const FLOOR_TIME_ZONE = 'Asia/Tokyo';
const DAY_MS = 86_400_000;

export type PeriodKind = 'day' | 'week';
export const PERIOD_KINDS: readonly PeriodKind[] = ['day', 'week'];

export interface Period {
  kind: PeriodKind;
  /** The floor's date the period starts on, `YYYY-MM-DD`. */
  key: string;
  /** Where the period's scores are kept: `day-2026-10-17`, `week-2026-10-12`. */
  id: string;
  /** When it starts and ends, in ms since the epoch (end exclusive). */
  start: number;
  end: number;
}

const dateKey = (floorMidnight: number): string => new Date(floorMidnight + FLOOR_UTC_OFFSET_MS).toISOString().slice(0, 10);

/** The start of the floor's day that `at` falls in. */
export const dayStart = (at: number): number => Math.floor((at + FLOOR_UTC_OFFSET_MS) / DAY_MS) * DAY_MS - FLOOR_UTC_OFFSET_MS;

/** The start of the floor's week (Monday) that `at` falls in. */
export function weekStart(at: number): number {
  const day = dayStart(at);
  const weekday = new Date(day + FLOOR_UTC_OFFSET_MS).getUTCDay(); // 0 Sunday … 6 Saturday
  return day - ((weekday + 6) % 7) * DAY_MS;
}

export function periodAt(kind: PeriodKind, at: number): Period {
  const start = kind === 'day' ? dayStart(at) : weekStart(at);
  const end = start + (kind === 'day' ? DAY_MS : 7 * DAY_MS);
  const key = dateKey(start);
  return { kind, key, id: `${kind}-${key}`, start, end };
}

/** The period before the one `at` falls in. */
export const periodBefore = (kind: PeriodKind, at: number): Period => periodAt(kind, periodAt(kind, at).start - 1);
