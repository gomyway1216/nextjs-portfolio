// A short, explicit deadline for Firestore reads that feed a cache.
//
// The Admin SDK's own deadline for a query (RunQuery) or a document read
// (BatchGetDocuments) is 300 s, and `Query.get()` / `DocumentReference.get()`
// take no per-call timeout. In production a background cache revalidation
// sat on a dead gRPC connection for 6–10 minutes before failing, keeping the
// function alive the whole time. These reads normally take well under a
// second, so anything past this deadline is treated as a failure.
export const FIRESTORE_READ_DEADLINE_MS = 9_000;

export class FirestoreReadTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`[firestore] ${label} did not finish within ${timeoutMs} ms`);
    this.name = 'FirestoreReadTimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Settle with `read`, or reject with FirestoreReadTimeoutError once
 * `timeoutMs` passes, whichever comes first.
 *
 * It rejects instead of resolving with an empty value on purpose: inside
 * `unstable_cache` a rejection keeps the last good entry (a background
 * revalidation logs and keeps the stale value; a cold miss caches
 * nothing), whereas an empty result would be cached as if it were real.
 *
 * The underlying RPC is not cancelled (the SDK offers no way to), but its
 * result is ignored and the timer is always cleared, so nothing waits on it.
 */
export function withReadDeadline<T>(
  read: PromiseLike<T>,
  label: string,
  timeoutMs: number = FIRESTORE_READ_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FirestoreReadTimeoutError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([Promise.resolve(read), deadline]).finally(() => clearTimeout(timer));
}
