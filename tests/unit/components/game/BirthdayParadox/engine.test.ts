import { describe, expect, it } from 'vitest';
import {
  dayLabel,
  findFirstCollision,
  generateBirthdays,
  hasCollision,
  theoreticalMatchProb,
} from '@/components/game/BirthdayParadox/engine';

describe('BirthdayParadox engine', () => {
  it('calculates known birthday collision probabilities', () => {
    expect(theoreticalMatchProb(1)).toBe(0);
    expect(theoreticalMatchProb(23)).toBeCloseTo(0.5073, 3);
    expect(theoreticalMatchProb(366)).toBe(1);
  });

  it('generates birthdays with injected rng', () => {
    const values = [0, 0.5, 0.999];
    const rng = () => values.shift() ?? 0;

    expect(generateBirthdays(3, rng)).toEqual([0, 182, 364]);
  });

  it('finds the first repeated day and labels calendar days', () => {
    expect(findFirstCollision([10, 20, 10, 20])).toEqual({ day: 10, indices: [0, 2] });
    expect(hasCollision([1, 2, 3])).toBe(false);
    expect(dayLabel(0)).toBe('1/1');
    expect(dayLabel(364)).toBe('12/31');
    expect(dayLabel(365)).toBe('?');
  });
});
