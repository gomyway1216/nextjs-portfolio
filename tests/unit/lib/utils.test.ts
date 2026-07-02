import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';
import {
  convertTimestampToFormattedDate,
  formatDate,
  formatJapaneseDate,
} from '@/lib/utils/util';

describe('utils', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2', false && 'hidden', 'px-4')).toBe('px-4');
  });

  it('formats unix timestamps and date-like values', () => {
    expect(convertTimestampToFormattedDate(1_704_110_400)).toBe('Jan 01, 2024');
    expect(formatDate(new Date('2024-01-10T12:00:00.000Z'))).toBe('Jan 10, 2024');
    expect(formatDate(Date.parse('2024-01-11T12:00:00.000Z'))).toBe('Jan 11, 2024');
    expect(formatDate('2024-01-15T12:00:00.000Z')).toBe('Jan 15, 2024');
    expect(formatDate({ toDate: () => new Date('2024-02-20T12:00:00.000Z') })).toBe('Feb 20, 2024');
  });

  it('returns empty text for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate({} as never)).toBe('');
    expect(formatJapaneseDate(null)).toBe('');
    expect(formatJapaneseDate('not-a-date')).toBe('');
  });

  it('formats Japanese dates from supported date-like values', () => {
    expect(formatJapaneseDate(new Date('2024-03-05T12:00:00.000Z'))).toBe(' 2024年 3月 05');
    expect(formatJapaneseDate(Date.parse('2024-04-06T12:00:00.000Z'))).toBe(' 2024年 4月 06');
    expect(formatJapaneseDate({ toDate: () => new Date('2024-05-07T12:00:00.000Z') })).toBe(' 2024年 5月 07');
  });
});
