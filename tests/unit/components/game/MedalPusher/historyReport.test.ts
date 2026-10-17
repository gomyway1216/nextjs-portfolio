import { describe, expect, it } from 'vitest';

import { reportOf } from '@/components/game/MedalPusher/recordsStore';
import type { SessionEvent } from '@/components/game/MedalPusher/session';

// What the record book tells the medal center's history of the medals (MedalCenter/history.ts) about a frame of the
// machine: medals fed and won, the largest prize the frame finished, and its jackpots. It hears it from the book
// because the book is what knows it; the medals themselves go in and come out through the bank.

describe('what a frame of the Medal Pusher tells the medals’ history', () => {
  it('says the medals fed and won, the largest prize finished, and each jackpot', () => {
    const events: SessionEvent[] = [
      { type: 'won', count: 3 },
      { type: 'won', count: 2 },
      { type: 'chestEnd', chest: 1, payout: 30 },
      { type: 'bowlEnd', bowl: 3, hole: 0, payout: 300, poured: 0, total: 380, jackpot: true },
    ];
    expect(reportOf(4, events)).toEqual({ game: 'medal-pusher', fed: 4, won: 5, prize: 380, jackpots: [300] });
  });

  it('says nothing of a frame that fed, won and finished nothing', () => {
    expect(reportOf(0, [])).toBeNull();
    expect(reportOf(0, [{ type: 'lost', count: 2 }])).toBeNull();
    // A machine opened from a save counts nothing it did before (the book's own rule): never below nothing fed.
    expect(reportOf(-3, [{ type: 'won', count: 1 }])).toEqual({ game: 'medal-pusher', fed: 0, won: 1, prize: 0, jackpots: [] });
  });
});
