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
    expect(formatDate('2024-01-15T12:00:00.000Z')).toBe('Jan 15, 2024');
    expect(formatDate({ toDate: () => new Date('2024-02-20T12:00:00.000Z') })).toBe('Feb 20, 2024');
  });

  it('returns empty text for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatJapaneseDate(null)).toBe('');
  });
});
