import { describe, expect, it } from 'vitest';

import { LAMPS, LAMP_COUNT, NUMBER_SEGMENTS, SEGMENT_COUNT, WHEEL, seeded, spinFrom } from '@/components/game/BigWheel/engine';
import {
  CALM_MS,
  FLAPPER,
  RUN_MS,
  SEG,
  SPIN_UP,
  angleAt,
  angleFor,
  frameAt,
  freeSwing,
  lampAt,
  offsetAt,
  pegAt,
  pegsPast,
  planLamps,
  planLength,
  planSpin,
  pushedBend,
  runAt,
  runShape,
  runSpeed,
  segmentAt,
  showOf,
  touching,
} from '@/components/game/BigWheel/physics';

// The wheel's result is drawn first; this only moves the wheel to it. These check, over thousands of spins one after
// another (each starting where the last stopped), that every spin ends on the segment drawn, the way a real one stops.

describe('the wheel’s angles', () => {
  it('puts each segment under the pointer at its own angle, and reads it back', () => {
    for (let index = 0; index < SEGMENT_COUNT; index++) {
      expect(segmentAt(angleFor(index))).toBe(index);
      expect(segmentAt(angleFor(index, 0.45))).toBe(index);
      expect(segmentAt(angleFor(index, -0.45))).toBe(index);
      expect(offsetAt(angleFor(index, 0.3))).toBeCloseTo(0.3, 9);
    }
    // Turning clockwise, the segment under the pointer counts down: the next one to come is the one before.
    expect(segmentAt(angleFor(10) + SEG)).toBe(9);
  });

  it('has the pegs between the segments: none at a segment’s middle, one at each edge', () => {
    expect(Math.abs(pegAt(angleFor(7)))).toBeCloseTo(0.5, 9);
    expect(pegAt(angleFor(7, -0.5) + 1e-9)).toBeCloseTo(0, 6);
    // The next peg to come is behind the pointer (below 0) and moves up to it as the wheel turns.
    expect(pegAt(angleFor(7, -0.3))).toBeCloseTo(-0.2, 9);
    expect(pegAt(angleFor(7, -0.3) + SEG * 0.1)).toBeCloseTo(-0.1, 9);
  });
});

describe('the flapper', () => {
  it('is bent by a peg from where it reaches the tip to where it slips off, and swings back less each time', () => {
    expect(touching(-FLAPPER.reach - 0.01)).toBe(false);
    expect(pushedBend(-FLAPPER.reach)).toBeCloseTo(0, 9);
    expect(pushedBend(FLAPPER.slip)).toBeCloseTo(FLAPPER.bend, 9);
    expect(pushedBend(0.2)).toBe(0);
    expect(freeSwing(30, 0)).toBe(30);
    // Never let go of by a peg yet: it hangs straight, a number and not NaN.
    expect(freeSwing(0, Infinity)).toBe(0);
    expect(freeSwing(30, 5_000)).toBe(0);
    expect(freeSwing(30, FLAPPER.period / 2)).toBeLessThan(0);
    const swings = [0, 1, 2, 3].map((k) => Math.abs(freeSwing(30, k * FLAPPER.period)));
    for (let k = 1; k < swings.length; k++) expect(swings[k]).toBeLessThan(swings[k - 1]);
  });

  it('counts a peg each time one slips past the tip', () => {
    expect(pegsPast(10 * SEG) - pegsPast(0)).toBe(10);
    expect(pegsPast(angleFor(3, -0.39))).toBe(pegsPast(angleFor(3, 0.2)));
  });
});

describe('a spin of the wheel', () => {
  it('slows quickly at first and gently at the end, and stops with no speed left', () => {
    for (const kappa of [1.8, 2.2, 2.6]) {
      expect(runShape(0, kappa)).toBe(0);
      expect(runShape(1, kappa)).toBe(1);
      expect(runSpeed(0, kappa)).toBeGreaterThan(2.4);
      expect(runSpeed(0.999, kappa)).toBeLessThan(0.02);
      let before = Infinity;
      for (let s = 0; s <= 1; s += 0.05) {
        const speed = runSpeed(s, kappa);
        expect(speed).toBeLessThanOrEqual(before);
        before = speed;
      }
      // Half its slowing comes in well under half its time.
      expect(runSpeed(0.3, kappa)).toBeLessThan(runSpeed(0, kappa) / 1.8);
      // The motor brings it up to speed from standing: it starts still, and is at full speed by the end of the spin-up.
      expect(runAt(0, kappa)).toBe(0);
      expect(runAt(0.001, kappa)).toBeLessThan(runShape(0.001, kappa) / 100);
      expect(runAt(SPIN_UP, kappa)).toBe(runShape(SPIN_UP, kappa));
      expect(runAt(1, kappa)).toBe(1);
      let last = 0;
      for (let s = 0; s <= 1; s += 0.001) {
        expect(runAt(s, kappa)).toBeGreaterThanOrEqual(last);
        last = runAt(s, kappa);
      }
    }
  });

  it('ends on the segment drawn, every time, a thousand spins in a row each from where the last stopped', () => {
    const rng = seeded(42);
    let from = 0;
    let worstEnd = 0;
    let backwards = 0;
    let neverArrived = 0;
    for (let i = 0; i < 1_000; i++) {
      const target = Math.floor(rng() * SEGMENT_COUNT);
      const plan = planSpin(from, target, rng);
      expect(angleAt(plan, 0)).toBe(from);
      expect(angleAt(plan, planLength(plan))).toBe(plan.end);
      expect(segmentAt(plan.end), `spin ${i}`).toBe(target);
      // At rest the flapper hangs free: no peg is touching it.
      expect(touching(pegAt(plan.end)), `spin ${i}`).toBe(false);
      // It turns two or three times and more, clockwise, for five to seven seconds.
      expect(plan.over - plan.from).toBeGreaterThan(720);
      expect(plan.over - plan.from).toBeLessThan(4 * 360);
      expect(plan.run).toBeGreaterThanOrEqual(RUN_MS.least);
      expect(plan.run).toBeLessThanOrEqual(RUN_MS.most);
      if (plan.settle > 0) {
        // Stalled with the next peg leaning on the flapper, not past it, then pushed back clear.
        expect(touching(pegAt(plan.over)), `spin ${i}`).toBe(true);
        expect(pegsPast(plan.over)).toBe(pegsPast(plan.end));
        expect(segmentAt(plan.over)).toBe(target);
      }
      // Never backwards in its run; once on the segment drawn for the last time, it never leaves it. (Counted with plain
      // arithmetic and checked once: an expect a frame would take seconds.)
      let before = -Infinity;
      let arrived = -1;
      for (let ms = 0; ms <= planLength(plan) + 8; ms += 8) {
        const angle = angleAt(plan, ms);
        if (ms <= plan.run && angle < before - 1e-9) backwards += 1;
        before = angle;
        if (segmentAt(angle) !== target) arrived = -1;
        else if (arrived < 0) arrived = ms;
      }
      if (arrived < 0) neverArrived += 1;
      worstEnd = Math.max(worstEnd, Math.abs(angleAt(plan, plan.run - 1) - angleAt(plan, plan.run)));
      from = plan.end;
    }
    expect(backwards).toBe(0);
    expect(neverArrived).toBe(0);
    // Barely moving in its last millisecond of the run.
    expect(worstEnd).toBeLessThan(0.01);
  });

  it('always settles on BONUS and the two top numbers by leaning on the next peg first', () => {
    const rng = seeded(7);
    for (const segment of [WHEEL.indexOf('bonus'), WHEEL.indexOf(40), WHEEL.indexOf(20)]) {
      for (let i = 0; i < 20; i++) expect(planSpin(0, segment, rng).settle).toBeGreaterThan(0);
    }
  });
});

describe('the hub’s lamps', () => {
  it('run round at least twice, slower and slower, and stop on the lamp drawn', () => {
    const rng = seeded(3);
    let from = 0;
    for (let target = 0; target < LAMP_COUNT; target++) {
      const plan = planLamps(from, target, rng);
      expect(plan.steps).toBeGreaterThanOrEqual(2 * LAMP_COUNT);
      expect(lampAt(plan, 0)).toBe(from);
      expect(lampAt(plan, plan.run)).toBe(target);
      // The gaps between steps grow.
      const changes: number[] = [];
      let lit = lampAt(plan, 0);
      for (let ms = 0; ms <= plan.run + 2; ms += 2) {
        const now = lampAt(plan, ms);
        if (now !== lit) changes.push(ms);
        lit = now;
      }
      expect(changes.length).toBe(plan.steps);
      expect(changes[changes.length - 1] - changes[changes.length - 2]).toBeGreaterThan(changes[1] - changes[0]);
      from = target;
    }
  });
});

describe('a spin as the machine shows it', () => {
  const bonusAt = WHEEL.indexOf('bonus');

  it('shows a plain spin as one run, ending on the stop', () => {
    const spin = spinFrom(0.5 / SEGMENT_COUNT + 13 / SEGMENT_COUNT, 0, 0);
    const show = showOf(spin, 0, 0, seeded(1));
    expect(show.steps.map((step) => step.phase)).toEqual(['spin']);
    expect(frameAt(show, show.length).phase).toBe('done');
    expect(segmentAt(frameAt(show, show.length).angle)).toBe(spin.stop);
    expect(frameAt(show, show.length).lamp).toBeNull();
  });

  it('shows a BONUS as the stop, the flash, the lamps and the second chance, ending on the second chance’s number', () => {
    for (let lamp = 0; lamp < LAMP_COUNT; lamp += 5) {
      for (const k of [0, 17, 49]) {
        const spin = spinFrom((bonusAt + 0.5) / SEGMENT_COUNT, (lamp + 0.5) / LAMP_COUNT, (k + 0.5) / 50);
        expect(spin).toEqual({ stop: bonusAt, lamp, second: NUMBER_SEGMENTS[k] });
        const show = showOf(spin, 123, 4, seeded(lamp * 100 + k));
        expect(show.steps.map((step) => step.phase)).toEqual(['spin', 'bonus', 'chance', 'second']);
        const firstEnd = show.steps[0].at + show.steps[0].length;
        expect(segmentAt(frameAt(show, firstEnd + 10).angle)).toBe(bonusAt);
        expect(frameAt(show, firstEnd + 10).phase).toBe('bonus');
        const chance = show.steps[2];
        expect(frameAt(show, chance.at + chance.length - 1).lamp).toBe(lamp);
        expect(LAMPS[frameAt(show, chance.at + chance.length - 1).lamp!]).toBe(LAMPS[lamp]);
        const end = frameAt(show, show.length);
        expect(end.phase).toBe('done');
        expect(segmentAt(end.angle)).toBe(spin.second);
        expect(end.lamp).toBe(lamp);
        // About fifteen to twenty seconds in all, for the whole bonus.
        expect(show.length).toBeGreaterThan(14_000);
        expect(show.length).toBeLessThan(20_000);
      }
    }
  });

  it('with less motion, puts the wheel and the lamps straight where they stop, in moments', () => {
    const spin = spinFrom((bonusAt + 0.5) / SEGMENT_COUNT, 0.5 / LAMP_COUNT, 0.5 / 50);
    const show = showOf(spin, 0, 0, seeded(9), true);
    expect(show.length).toBe(CALM_MS.spin + CALM_MS.bonus + CALM_MS.chance + CALM_MS.second);
    expect(show.length).toBeLessThan(1_500);
    expect(segmentAt(frameAt(show, 1).angle)).toBe(bonusAt);
    expect(frameAt(show, CALM_MS.spin + CALM_MS.bonus + 1).lamp).toBe(0);
    expect(segmentAt(frameAt(show, show.length).angle)).toBe(spin.second);
  });
});
