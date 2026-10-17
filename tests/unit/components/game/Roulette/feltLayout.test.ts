import { describe, expect, it } from 'vitest';
import {
  CORNERS,
  LINES,
  SPLITS_ACROSS,
  SPLITS_ALONG,
  STREETS,
  cellPlace,
  cellPoint,
  numberAt,
  stripPlace,
  zonePlace,
  type Point,
} from '@/components/game/Roulette/feltLayout';

// The felt is laid out wide (numbers running across) or upright (numbers running down) by its width. A cell is placed
// by its grid column and row, a hit zone by percentages of the number area; these check that the two agree in both
// layouts, so that every split and corner sits exactly on the border its numbers share, wherever the felt is.

/** Where a number's cell centre lies, as fractions of the number area, worked out from its grid placement. */
function cellCentre(n: number, layout: 'wide' | 'up'): { left: number; top: number } {
  const place = cellPlace(n) as Record<string, number>;
  if (layout === 'wide') {
    // Grid column 1 is the 0; the numbers are columns 2–13 and rows 1–3.
    return { left: (place['--wide-col'] - 2 + 0.5) / 12, top: (place['--wide-row'] - 1 + 0.5) / 3 };
  }
  // Grid columns 1 and 2 are the lines and the streets, row 1 the 0; the numbers are columns 3–5 and rows 2–13.
  return { left: (place['--up-col'] - 3 + 0.5) / 3, top: (place['--up-row'] - 2 + 0.5) / 12 };
}

/** A zone's centre, as fractions of the number area, as its inline style places it. */
function zoneCentre(at: Point, layout: 'wide' | 'up'): { left: number; top: number } {
  const place = zonePlace(at) as Record<string, string>;
  const pct = (v: string) => Number(v.replace('%', '')) / 100;
  return layout === 'wide'
    ? { left: pct(place['--wide-x']), top: pct(place['--wide-y']) }
    : { left: pct(place['--up-x']), top: pct(place['--up-y']) };
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe('the felt’s layout', () => {
  it('puts the 36 numbers on 36 different cells in each layout, 1 2 3 across the top row when upright', () => {
    for (const layout of ['wide', 'up'] as const) {
      const seen = new Set<string>();
      for (let n = 1; n <= 36; n++) {
        const { left, top } = cellCentre(n, layout);
        seen.add(`${left.toFixed(4)},${top.toFixed(4)}`);
      }
      expect(seen.size).toBe(36);
    }
    // Upright: 1 2 3 left to right on the first row, 34 35 36 on the last, as a phone's roulette table reads.
    expect([1, 2, 3].map((n) => cellPlace(n)['--up-row'])).toEqual([2, 2, 2]);
    expect([1, 2, 3].map((n) => cellPlace(n)['--up-col'])).toEqual([3, 4, 5]);
    expect([34, 35, 36].map((n) => cellPlace(n)['--up-row'])).toEqual([13, 13, 13]);
    // Wide: 3 6 9 … along the top, 1 4 7 … along the bottom, as before.
    expect(numberAt(0, 0)).toBe(3);
    expect(cellPlace(3)['--wide-row']).toBe(1);
    expect(cellPlace(1)['--wide-row']).toBe(3);
  });

  it('puts every split and corner on the point its numbers share, in both layouts', () => {
    const zones = [...SPLITS_ALONG, ...SPLITS_ACROSS, ...CORNERS];
    expect(zones).toHaveLength(33 + 24 + 22);
    for (const { numbers, at } of zones) {
      // The point in table cells is the middle of the numbers' cells.
      const centres = numbers.map(cellPoint);
      expect(at.x).toBeCloseTo(mean(centres.map((c) => c.x)), 9);
      expect(at.y).toBeCloseTo(mean(centres.map((c) => c.y)), 9);
      for (const layout of ['wide', 'up'] as const) {
        const cells = numbers.map((n) => cellCentre(n, layout));
        const zone = zoneCentre(at, layout);
        expect(zone.left, `${numbers} ${layout}`).toBeCloseTo(mean(cells.map((c) => c.left)), 9);
        expect(zone.top, `${numbers} ${layout}`).toBeCloseTo(mean(cells.map((c) => c.top)), 9);
      }
      // A split's numbers are neighbours, a corner's a 2 × 2 block.
      const xs = new Set(centres.map((c) => c.x));
      const ys = new Set(centres.map((c) => c.y));
      expect(xs.size * ys.size).toBe(numbers.length);
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    }
  });

  it('puts each street beside its three numbers and each line between its two streets', () => {
    for (const { k, numbers } of STREETS) {
      expect(numbers.map((n) => cellPlace(n)['--wide-col'])).toEqual([k + 2, k + 2, k + 2]);
      expect(numbers.map((n) => cellPlace(n)['--up-row'])).toEqual([k + 2, k + 2, k + 2]);
      expect(stripPlace(k)['--at']).toBe(k + 2);
    }
    for (const { k, numbers } of LINES) {
      const at = stripPlace(k)['--at'] as number;
      expect(new Set(numbers.map((n) => cellPlace(n)['--wide-col']))).toEqual(new Set([at, at + 1]));
      expect(new Set(numbers.map((n) => cellPlace(n)['--up-row']))).toEqual(new Set([at, at + 1]));
    }
  });
});
