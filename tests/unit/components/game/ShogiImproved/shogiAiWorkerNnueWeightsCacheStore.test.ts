/**
 * Weights delivery, first half: a network download is written to Cache Storage.
 *
 * Why this exists. Measured against production on 2026-08-25, three consecutive
 * worker spawns inside one page each re-downloaded the full 94.7MB weights
 * asset and each took ~11.04s to do it. The asset is served
 * `Cache-Control: public, max-age=0, must-revalidate` and at 94.7MB sits far
 * above Chrome's per-entry HTTP disk cache ceiling, so the HTTP cache never
 * retains it — meaning every self-heal respawn of the AI worker paid the whole
 * download again before NNUE could come back. Cache Storage has no such
 * per-entry ceiling, so the worker keeps the accepted body there itself.
 *
 * The matching "a stored body is reused without touching the network" half is
 * shogiAiWorkerNnueWeightsCacheHit.test.ts — a separate file because the worker
 * runs its startup fetch once at module scope and vitest isolates modules per
 * file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const WEIGHTS_URL = '/shogi-halfkp81-production-weights.bin';

const scope = {
  postMessage: () => {},
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal in-memory CacheStorage: keys are the request URLs as given. */
const entries = new Map<string, { arrayBuffer: () => Promise<ArrayBuffer> }>();
const putCalls: string[] = [];
const cache = {
  match: async (key: string) => entries.get(key),
  put: async (key: string, response: { arrayBuffer: () => Promise<ArrayBuffer> }) => {
    putCalls.push(key);
    entries.set(key, response);
  },
  delete: async (key: string) => entries.delete(key),
  keys: async () => [...entries.keys()].map((url) => ({ url })),
};
const openCalls: string[] = [];

let fetchMock: ReturnType<typeof vi.fn>;
let nnue: { isNnueWeightsLoaded: () => boolean };

const weightsFetchCount = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) === WEIGHTS_URL).length;

beforeAll(async () => {
  const weights = readFileSync(join(process.cwd(), 'public', WEIGHTS_URL.slice(1)));
  fetchMock = vi.fn(async (url: unknown) => {
    // The worker also fetches the external opening book at startup; 404 keeps
    // this test focused on weights delivery.
    if (String(url) !== WEIGHTS_URL) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('caches', {
    open: async (name: string) => {
      openCalls.push(name);
      return cache;
    },
  });
  (globalThis as Record<string, unknown>).self = scope;

  const worker = await import('@/components/game/ShogiImproved/shogi-ai.worker');
  void worker; // imported for its side effects (starts the weights fetch)
  nnue = await import('@/components/game/ShogiImproved/wasmEngine');

  for (let i = 0; i < 200 && !nnue.isNnueWeightsLoaded(); i++) await sleep(20);
}, 30_000);

afterAll(() => {
  scope.onmessage?.({ data: { type: 'clearTT' } }); // stop any ponder loop
  delete (globalThis as Record<string, unknown>).self;
  vi.unstubAllGlobals();
});

describe('shogi-ai.worker NNUE weights Cache Storage (store)', () => {
  it('downloads once and keeps the accepted body in Cache Storage', () => {
    expect(nnue.isNnueWeightsLoaded()).toBe(true);
    expect(weightsFetchCount()).toBe(1);
    expect(openCalls).toContain('shogi-nnue-weights-v1');

    // Stored exactly once, under a key that is the weights URL tagged with the
    // build — so a deploy shipping different weights can never be served the
    // stale body, and at most one 94.7MB entry is ever retained.
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].startsWith(`${WEIGHTS_URL}?build=`)).toBe(true);
    expect(entries.size).toBe(1);
  });
});
