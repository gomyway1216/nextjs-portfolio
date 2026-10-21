// A short, explicit deadline for Firestore reads that feed a cache.
//
// The Admin SDK's own deadline for a query (RunQuery) or a document read
// (BatchGetDocuments) is 300 s, and `Query.get()` / `DocumentReference.get()`
// take no per-call timeout. In production a background cache revalidation
// sat on a dead gRPC connection for 6–10 minutes before failing, keeping the
// function alive the whole time. These reads normally take well under a
// second, so anything past this deadline is treated as a failure.
export const FIRESTORE_READ_DEADLINE_MS = 9_000;

// A deadline timer that fires this much later than it was set for did not
// run on time: the process was paused while the read was pending (a
// serverless function frozen after its response, with the read still in
// flight), or its event loop was blocked. The read itself may not have been
// slow at all, and the message says so.
export const LATE_DEADLINE_MS = 1_000;

export class FirestoreReadTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;
  /** Wall-clock time from the start of the read to the moment the deadline fired. */
  readonly elapsedMs: number;

  constructor(label: string, timeoutMs: number, elapsedMs: number = timeoutMs) {
    const late = elapsedMs - timeoutMs >= LATE_DEADLINE_MS;
    super(
      `[firestore] ${label} did not finish within ${timeoutMs} ms` +
        (late
          ? `; its deadline fired ${elapsedMs} ms after the read started, so the process was paused (or blocked) while the read was pending`
          : ''),
    );
    this.name = 'FirestoreReadTimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
    this.elapsedMs = elapsedMs;
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
  const startedAt = Date.now();
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new FirestoreReadTimeoutError(label, timeoutMs, Date.now() - startedAt)),
      timeoutMs,
    );
  });
  return Promise.race([Promise.resolve(read), deadline]).finally(() => clearTimeout(timer));
}
