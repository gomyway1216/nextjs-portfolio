import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRateLimited } from '@/lib/rateLimit';

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit within a window', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, { limit: 5, windowMs: 60_000 })).toBe(false);
    }
  });

  it('blocks requests beyond the limit within a window', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      isRateLimited(key, { limit: 5, windowMs: 60_000 });
    }
    expect(isRateLimited(key, { limit: 5, windowMs: 60_000 })).toBe(true);
  });

  it('resets after the window elapses', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 6; i++) {
      isRateLimited(key, { limit: 5, windowMs: 60_000 });
    }
    expect(isRateLimited(key, { limit: 5, windowMs: 60_000 })).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(isRateLimited(key, { limit: 5, windowMs: 60_000 })).toBe(false);
  });

  it('tracks keys independently', () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    for (let i = 0; i < 6; i++) {
      isRateLimited(a, { limit: 5, windowMs: 60_000 });
    }
    expect(isRateLimited(a, { limit: 5, windowMs: 60_000 })).toBe(true);
    expect(isRateLimited(b, { limit: 5, windowMs: 60_000 })).toBe(false);
  });
});
