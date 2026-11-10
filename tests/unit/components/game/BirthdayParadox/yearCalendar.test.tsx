import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DAYS_IN_YEAR,
  MONTH_LENGTHS,
  countByDay,
  createSeededRng,
  findFirstCollision,
  findSharedBirthdays,
  generateBirthdays,
  hasCollision,
  pairCount,
} from '@/components/game/BirthdayParadox/engine';
import { getStrings } from '@/components/game/BirthdayParadox/i18n';
import { YearCalendar } from '@/components/game/BirthdayParadox/YearCalendar';

describe('every shared birthday in a group', () => {
  it('lists each day two or more people share, by day of year, with everyone on it', () => {
    //                0   1   2   3   4    5   6   7
    const group = [200, 14, 73, 14, 200, 364, 14, 0];
    expect(findSharedBirthdays(group)).toEqual([
      { day: 14, indices: [1, 3, 6] },
      { day: 200, indices: [0, 4] },
    ]);
  });

  it('is empty when nobody shares, and for groups too small to share', () => {
    expect(findSharedBirthdays([1, 2, 3, 364])).toEqual([]);
    expect(findSharedBirthdays([5])).toEqual([]);
    expect(findSharedBirthdays([])).toEqual([]);
  });

  it('agrees with the existing collision checks on random groups', () => {
    const rng = createSeededRng(4242);
    for (let trial = 0; trial < 300; trial++) {
      const group = generateBirthdays(2 + (trial % 60), rng);
      const shared = findSharedBirthdays(group);
      expect(shared.length > 0).toBe(hasCollision(group));
      const first = findFirstCollision(group);
      if (first) expect(shared.some((s) => s.day === first.day)).toBe(true);
      for (const s of shared) {
        expect(s.indices.length).toBeGreaterThanOrEqual(2);
        for (const i of s.indices) expect(group[i]).toBe(s.day);
      }
    }
  });

  it('counts people per day, and the counts add up to the group', () => {
    const group = [0, 0, 31, 364, 31, 0];
    const counts = countByDay(group);
    expect(counts).toHaveLength(DAYS_IN_YEAR);
    expect(counts[0]).toBe(3);
    expect(counts[31]).toBe(2);
    expect(counts[364]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(group.length);
  });

  it('counts pairs as n(n-1)/2', () => {
    expect(pairCount(0)).toBe(0);
    expect(pairCount(1)).toBe(0);
    expect(pairCount(2)).toBe(1);
    expect(pairCount(23)).toBe(253);
    expect(pairCount(100)).toBe(4950);
  });
});

describe('the year calendar', () => {
  const count = (html: string, needle: string) => html.split(needle).length - 1;
  // Jan 15 three times, Jul 20 twice (day 200), and three people on their own.
  const group = [200, 14, 73, 14, 200, 364, 14, 0];
  const shared = findSharedBirthdays(group);

  it('draws one cell per day of the year and marks single and shared days apart', () => {
    const t = getStrings('en');
    const html = renderToStaticMarkup(
      <YearCalendar birthdays={group} shared={shared} dealing={false} t={t} />,
    );
    const total = MONTH_LENGTHS.reduce((a, b) => a + b, 0);
    expect(total).toBe(DAYS_IN_YEAR);
    expect(count(html, 'calCell')).toBe(DAYS_IN_YEAR);
    // 3 single days + the legend swatch; 2 shared days + the legend swatch.
    expect(count(html, 'calSingle')).toBe(3 + 1);
    expect(count(html, 'calShared')).toBe(2 + 1);
    expect(html).toContain('title="1/15 — person #2, #4, #7"');
    expect(html).toContain('title="12/31 — person #6"');
    expect(html).toContain(t.calendarAria(8, 5, 2));
    expect(html).toContain(t.calendarSummary(8, 28, 5));
    expect(html).toContain(t.sharedTitle(2));
    expect(html).toContain('#1, #5');
    expect(html).not.toContain(t.sharedNone);
  });

  it('says so when nobody shares, and holds its wording back while a deal is animating', () => {
    const t = getStrings('en');
    const none = renderToStaticMarkup(
      <YearCalendar birthdays={[1, 2, 3]} shared={[]} dealing={false} t={t} />,
    );
    expect(none).toContain(t.sharedNone);
    expect(none).toContain(t.sharedTitle(0));

    const dealing = renderToStaticMarkup(
      <YearCalendar birthdays={[1]} shared={[]} dealing t={t} />,
    );
    expect(dealing).not.toContain(t.sharedNone);
    expect(dealing).not.toContain(t.calendarSummary(1, 0, 1));
    expect(dealing).toContain(`aria-label="${t.dealing}"`);
  });

  it('is fully localized in Japanese, including the screen-reader text', () => {
    const t = getStrings('ja');
    const html = renderToStaticMarkup(
      <YearCalendar birthdays={group} shared={shared} dealing={false} t={t} />,
    );
    expect(html).toContain(t.calendarAria(8, 5, 2));
    expect(html).toContain(`aria-label="${t.sharedListAria}"`);
    expect(html).toContain('12月');
    expect(html).toContain('title="1/15 — 人 #2, #4, #7"');
    expect(html).not.toMatch(/Jan|person|Shared (by|days|birthdays)|Nobody/);
  });
});
