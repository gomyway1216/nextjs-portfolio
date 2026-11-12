import { describe, expect, it } from 'vitest';

import { getBanditStrings } from '@/components/game/Bandit/i18n';
import {
  DEFAULT_PULL_LIMIT,
  MAX_PULL_LIMIT,
  MIN_PULL_LIMIT,
  clampPullLimit,
  isLivePullLimit,
  pullProgress,
  settlePullLimit,
} from '@/components/game/Bandit/playHelpers';

describe('Bandit pull limit', () => {
  it('keeps a typed limit inside the field range', () => {
    expect(clampPullLimit(50, 0)).toBe(50);
    expect(clampPullLimit(3, 0)).toBe(MIN_PULL_LIMIT);
    expect(clampPullLimit(9999, 0)).toBe(MAX_PULL_LIMIT);
    expect(clampPullLimit(72.6, 0)).toBe(73);
  });

  it('falls back to the default for an empty or meaningless value', () => {
    expect(clampPullLimit(Number.NaN, 0)).toBe(DEFAULT_PULL_LIMIT);
    expect(clampPullLimit(0, 0)).toBe(DEFAULT_PULL_LIMIT);
    expect(clampPullLimit(-5, 0)).toBe(DEFAULT_PULL_LIMIT);
  });

  it('never goes below the pulls already made', () => {
    // 12 pulls made, limit lowered to 10: the game ends on its 12 pulls.
    expect(clampPullLimit(10, 12)).toBe(12);
    expect(clampPullLimit(12, 12)).toBe(12);
    expect(clampPullLimit(30, 12)).toBe(30);
    // An emptied field falls back to the default, still not below the pulls made.
    expect(clampPullLimit(Number.NaN, 80)).toBe(80);
    expect(clampPullLimit(10, MAX_PULL_LIMIT)).toBe(MAX_PULL_LIMIT);
  });

  it('reports progress that is never negative and never past the end', () => {
    expect(pullProgress(0, 50)).toEqual({ remaining: 50, fraction: 0 });
    expect(pullProgress(20, 50)).toEqual({ remaining: 30, fraction: 0.4 });
    expect(pullProgress(50, 50)).toEqual({ remaining: 0, fraction: 1 });
    expect(pullProgress(12, 10)).toEqual({ remaining: 0, fraction: 1 });
    expect(pullProgress(-1, 10)).toEqual({ remaining: 10, fraction: 0 });
    expect(pullProgress(3, 0)).toEqual({ remaining: 0, fraction: 1 });
  });
});

describe('Bandit pull limit while typing', () => {
  it('takes effect at once only for a whole limit in range that keeps the game going', () => {
    expect(isLivePullLimit('30', 12)).toBe(true);
    expect(isLivePullLimit('500', 0)).toBe(true);
    expect(isLivePullLimit('10', 0)).toBe(true);
    // On the way to "30", or emptied.
    expect(isLivePullLimit('3', 0)).toBe(false);
    expect(isLivePullLimit('', 0)).toBe(false);
    expect(isLivePullLimit('1e2', 0)).toBe(false);
    expect(isLivePullLimit('12.5', 0)).toBe(false);
    expect(isLivePullLimit('501', 0)).toBe(false);
    // Would end the game: waits for the field to be left.
    expect(isLivePullLimit('10', 12)).toBe(false);
    expect(isLivePullLimit('12', 12)).toBe(false);
  });

  it('settles on the clamped limit, or keeps the current one when nothing usable was typed', () => {
    expect(settlePullLimit('30', 12, 50)).toBe(30);
    expect(settlePullLimit('10', 12, 50)).toBe(12);
    expect(settlePullLimit('3', 0, 50)).toBe(MIN_PULL_LIMIT);
    expect(settlePullLimit('9999', 0, 50)).toBe(MAX_PULL_LIMIT);
    expect(settlePullLimit('', 12, 50)).toBe(50);
    expect(settlePullLimit('   ', 12, 80)).toBe(80);
    expect(settlePullLimit('0', 12, 80)).toBe(80);
    expect(settlePullLimit('-4', 12, 80)).toBe(80);
  });
});

describe('Bandit finish banner strings', () => {
  it('has no Japanese punctuation in English', () => {
    const en = getBanditStrings('en');
    const lines = [en.finished, en.finishedDetail(4, 12, '33.3'), en.trueProbsAre, en.bestArmExpected('3.8'), en.yourRegret('0.16')];
    for (const line of lines) expect(line).not.toMatch(/[　-ヿ＀-￯]/);
  });
});
