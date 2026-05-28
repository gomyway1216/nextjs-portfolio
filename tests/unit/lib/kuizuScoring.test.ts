import { describe, expect, it } from 'vitest';
import { calculatePoints, getStreakMultiplier } from '@/lib/kuizuScoring';

describe('kuizuScoring', () => {
  it('caps streak multiplier at the highest configured tier', () => {
    expect(getStreakMultiplier(0)).toBe(1);
    expect(getStreakMultiplier(2)).toBe(1.2);
    expect(getStreakMultiplier(3)).toBe(1.5);
    expect(getStreakMultiplier(4)).toBe(2);
    expect(getStreakMultiplier(99)).toBe(2);
  });

  it('returns zero points for an incorrect answer', () => {
    expect(calculatePoints(false, 100, 1000, 4)).toBe(0);
  });

  it('adds time bonus and streak multiplier for correct answers', () => {
    expect(calculatePoints(true, 0, 1000, 0)).toBe(1500);
    expect(calculatePoints(true, 500, 1000, 2)).toBe(1500);
  });

  it('does not award negative time bonus when answer time exceeds limit', () => {
    expect(calculatePoints(true, 2000, 1000, 0)).toBe(1000);
  });
});
