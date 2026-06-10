import type { NextRequest } from 'next/server';

interface RateLimitOptions {
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// Fixed-window, in-memory limiter. State is per serverless instance and
// resets on cold start, so this blunts drive-by spam and accidental
// loops rather than guaranteeing a global ceiling — fine for a
// portfolio; swap for a shared store (e.g. Upstash) if hard limits are
// ever needed.
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function isRateLimited(key: string, { limit, windowMs }: RateLimitOptions): boolean {
  const now = Date.now();

  // Hard cap: evict the oldest entry in O(1) instead of scanning the
  // whole map. Buckets are delete-then-set on reset, so Map insertion
  // order tracks window recency and the first key is the stalest.
  if (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.delete(key);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

/**
 * Best-effort client IP — x-real-ip (set by Vercel's proxy, not client
 * spoofable) first, then the first hop of x-forwarded-for. Matches the
 * extraction order used by withActivityLog.
 */
export function clientIpFrom(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
