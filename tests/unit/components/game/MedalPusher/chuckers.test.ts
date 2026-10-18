import { describe, expect, it } from 'vitest';

import { CATCHER } from '@/components/game/MedalPusher/catcher';
import { CHUCKERS, chuckerSpot, chuckerSpots } from '@/components/game/MedalPusher/chuckers';
import { CHECKERS, FIELD, MEDAL_RADIUS, PUSHER, checkerAt, pusherFront } from '@/components/game/MedalPusher/engine';
import { TUBE } from '@/components/game/MedalPusher/stacker';
import { HEIGHT, VIEW, project } from '@/components/game/MedalPusher/view';

/** Moments all through the pusher's stroke, and one long after. */
const TIMES = [0, 0.4, PUSHER.period / 4, PUSHER.period / 2, 2.9, PUSHER.period, 61.7];
const ALL = [0, 1, 2];

describe('where the chuckers are', () => {
  it('has three of them in a row in the middle of the lip, the same on either side of the middle', () => {
    expect(CHUCKERS.count).toBe(3);
    const spots = chuckerSpots(0);
    expect(spots).toHaveLength(CHUCKERS.count);
    expect(spots.map((spot) => spot.x)).toEqual([...CHECKERS.positions]);
    expect(spots[1].x).toBe(FIELD.width / 2);
    expect(spots[1].x - spots[0].x).toBe(spots[2].x - spots[1].x);
    // Together they take up the middle of the lip and leave a third of it clear on either side.
    expect(spots[0].x - CHUCKERS.radius).toBeGreaterThan(FIELD.width * 0.3);
    expect(spots[2].x + CHUCKERS.radius).toBeLessThan(FIELD.width * 0.7);
    ALL.forEach((chucker) => expect(chuckerSpot(chucker, 0)).toEqual(spots[chucker]));
  });

  it('rides out and back on the lip of the pusher, and never moves along it', () => {
    for (const time of TIMES) {
      const spots = chuckerSpots(time);
      spots.forEach((spot, chucker) => {
        expect(spot).toEqual({ x: CHECKERS.positions[chucker], height: HEIGHT.pusher, depth: pusherFront(time) });
        expect(spot.depth).toBeGreaterThanOrEqual(PUSHER.min);
        expect(spot.depth).toBeLessThanOrEqual(PUSHER.max);
      });
    }
    // Fully back when the machine starts, fully out half a stroke later, and back again after a whole one.
    expect(chuckerSpot(1, 0).depth).toBe(PUSHER.min);
    expect(chuckerSpot(1, PUSHER.period / 2).depth).toBeCloseTo(PUSHER.max, 9);
    expect(chuckerSpot(1, PUSHER.period).depth).toBeCloseTo(PUSHER.min, 9);
    expect(CHUCKERS.height).toBe(HEIGHT.pusher);
  });

  it('has a mouth as wide as a medal that just fits, clear of its neighbours and of the towers between them', () => {
    expect(CHUCKERS.radius).toBe(MEDAL_RADIUS + CHECKERS.halfWidth);
    const play = CHUCKERS.radius - MEDAL_RADIUS;
    ALL.forEach((chucker) => {
      const { x } = chuckerSpot(chucker, 0);
      // A medal whose middle is this far off the mouth's is still wholly inside it, and that is the furthest the engine lets one through.
      expect(checkerAt(x + play - 0.001)).toBe(chucker);
      expect(checkerAt(x - play + 0.001)).toBe(chucker);
      expect(checkerAt(x + play + 0.001)).toBe(-1);
      expect(checkerAt(x - play - 0.001)).toBe(-1);
    });
    // Two mouths do not run into one another: there is more than half a medal's width of lip between them.
    const gap = CHECKERS.positions[1] - CHECKERS.positions[0] - CHUCKERS.radius * 2;
    expect(gap).toBeGreaterThan(MEDAL_RADIUS);
    // The arms leave the towers halfway between two chuckers, and a tower that comes straight down the pusher goes over there.
    expect(TUBE.site).toEqual([(CHECKERS.positions[0] + CHECKERS.positions[1]) / 2, (CHECKERS.positions[1] + CHECKERS.positions[2]) / 2]);
    expect(checkerAt((CHECKERS.positions[0] + CHECKERS.positions[1]) / 2)).toBe(-1);
    expect(checkerAt((CHECKERS.positions[1] + CHECKERS.positions[2]) / 2)).toBe(-1);
  });

  it('takes medals at a wider width while its wings are open, and still not the ones half way to the next', () => {
    expect(CHECKERS.wingWidth).toBeGreaterThan(CHECKERS.halfWidth);
    ALL.forEach((chucker) => {
      const { x } = chuckerSpot(chucker, 0);
      for (const side of [-1, 1]) {
        // Up to the wider width and no further; and what is between the two widths fits only then.
        expect(checkerAt(x + side * (CHECKERS.wingWidth - 0.001), CHECKERS.wingWidth)).toBe(chucker);
        expect(checkerAt(x + side * (CHECKERS.wingWidth + 0.001), CHECKERS.wingWidth)).toBe(-1);
        expect(checkerAt(x + side * (CHECKERS.wingWidth - 0.001))).toBe(-1);
      }
    });
    // Two wide mouths do not run into one another either, frames and all, and the towers still go over between them.
    expect(CHECKERS.positions[1] - CHECKERS.positions[0] - (MEDAL_RADIUS + CHECKERS.wingWidth) * 2).toBeGreaterThan(2 * CATCHER.rim.wide + 1);
    expect(checkerAt((CHECKERS.positions[0] + CHECKERS.positions[1]) / 2, CHECKERS.wingWidth)).toBe(-1);
    expect(checkerAt((CHECKERS.positions[1] + CHECKERS.positions[2]) / 2, CHECKERS.wingWidth)).toBe(-1);
  });

  it('fits the picture: every mouth is inside the drawing wherever the pusher is', () => {
    for (const time of TIMES) {
      for (const spot of chuckerSpots(time)) {
        for (const side of [-1, 1]) {
          const edge = project(spot.x + side * CHUCKERS.radius, spot.height, spot.depth);
          expect(edge.x).toBeGreaterThan(0);
          expect(edge.x).toBeLessThan(VIEW.width);
          expect(edge.y).toBeGreaterThan(0);
          expect(edge.y).toBeLessThan(VIEW.height);
        }
      }
    }
    // The three are drawn left to right in the order they are numbered.
    const across = chuckerSpots(1).map((spot) => project(spot.x, spot.height, spot.depth).x);
    expect(across[0]).toBeLessThan(across[1]);
    expect(across[1]).toBeLessThan(across[2]);
  });

  it('has no chucker but the three', () => {
    for (const chucker of [-1, 3, 1.5, Number.NaN]) expect(() => chuckerSpot(chucker, 0)).toThrow();
  });
});
