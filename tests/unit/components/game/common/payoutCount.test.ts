import { describe, expect, it } from 'vitest';

import { PAYOUT_STEPS, PAYOUT_STEP_MS, countedLeds } from '@/components/game/common/usePayoutCount';

describe('a win counted out on a medal counter', () => {
  it('shows the medals before the win came back, plus what has been counted, and the win in step', () => {
    // 100 medals now, of which 20 came back from a hand that won 10.
    expect(countedLeds(100, 10, { counted: 0, medals: 20 })).toEqual({ medals: 80, won: 0 });
    expect(countedLeds(100, 10, { counted: 5, medals: 20 })).toEqual({ medals: 85, won: 3 });
    expect(countedLeds(100, 10, { counted: 20, medals: 20 })).toEqual({ medals: 100, won: 10 });
    // A counter whose WIN is what came back counts it medal for medal.
    expect(countedLeds(60, 12, { counted: 7, medals: 12 })).toEqual({ medals: 55, won: 7 });
  });

  it('shows the numbers as they are when nothing is being counted, and a push gives back only its stake', () => {
    expect(countedLeds(100, 10, null)).toEqual({ medals: 100, won: 10 });
    expect(countedLeds(100, null, null)).toEqual({ medals: 100, won: null });
    expect(countedLeds(100, 0, { counted: 1, medals: 2 })).toEqual({ medals: 99, won: 0 });
  });

  it('runs at the pace of the floor’s other machines: a medal every 60 ms, and never longer than 2.4 s however big the win', () => {
    expect(PAYOUT_STEP_MS).toBe(60);
    expect(PAYOUT_STEPS * PAYOUT_STEP_MS).toBe(2400);
  });
});
