import { describe, expect, it } from 'vitest';

import { HOLD_MAX, PRESS_TO_DECK, feed, freshMachine, nextPocketUnderDrop, slotFree, step } from '@/components/game/CarouselPusher/engine';
import { LOTTERY, ticketFor } from '@/components/game/CarouselPusher/lottery';
import { statusLine } from '@/components/game/CarouselPusher/PlayTab';

// The status line under the counter. With four spins waiting, a medal into a hole starts nothing (止め打ち), and the
// line says so: whether or not the counter is rolling, which with four waiting it nearly always is.

const at = { throwing: false, rolling: false, reach: false, idleOut: false, holds: 0, credit: 5 };

describe('the status line', () => {
  it('says four spins wait while the counter rolls, as it nearly always does then', () => {
    // Medals timed to the holes until four spins wait: most of that time a spin is rolling.
    const m = freshMachine(1);
    let full = 0;
    let rolling = 0;
    for (let i = 0, fed = 0; i < 20_000; i++) {
      if (fed < 200 && slotFree(m) && nextPocketUnderDrop(m.step + PRESS_TO_DECK).steps === 0) {
        feed(m, 0.5, 0, ticketFor('miss'), 0.5);
        fed += 1;
      }
      step(m, LOTTERY);
      if (m.holds < HOLD_MAX) continue;
      full += 1;
      if (m.spin) rolling += 1;
    }
    expect(full).toBeGreaterThan(1_000);
    expect(rolling / full).toBeGreaterThan(0.8);
    // So the line says it while the counter rolls, not only in the moments between two spins.
    expect(statusLine({ ...at, rolling: true, holds: HOLD_MAX })).toBe('full');
    expect(statusLine({ ...at, rolling: false, holds: HOLD_MAX })).toBe('full');
  });

  it('keeps the rest in their order: the dish throwing, a reach, four waiting, rolling, out of medals, an empty slot, ready', () => {
    expect(statusLine({ ...at, throwing: true, rolling: true, reach: true, holds: HOLD_MAX })).toBe('throwing');
    expect(statusLine({ ...at, rolling: true, reach: true, holds: HOLD_MAX })).toBe('reach');
    expect(statusLine({ ...at, rolling: true, holds: HOLD_MAX - 1 })).toBe('spinning');
    expect(statusLine({ ...at, idleOut: true, credit: 0 })).toBe('out');
    expect(statusLine({ ...at, credit: 0 })).toBe('empty');
    expect(statusLine(at)).toBe('ready');
  });
});
