import { describe, expect, it } from 'vitest';
import {
  HeldDirection,
  activeDirection,
  pressDirection,
  releaseDirection,
  repeatCount,
  repeatsBetween,
} from '@/components/game/Tetris/inputRepeat';
import { GAME_CONSTANTS } from '@/components/game/Tetris/types';

const DELAY = 170;
const INTERVAL = 40;

describe('repeatCount', () => {
  it('does not repeat before the delay has elapsed', () => {
    expect(repeatCount(0, DELAY, INTERVAL)).toBe(0);
    expect(repeatCount(DELAY - 1, DELAY, INTERVAL)).toBe(0);
  });

  it('fires the first repeat at the delay, then one per interval', () => {
    expect(repeatCount(DELAY, DELAY, INTERVAL)).toBe(1);
    expect(repeatCount(DELAY + INTERVAL - 1, DELAY, INTERVAL)).toBe(1);
    expect(repeatCount(DELAY + INTERVAL, DELAY, INTERVAL)).toBe(2);
    expect(repeatCount(DELAY + 5 * INTERVAL, DELAY, INTERVAL)).toBe(6);
  });

  it('never loops forever on a zero interval or a bad hold time', () => {
    expect(repeatCount(DELAY + 100, DELAY, 0)).toBe(1);
    expect(repeatCount(Number.NaN, DELAY, INTERVAL)).toBe(0);
  });
});

describe('repeatsBetween', () => {
  const totalOver = (frameMs: number, holdMs: number) => {
    let held = 0;
    let total = 0;
    while (held < holdMs) {
      const next = Math.min(holdMs, held + frameMs);
      total += repeatsBetween(held, next, DELAY, INTERVAL);
      held = next;
    }
    return total;
  };

  it('gives the same number of repeats at 30, 60, 120 and 144 Hz', () => {
    const expected = repeatCount(1000, DELAY, INTERVAL);
    for (const hz of [30, 60, 120, 144]) {
      expect(totalOver(1000 / hz, 1000)).toBe(expected);
    }
  });

  it('catches up with several repeats after one long frame', () => {
    expect(repeatsBetween(0, DELAY + 2 * INTERVAL, DELAY, INTERVAL)).toBe(3);
  });

  it('never goes negative when the hold time is reset', () => {
    expect(repeatsBetween(500, 0, DELAY, INTERVAL)).toBe(0);
  });
});

describe('held directions', () => {
  it('has no active direction when nothing is held', () => {
    expect(activeDirection([])).toBe(0);
  });

  it('the newest press wins, and releasing it falls back to the older one', () => {
    let held: HeldDirection[] = [];
    held = pressDirection(held, 'key-left', -1);
    expect(activeDirection(held)).toBe(-1);
    held = pressDirection(held, 'key-right', 1);
    expect(activeDirection(held)).toBe(1);
    held = releaseDirection(held, 'key-right');
    expect(activeDirection(held)).toBe(-1);
    held = releaseDirection(held, 'key-left');
    expect(activeDirection(held)).toBe(0);
  });

  it('pressing the same source twice keeps a single entry', () => {
    let held = pressDirection([], 'touch-left', -1);
    held = pressDirection(held, 'touch-left', -1);
    expect(held).toHaveLength(1);
  });

  it('releasing a source that is not held changes nothing', () => {
    const held = pressDirection([], 'key-left', -1);
    expect(releaseDirection(held, 'touch-right')).toEqual(held);
  });

  it('does not mutate the list it is given', () => {
    const held = pressDirection([], 'key-left', -1);
    pressDirection(held, 'key-right', 1);
    releaseDirection(held, 'key-left');
    expect(held).toEqual([{ id: 'key-left', dir: -1 }]);
  });
});

describe('repeat timing constants', () => {
  it('can cross the whole board in well under a second', () => {
    const { MOVE_REPEAT_DELAY, MOVE_REPEAT_INTERVAL, MAX_FRAME_DT } = GAME_CONSTANTS;
    expect(MOVE_REPEAT_DELAY).toBeGreaterThan(MOVE_REPEAT_INTERVAL);
    expect(MOVE_REPEAT_DELAY + 8 * MOVE_REPEAT_INTERVAL).toBeLessThan(1000);
    // A clamped frame must still be able to deliver its repeats.
    expect(MAX_FRAME_DT).toBeGreaterThanOrEqual(MOVE_REPEAT_INTERVAL);
  });
});
