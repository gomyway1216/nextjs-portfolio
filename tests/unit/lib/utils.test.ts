import { afterEach, describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';
import {
  convertTimestampToFormattedDate,
  formatDate,
  formatJapaneseDate,
} from '@/lib/utils/util';

function localTimestampSeconds(year: number, monthIndex: number, day: number): number {
  return new Date(year, monthIndex, day, 12).getTime() / 1000;
}

describe('utils', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2', false && 'hidden', 'px-4')).toBe('px-4');
  });

  it('formats unix timestamps and date-like values', () => {
    expect(convertTimestampToFormattedDate(localTimestampSeconds(2024, 0, 1))).toBe('Jan 01, 2024');
    expect(formatDate(new Date(2024, 0, 10, 12))).toBe('Jan 10, 2024');
    expect(formatDate(new Date(2024, 0, 11, 12).getTime())).toBe('Jan 11, 2024');
    expect(formatDate('2024-01-15T12:00:00')).toBe('Jan 15, 2024');
    expect(formatDate({ toDate: () => new Date(2024, 1, 20, 12) })).toBe('Feb 20, 2024');
  });

  it('returns empty text for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate({} as never)).toBe('');
    expect(formatJapaneseDate(null)).toBe('');
    expect(formatJapaneseDate('not-a-date')).toBe('');
  });

  it('formats Japanese dates from supported date-like values', () => {
    expect(formatJapaneseDate(new Date(2024, 2, 5, 12))).toBe(' 2024年 3月 05');
    expect(formatJapaneseDate(new Date(2024, 3, 6, 12).getTime())).toBe(' 2024年 4月 06');
    expect(formatJapaneseDate({ toDate: () => new Date(2024, 4, 7, 12) })).toBe(' 2024年 5月 07');
  });
});

describe('dates print the same day in every time zone', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  // The server renders in UTC and browsers in the viewer's zone; a date that
  // prints a different day in each is a hydration error on the page.
  it.each(['America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'])('in %s', (zone) => {
    process.env.TZ = zone;
    // The switch took effect: local time is no longer UTC.
    expect(new Date('2026-06-12T12:00:00.000Z').getTimezoneOffset()).not.toBe(0);

    // A date-only value (midnight UTC) and the last minute of the same UTC day.
    expect(formatDate('2026-06-12T00:00:00.000Z')).toBe('Jun 12, 2026');
    expect(formatDate('2026-06-12T23:59:00.000Z')).toBe('Jun 12, 2026');
    expect(formatDate(new Date('2026-01-01T00:00:00.000Z'))).toBe('Jan 01, 2026');
    expect(formatDate({ toDate: () => new Date('2025-12-31T23:59:00.000Z') })).toBe('Dec 31, 2025');
    expect(convertTimestampToFormattedDate(Date.UTC(2026, 5, 12) / 1000)).toBe('Jun 12, 2026');
    // The month comes from the same zone as the year and the day.
    expect(formatJapaneseDate('2026-06-30T23:59:00.000Z')).toBe(' 2026年 6月 30');
    expect(formatJapaneseDate('2026-07-01T00:00:00.000Z')).toBe(' 2026年 7月 01');
  });
});
