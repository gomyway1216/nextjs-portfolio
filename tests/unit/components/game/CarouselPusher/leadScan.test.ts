import { describe, expect, it } from 'vitest';

import { COS, DROP, HOLD_MAX, PRESS_TO_DECK, SCATTER, SIN, TURN_STEPS, feed, freshMachine, nextPocketUnderDrop, nextRandom, slideOf, step, type Lottery, type MachineEvent } from '@/components/game/CarouselPusher/engine';

// Best play is the best there is: no moment of dropping a medal brings back more than the published best (sim.ts
// `timed`, lead 0: each medal lands as a hole passes under the drop spot).
//
// How it was found (QA, on the machine as it first shipped): dropping a medal a beat later, so that it lands after the
// hole has gone by (lead < 0), found a hole as often, but the carousel's angle as it landed chose where a medal that
// missed slid off the turning deck. At lead -18 (0.3 s late) more of the misses stayed on the open field and fewer went
// past a side wall into the cabinet: 100.67% ±0.54 on seeds 20001-20012, 720,000 medals, against 90.76% at lead 0.
// Now a miss glances off the deck at a heading its press draws (engine.ts `SHED`): the exact check of that is in
// engine.test.ts, and scripts/carousel-pusher-lead-scan.ts measures every way of choosing the moment end to end.
//
// What a lead can change is in two parts, and each is checked here on its own, quickly and with far less noise than
// the whole return (where a jackpot throws some 200 medals at once):
//
// - the holes: what they pay depends only on how many medals go in, so no lead may catch more than lead 0. That is
//   geometry, worked out over the whole scatter disc at every lead there is;
// - the field: what it gives back of the medals it gets must not depend on the lead. Played with a lottery that pays
//   nothing (so the field gets only the misses, no jackpot's stock), on a seeded machine, its share off the front at
//   leads -9, -15 and -18 must be within 5 points of lead 0's. On the machine as it first shipped they were 10, 14 and
//   17 points above it (51.1% at lead 0, 61.2%, 64.9%, 67.7%); now they are 54.2%, 53.1%, 56.2% and 54.0%.

/** The scatter disc's share that goes into a hole, for a medal landing `lead` steps before a hole passes the drop spot. */
function catchAt(lead: number): number {
  let under = TURN_STEPS;
  while (nextPocketUnderDrop(under).steps !== 0) under++;
  const lands = under - lead;
  const RINGS = 40;
  let caught = 0;
  for (let deg = 0; deg < 360; deg++) {
    for (let i = 0; i < RINGS; i++) {
      // Every spot of the disc as likely: equal areas, ring by ring.
      const r = SCATTER * Math.sqrt((i + 0.5) / RINGS);
      if (slideOf(DROP.x + r * COS[deg], DROP.y + r * SIN[deg], lands, 0.5).pocket >= 0) caught++;
    }
  }
  return caught / (360 * RINGS);
}

const MEDALS = 900;
const WARMUP = 150;
const SEED = 20_001;
/** A lottery that never pays: the field gets the misses alone. */
const QUIET: Lottery = { spinFrom: (_ticket, at) => ({ outcome: 4, digits: [1, 2, 3], from: at, stops: [0, 0, 0], at }), prize: () => 0 };

/** The share of the medals leaving the field that go off the front into the tray, every hole timed at `lead`. */
function fieldShare(lead: number): number {
  const m = freshMachine(SEED);
  const draw = { rng: (SEED * 2654435761) | 0 };
  const events: MachineEvent[] = [];
  let fed = 0;
  let front = 0;
  let side = 0;
  for (let guard = 0; guard < (WARMUP + MEDALS) * 400 && fed < WARMUP + MEDALS; guard++) {
    if (m.holds < HOLD_MAX && m.slotAt <= m.step && nextPocketUnderDrop(m.step + PRESS_TO_DECK + lead).steps === 0) {
      feed(m, nextRandom(draw), nextRandom(draw), nextRandom(draw), nextRandom(draw), events);
      fed++;
    }
    step(m, QUIET, events);
    for (const e of events) {
      if (fed <= WARMUP) continue;
      if (e.type === 'won') front += e.count;
      else if (e.type === 'lost') side += e.count;
    }
    events.length = 0;
  }
  return front / (front + side);
}

let atTheMoment: number | null = null;
const shareAtTheMoment = (): number => (atTheMoment ??= fieldShare(0));

describe('the moment a medal is dropped', () => {
  it('catches no more medals in the holes at any lead than as a hole passes the drop spot, as published', () => {
    const best = catchAt(0);
    expect(best).toBeGreaterThan(0.35);
    // Within ±12 steps the holes catch all but alike (the disc and the hole are worked out to the whole degree): no lead
    // catches more by a fifth of a point, worth a quarter of a point of return.
    for (let lead = -60; lead <= 60; lead++) expect(catchAt(lead), `lead ${lead}`).toBeLessThanOrEqual(best + 0.002);
  });

  it('gives back about half of what the field gets, off the front, when every hole is timed as published', () => {
    const share = shareAtTheMoment();
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.65);
  }, 20_000);

  for (const lead of [-9, -15, -18]) {
    it(`leaves what the field gives back alone when the medal lands ${-lead} steps after a hole has passed the drop spot`, () => {
      const atLead = fieldShare(lead);
      const published = shareAtTheMoment();
      expect(Math.abs(atLead - published), `lead ${lead}: ${(100 * atLead).toFixed(1)}% off the front, against ${(100 * published).toFixed(1)}% at lead 0`).toBeLessThanOrEqual(0.05);
    }, 20_000);
  }
});
