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

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

/** Best-effort client IP — first hop of x-forwarded-for (set by Vercel). */
export function clientIpFrom(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
