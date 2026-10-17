import { describe, expect, it } from 'vitest';

import { resolveRoll } from '@/components/game/Craps/engine';
import { fanfareOf } from '@/components/game/Craps/PlayTab';
import { getStrings } from '@/components/game/Craps/i18n';

describe('how a roll sounds as the dice land', () => {
  it('is silent when nothing won, a loss included, as on the machines', () => {
    expect(fanfareOf(resolveRoll(null, {}, [3, 4]))).toBeNull();
    expect(fanfareOf(resolveRoll(null, { pass: 5 }, [1, 1]))).toBeNull();
    expect(fanfareOf(resolveRoll(6, { pass: 5 }, [3, 4]))).toBeNull();
    // A roll that decides nothing.
    expect(fanfareOf(resolveRoll(6, { pass: 5 }, [2, 3]))).toBeNull();
  });

  it('plays the fanfare for a win, and the big one for a proposition that pays 15 to 1 or more', () => {
    expect(fanfareOf(resolveRoll(null, { pass: 5 }, [3, 4]))).toBe('win');
    expect(fanfareOf(resolveRoll(6, { pass: 5 }, [2, 4]))).toBe('win');
    // The hard ways (7 and 9 to 1) and Any Craps (7 to 1) are wins, not big ones.
    expect(fanfareOf(resolveRoll(6, { hard6: 1 }, [3, 3]))).toBe('win');
    expect(fanfareOf(resolveRoll(null, { anyCraps: 1 }, [1, 2]))).toBe('win');
    // Yo (15 to 1) and Twelve (30 to 1) are big, whatever else lost on the roll.
    expect(fanfareOf(resolveRoll(null, { yo: 1, dontPass: 5 }, [5, 6]))).toBe('big');
    expect(fanfareOf(resolveRoll(null, { twelve: 1, pass: 5 }, [6, 6]))).toBe('big');
  });
});

describe('the keys line', () => {
  it('names the table’s keys in both languages', () => {
    expect(getStrings('en').keysHint).toBe('Keys: Space or Enter rolls · R repeat bets · U undo');
    expect(getStrings('ja').keysHint).toBe('キー：Space か Enter でロール・R で前回と同じ賭け・U で取り消し');
  });
});
