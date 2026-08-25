/**
 * Weights delivery, second half: a body already in Cache Storage is loaded
 * without touching the network.
 *
 * This is the property that stops a respawned AI worker from re-downloading
 * 94.7MB. Before it existed, every self-heal respawn paid ~11.04s of download
 * (measured on production, 2026-08-25) before NNUE was available again, so a
 * single transient worker failure could cost a whole session its evaluation
 * quality. See shogiAiWorkerNnueWeightsCacheStore.test.ts for the storing half.
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

const entries = new Map<string, { arrayBuffer: () => Promise<ArrayBuffer> }>();
const cache = {
  match: async (key: string) => entries.get(key),
  put: async (key: string, response: { arrayBuffer: () => Promise<ArrayBuffer> }) => {
    entries.set(key, response);
  },
  delete: async (key: string) => entries.delete(key),
  keys: async () => [...entries.keys()].map((url) => ({ url })),
};

let fetchMock: ReturnType<typeof vi.fn>;
let nnue: { isNnueWeightsLoaded: () => boolean };

const weightsFetchCount = () =>
  fetchMock.mock.calls.filter((call) => String(call[0]) === WEIGHTS_URL).length;

beforeAll(async () => {
  const weights = readFileSync(join(process.cwd(), 'public', WEIGHTS_URL.slice(1)));
  const body = weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength);
  // Pre-populate the cache exactly as a previous worker instance would have,
  // under the same build tag this build uses.
  const build = process.env.NEXT_PUBLIC_APP_BUILD_SHA || 'dev';
  entries.set(`${WEIGHTS_URL}?build=${encodeURIComponent(build)}`, {
    arrayBuffer: async () => body,
  });

  fetchMock = vi.fn(async (url: unknown) => {
    if (String(url) !== WEIGHTS_URL) return { ok: false, status: 404 };
    // Reaching here means the cache was ignored; fail loudly rather than
    // silently passing on a successful re-download.
    throw new Error('weights were re-downloaded despite a valid Cache Storage entry');
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('caches', { open: async () => cache });
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

describe('shogi-ai.worker NNUE weights Cache Storage (hit)', () => {
  it('loads the cached body and never fetches the 94.7MB asset', () => {
    expect(nnue.isNnueWeightsLoaded()).toBe(true);
    expect(weightsFetchCount()).toBe(0);
  });
});
