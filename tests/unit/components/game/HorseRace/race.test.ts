import { describe, expect, it } from 'vitest';

import { allOrders, seeded } from '@/components/game/HorseRace/card';
import { CALLS, MARGINS, PHOTO_MOST, RUN_SECONDS, callsOf, isPhoto, planRace, planSeed, progressAt, standingsAt } from '@/components/game/HorseRace/race';
import type { RunningStyle } from '@/components/game/HorseRace/stable';
import { DISTANCE, LAP, LENGTH, spotAt } from '@/components/game/HorseRace/geometry';

// The race on the track is only a picture of a result drawn before it starts: every horse runs forward, the lead
// changes on the way, and they cross the line in exactly the drawn order. Checked for orders and looks of every kind,
// with plain arithmetic gathered up and asserted once, so that the test stays quick.

const STYLES: RunningStyle[] = ['front', 'stalker', 'closer', 'deep', 'front', 'closer'];

/** When a horse's run first reaches the post, found by halving. */
function crossing(plan: ReturnType<typeof planRace>, gate: number): number {
  let lo = 0;
  let hi = plan.end;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (progressAt(plan, gate, mid) >= DISTANCE) hi = mid;
    else lo = mid;
  }
  return hi;
}

describe('a race run to a drawn result', () => {
  const orders = allOrders();
  const rng = seeded(20261017);
  // 400 races: orders spread over all 720, styles shuffled, looks of every kind.
  const races = Array.from({ length: 400 }, (_, i) => {
    const order = orders[(i * 211) % orders.length];
    const styles = STYLES.map((_, g) => STYLES[(g + i) % STYLES.length]);
    return { order, plan: planRace(order, styles, Math.floor(rng() * 2 ** 32)) };
  });

  it('crosses the line in exactly the drawn order, each horse at its own finishing time', () => {
    let wrongOrder = 0;
    let worstTime = 0;
    for (const { order, plan } of races) {
      const times = order.map((gate) => crossing(plan, gate));
      for (let i = 1; i < times.length; i += 1) if (!(times[i] > times[i - 1])) wrongOrder += 1;
      order.forEach((gate, i) => {
        worstTime = Math.max(worstTime, Math.abs(times[i] - plan.finish[gate - 1]));
      });
    }
    expect(wrongOrder).toBe(0);
    expect(worstTime).toBeLessThan(1e-6);
  });

  it('runs every horse forward the whole way, from the gate to past the post', () => {
    let backwards = 0;
    let fastest = 0;
    for (const { plan } of races) {
      for (let gate = 1; gate <= 6; gate += 1) {
        let before = progressAt(plan, gate, 0);
        if (before !== 0) backwards += 1;
        for (let t = 0.02; t <= plan.end; t += 0.02) {
          const s = progressAt(plan, gate, t);
          if (s < before - 1e-9) backwards += 1;
          fastest = Math.max(fastest, (s - before) / 0.02);
          before = s;
        }
        expect(progressAt(plan, gate, plan.end + 5)).toBeGreaterThan(DISTANCE);
      }
    }
    expect(backwards).toBe(0);
    // Never faster than about two and a half times the average pace: no horse teleports.
    expect(fastest).toBeLessThan((2.5 * DISTANCE) / RUN_SECONDS);
  });

  it('changes the lead on the way: the winner never leads at the first call', () => {
    let led = 0;
    for (const { order, plan } of races) {
      if (plan.leaders[0] === order[0]) led += 1;
      expect(standingsAt(plan, CALLS[0] * RUN_SECONDS)[0]).toBe(plan.leaders[0]);
    }
    expect(led).toBe(0);
  });

  it('has the field strung out at the post by the drawn margins, and calls a photo only for the closest finishes', () => {
    let worst = 0;
    for (const { order, plan } of races) {
      const t = plan.finish[order[0] - 1];
      const gap = DISTANCE - progressAt(plan, order[1], t);
      const margin = MARGINS.find((m) => m.id === plan.margins[1])!.lengths * LENGTH;
      worst = Math.max(worst, Math.abs(gap - margin) / Math.max(margin, LENGTH * 0.25));
      expect(isPhoto(plan)).toBe(MARGINS.find((m) => m.id === plan.margins[1])!.lengths <= PHOTO_MOST);
    }
    // Within half a length (or a quarter of one, for the closest).
    expect(worst).toBeLessThan(0.5);
  });

  it('is the same race every time for the same name', () => {
    const order = [3, 1, 6, 2, 5, 4];
    const a = planRace(order, STYLES, planSeed('race-abc'));
    const b = planRace(order, STYLES, planSeed('race-abc'));
    expect(a).toEqual(b);
    expect(planRace(order, STYLES, planSeed('race-abd')).finish).not.toEqual(a.finish);
  });

  it('is called from the off to the result, in time order, with the winner named at the post', () => {
    for (const { order, plan } of races.slice(0, 60)) {
      const calls = callsOf(plan);
      expect(calls[0].kind).toBe('off');
      expect(calls[calls.length - 1]).toMatchObject({ kind: 'result', winner: order[0], second: order[1], margin: plan.margins[1] });
      expect(calls.find((call) => call.kind === 'post')).toMatchObject({ winner: order[0], photo: isPhoto(plan) });
      for (let i = 1; i < calls.length; i += 1) expect(calls[i].t).toBeGreaterThanOrEqual(calls[i - 1].t);
      // On the way, a line at least every few seconds, and none before the last has had time to be read.
      const onTheWay = calls.filter((call) => call.kind !== 'post' && call.kind !== 'result');
      expect(onTheWay.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < onTheWay.length; i += 1) expect(onTheWay[i].t - onTheWay[i - 1].t).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(calls.some((call) => call.kind === 'turn' || call.kind === 'home')).toBe(true);
      // The order called at the post is the drawn one, whatever happens as the field is pulled up.
      expect(standingsAt(plan, plan.end)).toEqual(order);
    }
  });
});

describe('the track', () => {
  it('puts the gate on the far straight and the post on the home straight, heading the right way', () => {
    const gate = spotAt(0, 0);
    expect(gate.y).toBeLessThan(100);
    expect(gate.heading).toBe(180);
    const post = spotAt(DISTANCE, 0);
    expect(post.y).toBeGreaterThan(100);
    expect(post.heading).toBe(0);
    // Round the oval once, back to the gate.
    const again = spotAt(LAP, 3);
    const start = spotAt(0, 3);
    expect(again.x).toBeCloseTo(start.x, 9);
    expect(again.y).toBeCloseTo(start.y, 9);
  });

  it('never leaves the picture', () => {
    for (let s = 0; s < LAP; s += 2)
      for (let lane = 0; lane < 6; lane += 1) {
        const { x, y } = spotAt(s, lane);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(360);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(200);
      }
  });
});
