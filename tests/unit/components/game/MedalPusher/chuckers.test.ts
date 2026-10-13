import { describe, expect, it } from 'vitest';

import { CHUCKERS, chuckerSpot, chuckerSpots, droppedThrough, grazed } from '@/components/game/MedalPusher/chuckers';
import {
  CHECKERS,
  FIELD,
  MEDAL_RADIUS,
  PUSHER,
  TOWER,
  checkerAt,
  createMachine,
  pusherFront,
  step,
  type Machine,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import { LIP_FALL } from '@/components/game/MedalPusher/render';
import { HEIGHT, VIEW, project } from '@/components/game/MedalPusher/view';

import { dropAt } from './feeding';

const DT = 1 / 60;
/** Moments all through the pusher's stroke, and one long after. */
const TIMES = [0, 0.4, PUSHER.period / 4, PUSHER.period / 2, 2.9, PUSHER.period, 61.7];
const ALL = [0, 1, 2];

/** A medal lying where it is put. */
const medalAt = (x: number, y: number, over: Partial<Medal> = {}): Medal => ({ id: 1, x, y, level: 0, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1, ...over });
/** A machine with nothing on it but these. */
const machineWith = (medals: Medal[]): Machine => {
  const machine = createMachine(3);
  machine.medals = medals;
  return machine;
};

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
    // The towers go up halfway between two chuckers, and a tower that comes straight down the pusher goes over there.
    expect(CHECKERS.positions[1] - CHECKERS.positions[0]).toBe(TOWER.spacing);
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
    // Two wide mouths do not run into one another either, and the towers still go over between them.
    expect(CHECKERS.positions[1] - CHECKERS.positions[0] - (MEDAL_RADIUS + CHECKERS.wingWidth) * 2).toBeGreaterThan(MEDAL_RADIUS);
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

describe('the chucker a medal came through', () => {
  it('is where the engine sends a medal that goes over the lip at a mouth', () => {
    for (const time of [0, 1.1, 2.5]) {
      ALL.forEach((chucker) => {
        const machine = machineWith([]);
        machine.time = time;
        const spot = chuckerSpot(chucker, machine.time);
        // A medal lying on the pusher, just past the lip in line with the mouth: the next step takes it over and through.
        const medal = medalAt(spot.x, spot.depth + 0.5, { level: 1 });
        machine.medals = [medal];
        expect(droppedThrough(medal)).toBe(-1);
        expect(step(machine, DT).checkers).toEqual([chucker]);
        expect(medal.level).toBe(0);
        expect(medal.sinceDrop).toBe(0);
        expect(droppedThrough(medal)).toBe(chucker);
      });
    }
  });

  it('is none for a medal that came over beside them, for a ball, and for a medal that is not on its way down', () => {
    const over = (x: number, medal: Partial<Medal> = {}) => {
      const machine = machineWith([medalAt(x, PUSHER.min + 0.5, { level: 1, ...medal })]);
      step(machine, DT);
      expect(machine.medals[0].level).toBe(0);
      return machine.medals[0];
    };
    expect(droppedThrough(over(CHECKERS.positions[1] + CHUCKERS.radius))).toBe(-1);
    expect(droppedThrough(over(43))).toBe(-1);
    expect(droppedThrough(over(10))).toBe(-1);
    expect(droppedThrough(over(CHECKERS.positions[1], { ball: true }))).toBe(-1);
    expect(droppedThrough(over(CHECKERS.positions[1]))).toBe(1);
    // Lying on the pusher behind a mouth, or lying on the lower table in front of one since the machine was set up.
    expect(droppedThrough(medalAt(CHECKERS.positions[1], 20, { level: 1 }))).toBe(-1);
    expect(droppedThrough(medalAt(CHECKERS.positions[1], 60))).toBe(-1);
  });

  it('is where the engine sends a medal that goes over the lip at a mouth whose wings are open, from further to the side', () => {
    ALL.forEach((chucker) => {
      for (const side of [-1, 1]) {
        for (const wings of [false, true]) {
          const machine = machineWith([]);
          machine.time = 1.1;
          const spot = chuckerSpot(chucker, machine.time);
          // Between the two widths: it fits the mouth only while the wings are open.
          const medal = medalAt(spot.x + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5, spot.depth + 0.5, { level: 1 });
          machine.medals = [medal];
          expect(step(machine, DT, wings).checkers).toEqual(wings ? [chucker] : []);
          expect(medal.sinceDrop).toBe(0);
          expect(droppedThrough(medal, CHUCKERS.drop, wings)).toBe(wings ? chucker : -1);
          // Whoever asks has to say how the wings are: the same medal, asked the other way, is told the other thing.
          expect(droppedThrough(medal, CHUCKERS.drop, !wings)).toBe(wings ? -1 : chucker);
          expect(droppedThrough(medal)).toBe(-1);
        }
      }
    });
  });

  it('is told only while the medal is drawn falling from the lip', () => {
    // The renderers draw that fall for this long.
    expect(CHUCKERS.drop).toBe(LIP_FALL);
    const machine = machineWith([medalAt(CHECKERS.positions[0], PUSHER.min + 0.5, { level: 1 })]);
    const [medal] = machine.medals;
    step(machine, DT);
    let shown = 0;
    while (droppedThrough(medal) === 0 && shown < 100) {
      step(machine, DT);
      shown++;
    }
    expect(medal.sinceDrop).toBeGreaterThanOrEqual(CHUCKERS.drop);
    expect(medal.sinceDrop).toBeLessThan(CHUCKERS.drop + DT + 1e-9);
    expect(droppedThrough(medal)).toBe(-1);
    // A renderer that draws the fall for longer, or not at all, says so.
    expect(droppedThrough(medal, 5)).toBe(0);
    expect(droppedThrough(medal, 0)).toBe(-1);
  });

  it('agrees with the engine’s own count, medal for medal, on a machine in play', { timeout: 30_000 }, () => {
    const machine = createMachine(12);
    let counted = 0;
    let seen = 0;
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 20 === 0) dropAt(machine, FIELD.width / 2);
      const events = step(machine, DT);
      // No tower is on this machine, so every entry is a single medal: the ones that have just come over, and are in a mouth.
      counted += events.checkers.length;
      const fresh = machine.medals.filter((medal) => medal.level === 0 && medal.sinceDrop === 0);
      seen += fresh.filter((medal) => droppedThrough(medal) >= 0).length;
      expect(fresh.map((medal) => droppedThrough(medal)).filter((chucker) => chucker >= 0).sort()).toEqual([...events.checkers].sort());
    }
    expect(counted).toBeGreaterThan(10);
    expect(seen).toBe(counted);
  });
});

describe('the chucker a medal caught the edge of', () => {
  /** How far to the side of fitting a medal may come over and still catch a mouth's edge, for these tests. */
  const REACH = 2.2;
  /** A medal that has just come over the lip at `x`. */
  const fresh = (x: number, over: Partial<Medal> = {}): Medal => medalAt(x, PUSHER.min + MEDAL_RADIUS, { sinceDrop: 0, ...over });

  it('is the one it came over a little to one side of, on either side, and none for a medal that fitted or came over further off', () => {
    ALL.forEach((chucker) => {
      const center = CHECKERS.positions[chucker];
      for (const side of [-1, 1]) {
        // Just past fitting, and all the way out to the reach.
        expect(grazed(fresh(center + side * (CHECKERS.halfWidth + 0.001)), 1, REACH)).toBe(chucker);
        expect(grazed(fresh(center + side * (CHECKERS.halfWidth + REACH / 2)), 1, REACH)).toBe(chucker);
        expect(grazed(fresh(center + side * (CHECKERS.halfWidth + REACH - 0.001)), 1, REACH)).toBe(chucker);
        // Past the reach it caught nothing.
        expect(grazed(fresh(center + side * (CHECKERS.halfWidth + REACH + 0.001)), 1, REACH)).toBe(-1);
        // One that fitted went through: it did not catch the edge.
        expect(grazed(fresh(center + side * (CHECKERS.halfWidth - 0.001)), 1, REACH)).toBe(-1);
        expect(droppedThrough(fresh(center + side * (CHECKERS.halfWidth - 0.001)))).toBe(chucker);
      }
      expect(grazed(fresh(center), 1, REACH)).toBe(-1);
    });
    // With no reach at all nothing is caught, and with more of it more is.
    expect(grazed(fresh(CHECKERS.positions[1] + CHECKERS.halfWidth + 0.5), 1, 0)).toBe(-1);
    expect(grazed(fresh(CHECKERS.positions[1] + CHECKERS.halfWidth + 0.5), 1, 0.4)).toBe(-1);
    expect(grazed(fresh(CHECKERS.positions[1] + CHECKERS.halfWidth + 0.5), 1, 0.6)).toBe(1);
  });

  it('never says a medal both went through a mouth and caught its edge, all across the lip, wings folded or open', () => {
    let through = 0;
    let caughtEdge = 0;
    for (const wings of [false, true]) {
      for (let x = 0; x <= FIELD.width; x += 0.05) {
        const medal = fresh(x);
        const went = droppedThrough(medal, 1, wings);
        const edge = grazed(medal, 1, REACH, wings);
        expect(went >= 0 && edge >= 0).toBe(false);
        if (went >= 0) through++;
        if (edge >= 0) {
          caughtEdge++;
          // The edge it caught is that of the mouth nearest to it.
          const nearest = ALL.reduce((best, chucker) => (Math.abs(x - CHECKERS.positions[chucker]) < Math.abs(x - CHECKERS.positions[best]) ? chucker : best), 0);
          expect(edge).toBe(nearest);
        }
      }
    }
    expect(through).toBeGreaterThan(0);
    expect(caughtEdge).toBeGreaterThan(through);
  });

  it('is none for a ball, for a medal that is not on its way down, and once the time it is asked about is up', () => {
    const x = CHECKERS.positions[0] + CHECKERS.halfWidth + REACH / 2;
    expect(grazed(fresh(x), 0.5, REACH)).toBe(0);
    expect(grazed(fresh(x, { ball: true }), 0.5, REACH)).toBe(-1);
    expect(grazed(fresh(x, { level: 1 }), 0.5, REACH)).toBe(-1);
    expect(grazed(fresh(x, { sinceDrop: -1 }), 0.5, REACH)).toBe(-1);
    // It is told for as long as whoever draws the medal says, and no longer.
    expect(grazed(fresh(x, { sinceDrop: 0.49 }), 0.5, REACH)).toBe(0);
    expect(grazed(fresh(x, { sinceDrop: 0.5 }), 0.5, REACH)).toBe(-1);
    expect(grazed(fresh(x, { sinceDrop: 0.5 }), 5, REACH)).toBe(0);
    expect(grazed(fresh(x), 0, REACH)).toBe(-1);
  });

  it('measures from the wider width while the wings are open', () => {
    const center = CHECKERS.positions[2];
    for (const side of [-1, 1]) {
      // Between the two widths: it catches the edge of a mouth with folded wings, and goes through one whose wings are open.
      const between = fresh(center + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5);
      expect(grazed(between, 1, REACH)).toBe(2);
      expect(grazed(between, 1, REACH, false)).toBe(2);
      expect(grazed(between, 1, REACH, true)).toBe(-1);
      expect(droppedThrough(between, 1, true)).toBe(2);
      // Past the reach of the narrow mouth and within that of the wide one.
      const wide = fresh(center + side * (CHECKERS.halfWidth + REACH + (CHECKERS.wingWidth - CHECKERS.halfWidth) / 2));
      expect(grazed(wide, 1, REACH)).toBe(-1);
      expect(grazed(wide, 1, REACH, true)).toBe(2);
      // And past that too.
      expect(grazed(fresh(center + side * (CHECKERS.wingWidth + REACH + 0.001)), 1, REACH, true)).toBe(-1);
    }
  });
});
