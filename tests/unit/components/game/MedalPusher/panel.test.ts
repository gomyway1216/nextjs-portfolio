import { describe, expect, it } from 'vitest';

import {
  HEAP_CAP,
  HEAP_ROWS,
  HEAP_SPOTS,
  SEGMENTS,
  SEGMENT_CELL,
  SEGMENT_NAMES,
  SEGMENT_SHAPES,
  TRAY,
  TRAY_BATCH,
  TRAY_JUMP,
  heapCount,
  leaveSide,
  segmentsFor,
  trayChange,
} from '@/components/game/MedalPusher/panel';
import { START_CREDITS } from '@/components/game/MedalPusher/session';

describe('seven-segment digits', () => {
  it('light the segments a seven-segment display lights for each digit', () => {
    expect(SEGMENT_NAMES).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(SEGMENTS).toEqual({ 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' });
    // No two digits light the same segments, and every segment is used by some digit and left dark by another.
    expect(new Set(Object.values(SEGMENTS)).size).toBe(10);
    for (const name of SEGMENT_NAMES) {
      expect(Object.values(SEGMENTS).some((lit) => lit.includes(name))).toBe(true);
      expect(Object.values(SEGMENTS).some((lit) => !lit.includes(name))).toBe(true);
    }
  });

  it('show a number at the right of the display with nothing in front of it', () => {
    expect(segmentsFor(100, 5)).toEqual(['', '', 'bc', 'abcdef', 'abcdef']);
    expect(segmentsFor(0, 5)).toEqual(['', '', '', '', 'abcdef']);
    expect(segmentsFor(7, 1)).toEqual(['abc']);
    expect(segmentsFor(98765, 5)).toEqual(['abcdfg', 'abcdefg', 'abc', 'acdefg', 'acdfg']);
    // Written with a comma, as the page writes a large number, it is the same number.
    expect(segmentsFor('1,234', 5)).toEqual(segmentsFor(1234, 5));
    expect(segmentsFor('1,234', 4)).toEqual(['bc', 'abdeg', 'abcdg', 'bcfg']);
    expect(segmentsFor('300', 4)).toEqual(['', 'abcdg', 'abcdef', 'abcdef']);
  });

  it('never show what is not a whole number of medals', () => {
    // Nothing written: nothing lit.
    expect(segmentsFor('', 4)).toEqual(['', '', '', '']);
    expect(segmentsFor('—', 4)).toEqual(['', '', '', '']);
    expect(segmentsFor(Number.NaN, 3)).toEqual(['', '', '']);
    expect(segmentsFor(Number.POSITIVE_INFINITY, 3)).toEqual(['', '', '']);
    // A purse is never less than nothing, and has no fractions.
    expect(segmentsFor(-5, 3)).toEqual(['', '', 'abcdef']);
    expect(segmentsFor(12.9, 3)).toEqual(['', 'bc', 'abdeg']);
    // A number too long for the display shows its last places, as a counter that has gone round does.
    expect(segmentsFor(123456, 4)).toEqual(segmentsFor(3456, 4));
    for (const places of [0, -1, 2.5, Number.NaN]) expect(() => segmentsFor(1, places)).toThrow();
  });

  it('are drawn as seven bars inside a cell', () => {
    for (const name of SEGMENT_NAMES) {
      const points = SEGMENT_SHAPES[name].split(' ').map((pair) => pair.split(',').map(Number));
      expect(points.length).toBeGreaterThanOrEqual(4);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(SEGMENT_CELL.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(SEGMENT_CELL.height);
      }
    }
    const middle = (name: 'a' | 'd' | 'g' | 'b' | 'f') => {
      const points = SEGMENT_SHAPES[name].split(' ').map((pair) => pair.split(',').map(Number));
      return { x: points.reduce((sum, [x]) => sum + x, 0) / points.length, y: points.reduce((sum, [, y]) => sum + y, 0) / points.length };
    };
    // The top bar is over the middle one, which is over the bottom one; the right-hand bars are to the right of the left-hand ones.
    expect(middle('a').y).toBeLessThan(middle('g').y);
    expect(middle('g').y).toBeLessThan(middle('d').y);
    expect(middle('f').x).toBeLessThan(middle('b').x);
  });
});

describe('the heap in the tray', () => {
  it('is a mound of sixty medals when it is full', () => {
    expect(HEAP_CAP).toBe(60);
    expect(HEAP_ROWS.reduce((sum, row) => sum + row, 0)).toBe(HEAP_CAP);
    expect(HEAP_SPOTS).toHaveLength(HEAP_CAP);
    // Each row is shorter than the one it lies on.
    for (let row = 1; row < HEAP_ROWS.length; row++) expect(HEAP_ROWS[row]).toBeLessThan(HEAP_ROWS[row - 1]);
    // A new machine's purse is a full tray.
    expect(START_CREDITS).toBeGreaterThanOrEqual(HEAP_CAP);
  });

  it('has a place for every medal, inside the dish, and no two in one place', () => {
    const { medal, width, floor, chute } = TRAY;
    for (const spot of HEAP_SPOTS) {
      expect(spot.x - medal.rx).toBeGreaterThan(4);
      expect(spot.x + medal.rx).toBeLessThan(width - 4);
      expect(spot.y + medal.ry).toBeLessThanOrEqual(floor + medal.ry + 1);
      // Under the mouth of the chute, never in it.
      expect(spot.y - medal.ry).toBeGreaterThan(chute.y + 3);
      expect(Math.abs(spot.tilt)).toBeLessThanOrEqual(8);
    }
    for (let i = 0; i < HEAP_SPOTS.length; i++) {
      for (let j = i + 1; j < HEAP_SPOTS.length; j++) {
        expect(Math.hypot(HEAP_SPOTS[i].x - HEAP_SPOTS[j].x, (HEAP_SPOTS[i].y - HEAP_SPOTS[j].y) * 2)).toBeGreaterThan(3);
      }
    }
  });

  it('is heaped from the bottom up, and each row from its middle outwards', () => {
    // The order the medals are heaped in is row by row.
    for (let i = 1; i < HEAP_SPOTS.length; i++) expect(HEAP_SPOTS[i].row).toBeGreaterThanOrEqual(HEAP_SPOTS[i - 1].row);
    // A higher row lies higher in the dish.
    const height = (row: number) => {
      const spots = HEAP_SPOTS.filter((spot) => spot.row === row);
      return spots.reduce((sum, spot) => sum + spot.y, 0) / spots.length;
    };
    for (let row = 1; row < HEAP_ROWS.length; row++) expect(height(row)).toBeLessThan(height(row - 1) - 3);
    // The first medals of the bottom row are the middle of it: a few medals are a small heap in the middle, not a row from one side.
    const bottom = HEAP_SPOTS.filter((spot) => spot.row === 0);
    const reach = (count: number) => Math.max(...bottom.slice(0, count).map((spot) => Math.abs(spot.x - TRAY.width / 2)));
    expect(reach(1)).toBeLessThan(2);
    expect(reach(3)).toBeLessThan(reach(7));
    expect(reach(7)).toBeLessThan(reach(11));
    // And the heap is the same to either side.
    const mean = HEAP_SPOTS.reduce((sum, spot) => sum + spot.x, 0) / HEAP_SPOTS.length;
    expect(Math.abs(mean - TRAY.width / 2)).toBeLessThan(1.5);
  });

  it('is as many medals as the purse holds, up to a full heap', () => {
    expect(heapCount(0)).toBe(0);
    expect(heapCount(1)).toBe(1);
    expect(heapCount(59)).toBe(59);
    expect(heapCount(60)).toBe(60);
    expect(heapCount(61)).toBe(60);
    expect(heapCount(98765)).toBe(60);
    expect(heapCount(-3)).toBe(0);
    expect(heapCount(7.9)).toBe(7);
    expect(heapCount(Number.NaN)).toBe(0);
    expect(heapCount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('what the tray acts out', () => {
  it('is a medal dropping in for each one won, a few at most at once', () => {
    expect(trayChange(10, 11)).toEqual({ arrive: 1, leave: 0 });
    expect(trayChange(10, 13)).toEqual({ arrive: 3, leave: 0 });
    expect(TRAY_BATCH.arrive).toBe(6);
    expect(trayChange(10, 16)).toEqual({ arrive: 6, leave: 0 });
    expect(trayChange(10, 30)).toEqual({ arrive: 6, leave: 0 });
    // A full tray is still paid into: the medals drop on to the heap.
    expect(trayChange(500, 503)).toEqual({ arrive: 3, leave: 0 });
  });

  it('is a medal leaving for each one fed, two at most at once', () => {
    expect(trayChange(10, 9)).toEqual({ arrive: 0, leave: 1 });
    expect(trayChange(10, 8)).toEqual({ arrive: 0, leave: 2 });
    expect(TRAY_BATCH.leave).toBe(2);
    expect(trayChange(10, 5)).toEqual({ arrive: 0, leave: 2 });
  });

  it('is nothing when nothing changed, or when the purse was not played but put there', () => {
    expect(trayChange(10, 10)).toEqual({ arrive: 0, leave: 0 });
    // A refill, a reset, a machine this browser remembered: the heap changes and nothing drops or leaves.
    expect(TRAY_JUMP).toBeLessThanOrEqual(START_CREDITS);
    expect(trayChange(0, START_CREDITS)).toEqual({ arrive: 0, leave: 0 });
    expect(trayChange(START_CREDITS, 1234)).toEqual({ arrive: 0, leave: 0 });
    expect(trayChange(1234, START_CREDITS)).toEqual({ arrive: 0, leave: 0 });
    expect(trayChange(10, 10 + TRAY_JUMP)).toEqual({ arrive: 0, leave: 0 });
    expect(trayChange(10, 10 + TRAY_JUMP - 1)).toEqual({ arrive: TRAY_BATCH.arrive, leave: 0 });
    expect(trayChange(Number.NaN, 5)).toEqual({ arrive: 0, leave: 0 });
  });

  it('sends a medal that is fed towards the button that fed it', () => {
    expect(leaveSide([true, false], 0)).toBe(-1);
    expect(leaveSide([true, false], 1)).toBe(-1);
    expect(leaveSide([false, true], 0)).toBe(1);
    expect(leaveSide([false, true], 5)).toBe(1);
    // Both held, or neither (Auto, or a tap that is already over): by turns.
    expect([0, 1, 2, 3].map((turn) => leaveSide([true, true], turn))).toEqual([-1, 1, -1, 1]);
    expect([0, 1, 2, 3].map((turn) => leaveSide([false, false], turn))).toEqual([-1, 1, -1, 1]);
  });
});
