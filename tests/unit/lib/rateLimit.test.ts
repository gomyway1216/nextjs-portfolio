import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';

function requestWithHeaders(headers: Record<string, string | null>) {
  return {
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  };
}

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

  it('extracts client IP from trusted proxy headers', () => {
    expect(clientIpFrom(requestWithHeaders({ 'x-real-ip': '203.0.113.10' }) as never)).toBe('203.0.113.10');
    expect(clientIpFrom(requestWithHeaders({ 'x-forwarded-for': '198.51.100.1, 198.51.100.2' }) as never)).toBe('198.51.100.1');
    expect(clientIpFrom(requestWithHeaders({}) as never)).toBe('unknown');
  });
});
