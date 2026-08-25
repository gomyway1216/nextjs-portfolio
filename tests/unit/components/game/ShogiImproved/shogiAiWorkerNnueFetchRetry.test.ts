/**
 * Regression test for the 2026-08-25 production incident.
 *
 * The 94.7MB NNUE weights asset returned 503 from the CDN, the worker's
 * one-shot fetch gave up, and every search silently fell back to the
 * hand-crafted V3 evaluation — the shipped NNUE strength never reached a
 * single player, and nothing recorded it.
 *
 * The observed failure was TRANSIENT (the same URL served 200 minutes later
 * from a warm edge cache), so the fix is to retry. This test proves the worker
 * now survives a burst of 503s instead of giving up on the first one.
 *
 * Deliberately serves a small, invalid payload on the successful attempt
 * rather than the real 94.7MB file: the point under test is that the retry
 * REACHES a successful HTTP response, which the terminal status distinguishes
 * unambiguously — 'rejected' means "delivered but not loadable", whereas
 * 'unavailable' (the incident's outcome) means "never delivered at all".
 * Loading the genuine weights is already covered by shogiAiWorkerNnue.test.ts.
 *
 * Separate file from the other NNUE worker tests on purpose — the worker runs
 * its startup fetch once at module scope and vitest isolates modules per file.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type PostedMessage = {
  type: string;
  status?: string;
  attempts?: number;
  elapsedMs?: number;
  httpStatus?: number;
  errorMessage?: string;
};

const WEIGHTS_URL = '/shogi-halfkp81-production-weights.bin';

/** Number of 503s to serve before the request finally succeeds. */
const TRANSIENT_FAILURES = 2;

const posted: PostedMessage[] = [];
const scope = {
  postMessage: (msg: PostedMessage) => posted.push(msg),
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

let fetchMock: ReturnType<typeof vi.fn>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const weightsFetchCount = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) === WEIGHTS_URL).length;
const terminalStatus = () => posted.find((m) => m.type === 'nnueWeightsStatus');

beforeAll(async () => {
  let weightsAttempts = 0;
  fetchMock = vi.fn(async (url: unknown) => {
    if (String(url) !== WEIGHTS_URL) {
      // The worker also fetches the opening book at startup; keep this test
      // focused on weights delivery.
      return { ok: false, status: 404 };
    }
    weightsAttempts++;
    if (weightsAttempts <= TRANSIENT_FAILURES) {
      // Exactly what production returned: a CDN 503 with no body.
      return { ok: false, status: 503 };
    }
    // Delivered successfully — the bytes themselves are not real weights.
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(64) };
  });
  vi.stubGlobal('fetch', fetchMock);
  (globalThis as Record<string, unknown>).self = scope;

  await import('@/components/game/ShogiImproved/shogi-ai.worker');

  // Retries use exponential backoff, so settling takes seconds.
  for (let i = 0; i < 600 && !terminalStatus(); i++) await sleep(25);
}, 30_000);

afterAll(() => {
  scope.onmessage?.({ data: { type: 'clearTT' } }); // stop any ponder loop
  delete (globalThis as Record<string, unknown>).self;
  vi.unstubAllGlobals();
});

describe('shogi-ai.worker NNUE weights delivery retry', () => {
  it('retries past transient 503s instead of giving up on the first one', () => {
    expect(weightsFetchCount()).toBe(TRANSIENT_FAILURES + 1);
  });

  it('reaches a successful response, so delivery is not reported as unavailable', () => {
    const status = terminalStatus();
    expect(status).toBeDefined();
    // 'unavailable' is the incident outcome this fix exists to prevent.
    expect(status!.status).not.toBe('unavailable');
    expect(status!.status).toBe('rejected');
    expect(status!.attempts).toBe(TRANSIENT_FAILURES + 1);
  });
});
