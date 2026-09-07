import { describe, expect, it } from 'vitest';

import { getStudyArticleDateRange } from '@/lib/studyArticleDateRange';

describe('getStudyArticleDateRange', () => {
  it('returns local midnight boundaries for the selected calendar day', () => {
    const range = getStudyArticleDateRange('2026-09-07');
    const start = new Date(range.fromDate!);
    const end = new Date(range.toDate!);

    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([
      2026,
      8,
      7,
      0,
    ]);
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()]).toEqual([
      2026,
      8,
      8,
      0,
    ]);
  });

  it('accepts a valid leap day', () => {
    const range = getStudyArticleDateRange('2028-02-29');

    expect(new Date(range.fromDate!).getDate()).toBe(29);
    expect(new Date(range.toDate!).getDate()).toBe(1);
  });

  it('does not create ranges for empty or impossible dates', () => {
    expect(getStudyArticleDateRange('')).toEqual({});
    expect(getStudyArticleDateRange('2026-02-30')).toEqual({});
    expect(getStudyArticleDateRange('09/07/2026')).toEqual({});
  });
});
