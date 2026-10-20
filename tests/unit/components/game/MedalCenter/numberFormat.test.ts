import { describe, expect, it } from 'vitest';

import { formatCount, numberFormat, percentToTenth } from '@/components/game/MedalCenter/numberFormat';

// The medal center's numbers, written without ICU where both of the site's languages write them plainly, and by a kept
// Intl.NumberFormat otherwise: in every case exactly what toLocaleString writes.

const LOCALES = ['en-US', 'ja-JP'];
const TENTHS = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

/** Numbers of every size, from a seeded walk, with the edges that matter. */
const sample = (scale: number, count: number): number[] => {
  let seed = 11;
  const next = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  return Array.from({ length: count }, () => next() * scale);
};

describe('the medal center’s numbers', () => {
  it('write a count as toLocaleString does, in both languages', () => {
    const counts = [0, 1, 9, 10, 99, 100, 999, 1_000, 1_001, 9_999, 10_000, 123_456, 999_999, 1_000_000, 9_999_999, 10_000_000, Number.MAX_SAFE_INTEGER];
    for (const n of sample(1e12, 400)) counts.push(Math.floor(n), Math.floor(n / 1e6), Math.floor(n / 1e9));
    for (const locale of LOCALES) for (const n of counts) expect(formatCount(n, locale), `${n} in ${locale}`).toBe(n.toLocaleString(locale));
  });

  it('leave to Intl what is not a plain count, and still write it as toLocaleString does', () => {
    for (const locale of [...LOCALES, 'de-DE', 'fr-FR']) {
      for (const n of [-0, -1, -1_234, 1.5, 1_234.5678, 2 ** 60, Number.NaN, Number.POSITIVE_INFINITY, 1_234_567]) {
        expect(formatCount(n, locale), `${n} in ${locale}`).toBe(n.toLocaleString(locale));
      }
    }
  });

  it('write a plate’s return as toLocaleString did, to the tenth, in both languages', () => {
    const values = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 1.25, 89.5, 90, 92.3, 95.262, 96.6, 97.3, 99.5, 99.54, 99.55, 99.65, 99.73, 99.95, 100, 999.95, 1_234.56, 98_765.43];
    values.push(...sample(100, 600), ...sample(1e7, 200));
    // The plates' own figures: a fraction in thousandths, rounded down a hair (floorPlan.ts `percent`).
    for (let thousandths = 800; thousandths <= 1_000; thousandths++) values.push(Math.round(thousandths - 1e-6) / 10);
    for (const locale of [...LOCALES, 'de-DE']) {
      for (const value of [...values, -0, -2.5, Number.NaN]) {
        expect(percentToTenth(value, locale), `${value} in ${locale}`).toBe(`${value.toLocaleString(locale, TENTHS)}%`);
      }
    }
    expect(percentToTenth(99.5, 'en-US')).toBe('99.5%');
    expect(percentToTenth(90, 'ja-JP')).toBe('90.0%');
  });

  it('make one Intl formatter for each locale and options, and keep it', () => {
    expect(numberFormat('en-US', TENTHS)).toBe(numberFormat('en-US', { ...TENTHS }));
    expect(numberFormat('ja-JP', TENTHS)).not.toBe(numberFormat('en-US', TENTHS));
    expect(numberFormat('en-US')).not.toBe(numberFormat('en-US', TENTHS));
  });
});
