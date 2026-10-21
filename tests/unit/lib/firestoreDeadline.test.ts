import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRESTORE_READ_DEADLINE_MS,
  FirestoreReadTimeoutError,
  LATE_DEADLINE_MS,
  withReadDeadline,
} from '@/lib/firestoreDeadline';

describe('withReadDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the deadline in the 8–10 s range', () => {
    expect(FIRESTORE_READ_DEADLINE_MS).toBeGreaterThanOrEqual(8_000);
    expect(FIRESTORE_READ_DEADLINE_MS).toBeLessThanOrEqual(10_000);
  });

  it('resolves with the read and clears its timer', async () => {
    await expect(withReadDeadline(Promise.resolve('value'), 'read')).resolves.toBe('value');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a failed read through unchanged and clears its timer', async () => {
    const failure = new Error('4 DEADLINE_EXCEEDED');
    await expect(withReadDeadline(Promise.reject(failure), 'read')).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a read that never settles once the deadline passes, not before', async () => {
    const outcome = withReadDeadline(new Promise<never>(() => {}), 'blog slug index query').then(
      () => 'resolved',
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(FIRESTORE_READ_DEADLINE_MS - 1);
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(FirestoreReadTimeoutError);
    expect(error).toMatchObject({
      label: 'blog slug index query',
      timeoutMs: FIRESTORE_READ_DEADLINE_MS,
      message: `[firestore] blog slug index query did not finish within ${FIRESTORE_READ_DEADLINE_MS} ms`,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a read that settles after the deadline', async () => {
    let finishLate!: (value: string) => void;
    const late = new Promise<string>((resolve) => {
      finishLate = resolve;
    });
    const outcome = withReadDeadline(late, 'read', 50).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(50);
    finishLate('too late');
    await expect(outcome).resolves.toBeInstanceOf(FirestoreReadTimeoutError);
  });

  it('says so when the deadline fired late because the process was paused', async () => {
    const outcome = withReadDeadline(new Promise<never>(() => {}), 'blog slug index query').catch(
      (error: unknown) => error,
    );

    // A function frozen after its response, then thawed by another request a minute later: the clock has moved on,
    // and the overdue timer fires first thing.
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(FIRESTORE_READ_DEADLINE_MS);

    const error = await outcome;
    expect(error).toBeInstanceOf(FirestoreReadTimeoutError);
    expect(error).toMatchObject({
      timeoutMs: FIRESTORE_READ_DEADLINE_MS,
      elapsedMs: 60_000 + FIRESTORE_READ_DEADLINE_MS,
      message:
        `[firestore] blog slug index query did not finish within ${FIRESTORE_READ_DEADLINE_MS} ms; ` +
        `its deadline fired ${60_000 + FIRESTORE_READ_DEADLINE_MS} ms after the read started, ` +
        'so the process was paused (or blocked) while the read was pending',
    });
  });

  it('keeps the plain message for a deadline that fired less than a second late', async () => {
    const outcome = withReadDeadline(new Promise<never>(() => {}), 'read', 50).catch((error: unknown) => error);
    vi.setSystemTime(Date.now() + LATE_DEADLINE_MS - 1);
    await vi.advanceTimersByTimeAsync(50);
    expect(await outcome).toMatchObject({
      elapsedMs: 50 + LATE_DEADLINE_MS - 1,
      message: '[firestore] read did not finish within 50 ms',
    });
  });
});
