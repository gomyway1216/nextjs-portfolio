import { describe, expect, it } from 'vitest';

import { PUBLISHED_CAROUSEL } from '@/components/game/CarouselPusher/published';
import { simulate } from '@/components/game/CarouselPusher/sim';

// Best play is the best there is, and nothing brings back more than it takes.
//
// The published best (sim.ts `timed`, lead 0) drops each medal so that a hole passes under the drop spot as it lands.
// Dropping it a beat later, so that it lands after the hole has gone by (lead < 0), finds a hole as often: a hole's
// mouth takes a medal alike over ±12 steps (35.8% of the scatter disc at every lead from −12 to +12). But the
// carousel's angle as it lands changes where a medal that misses slides off the turning deck: more of them go off the
// front edge into the tray, fewer down the side holes (front 0.57 a medal against 0.46, side holes 0.24 against 0.34).
// Measured by QA on seeds 20001–20012, 60,000 medals each, 720,000 a lead: lead −18 (0.3 s late) brings back
// 100.67% ±0.54 and lead −16 100.22% ±0.52, against 90.76% at lead 0. A player who learns the beat brings back more
// than he puts in.
//
// Here the published way and the two worst leads are each played for 5,000 medals on three seeded machines: quick
// enough for every push, and deterministic (the machines are seeded). A lead may not bring back more than the published
// best's high end by more than its own run's 95% margin. A medal's share of the return has a standard deviation of
// about 2.34 (a jackpot throws some 200 medals at once): over 15,000 medals the margin is 1.96 × 2.4 / √15,000, 3.8
// points. A full scan with intervals narrow enough to say whether a lead is over 100% takes 720,000 medals a lead.

const MEDALS = 5_000;
const SEEDS = [20_001, 20_002, 20_003];
/** A medal's share of the return: its standard deviation, measured, rounded up. */
const SPREAD = 2.4;

/** The return of `SEEDS.length` seeded machines played at `lead`, `MEDALS` each, pooled. */
function pooled(lead: number): { back: number; fed: number; each: number[] } {
  let back = 0;
  let fed = 0;
  const each: number[] = [];
  for (const seed of SEEDS) {
    const { tally } = simulate({ strategy: 'timed', lead, medals: MEDALS, seed, warmup: 500 });
    back += tally.back;
    fed += tally.fed;
    each.push(tally.back / tally.fed);
  }
  return { back, fed, each };
}

describe('the moment a medal is dropped', () => {
  const best = PUBLISHED_CAROUSEL.ways.timed;

  for (const lead of [0, -15, -18]) {
    const when = lead === 0 ? 'as a hole passes the drop spot, as published' : `${-lead} steps after a hole has passed the drop spot`;
    it(`brings back no more than the published best play when the medal lands ${when}`, () => {
      const { back, fed, each } = pooled(lead);
      const measured = back / fed;
      const margin = (1.96 * SPREAD) / Math.sqrt(fed);
      const shown = `lead ${lead}: ${(100 * measured).toFixed(2)}% over ${fed.toLocaleString('en-US')} medals (each machine ${each.map((r) => (100 * r).toFixed(1)).join(', ')}%), its margin ±${(100 * margin).toFixed(1)}, against the published best ${(100 * best.return).toFixed(2)}% ±${(100 * best.half).toFixed(2)}`;
      expect(measured - margin, shown).toBeLessThanOrEqual(best.return + best.half);
      expect(measured - margin, shown).toBeLessThan(1);
    }, 120_000);
  }
});
