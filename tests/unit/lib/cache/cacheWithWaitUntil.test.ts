import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// cacheWithWaitUntil runs through Next's real unstable_cache, after() and AfterContext, with an in-memory incremental
// cache and a fake platform `waitUntil`. The platform is Vercel's model: once the response is done, the function runs
// only until every promise handed to waitUntil has settled, and is then frozen. So whatever a test needs to have
// happened "behind" a request must be covered by what that request handed to waitUntil.
//
// Next's storage needs the AsyncLocalStorage its server installs globally, so set it before Next loads (everything
// below is imported dynamically, after this line).
const globalWithStorage = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
  __incrementalCache?: unknown;
};
globalWithStorage.AsyncLocalStorage ??= AsyncLocalStorage;

type Wrapper = typeof import('@/lib/cache/cacheWithWaitUntil');
type WorkStorage = typeof import('next/dist/server/app-render/work-async-storage.external');
type WorkUnitStorage = typeof import('next/dist/server/app-render/work-unit-async-storage.external');
type After = typeof import('next/dist/server/after/after-context');
type Revalidation = typeof import('next/dist/server/revalidation-utils');

let cacheWithWaitUntil: Wrapper['cacheWithWaitUntil'];
let workAsyncStorage: WorkStorage['workAsyncStorage'];
let workUnitAsyncStorage: WorkUnitStorage['workUnitAsyncStorage'];
let AfterContext: After['AfterContext'];
let executeRevalidates: Revalidation['executeRevalidates'];

beforeAll(async () => {
  ({ workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external'));
  ({ workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external'));
  ({ AfterContext } = await import('next/dist/server/after/after-context'));
  ({ executeRevalidates } = await import('next/dist/server/revalidation-utils'));
  ({ cacheWithWaitUntil } = await import('@/lib/cache/cacheWithWaitUntil'));
});

// --- A promise the test settles by hand -------------------------------------

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function track(promise: Promise<unknown>) {
  const state = { settled: false };
  void promise.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return state;
}

// Let every pending promise chain run (Next's cache code awaits several times between steps).
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
};

// --- Next's cache, with in-memory storage -------------------------------------

class MemoryIncrementalCache {
  readonly isOnDemandRevalidate = false;
  readonly entries = new Map<string, { body: string; storedAt: number; revalidate: number }>();
  /** While set, a write waits for it: a cache write over the network. */
  writeGate: Promise<void> | null = null;

  async generateSimpleCacheKey(key: string) {
    return key;
  }

  async get(cacheKey: string) {
    const entry = this.entries.get(cacheKey);
    if (!entry) return null;
    return {
      isStale: Date.now() - entry.storedAt >= entry.revalidate * 1000,
      value: { kind: 'FETCH', data: { headers: {}, body: entry.body, status: 200, url: '' } },
    };
  }

  async set(cacheKey: string, data: { data: { body: string }; revalidate: number }) {
    if (this.writeGate) await this.writeGate;
    this.entries.set(cacheKey, { body: data.data.body, storedAt: Date.now(), revalidate: data.revalidate });
  }

  stored(): unknown[] {
    return [...this.entries.values()].map((entry) => JSON.parse(entry.body));
  }
}

let cache: MemoryIncrementalCache;

// --- One request, on the platform --------------------------------------------

type RequestKind = 'rsc' | 'html';

/**
 * Renders `render` as one request. `handed` is everything given to the platform's waitUntil.
 *
 * - `rsc`: an RSC request (a client-side navigation). Next never hands its pending revalidates over.
 * - `html`: an HTML request whose page renders under a loading.tsx boundary. Next hands the pending revalidates over
 *   once, when the shell is ready, which is before the page's cached reads run.
 */
function request<T>(render: () => Promise<T>, kind: RequestKind = 'rsc', waitUntilAvailable = true) {
  const handed: Promise<unknown>[] = [];
  const workStore = {
    route: '/blog',
    incrementalCache: cache,
    isStaticGeneration: false,
    isDraftMode: false,
    isOnDemandRevalidate: false,
    fetchCache: undefined,
    nextFetchId: 1,
    pendingRevalidates: undefined as Record<string, Promise<unknown>> | undefined,
    afterContext: new AfterContext({
      waitUntil: waitUntilAvailable ? (promise: Promise<unknown>) => void handed.push(promise) : undefined,
      onClose: () => {},
      onTaskError: undefined,
    }),
  };
  const requestStore = {
    type: 'request',
    phase: 'render',
    url: { pathname: '/blog', search: '' },
    implicitTags: { tags: [], expirationsByCacheKind: new Map() },
  };
  const result = workAsyncStorage.run(workStore as never, () =>
    workUnitAsyncStorage.run(requestStore as never, async () => {
      if (kind === 'html') {
        // What app-render does once the shell is ready: hand the list as it is now to waitUntil.
        const shell = executeRevalidates(workStore as never);
        if (shell !== false) handed.push(shell);
      }
      return render();
    }),
  );
  return { result, handed, workStore };
}

// --- A cached read -------------------------------------------------------------

let version: number;
let readGate: Promise<void> | null;
const reads = vi.fn(async (name: string) => {
  const answer = { name, version };
  if (readGate) await readGate;
  return answer;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
  cache = new MemoryIncrementalCache();
  version = 1;
  readGate = null;
  reads.mockClear();
  delete globalWithStorage.__incrementalCache;
});

afterEach(() => {
  vi.useRealTimers();
});

async function warm(cached: () => Promise<unknown>) {
  const first = request(cached);
  await first.result;
  await Promise.all(Object.values(first.workStore.pendingRevalidates ?? {}));
  expect(cache.stored()).toEqual([{ name: 'list', version: 1 }]);
}

describe('cacheWithWaitUntil', () => {
  it.each([
    ['an RSC request (Next hands nothing over)', 'rsc'],
    ['an HTML request whose shell was ready before the read (Next handed over an empty list)', 'html'],
  ] as const)(
    "keeps a stale entry's revalidation alive, read and cache write, on %s",
    async (_name, kind) => {
      const cached = cacheWithWaitUntil(() => reads('list'), ['list'], { revalidate: 60 });
      await warm(cached);

      // The entry goes stale and the data changes. The read and the cache write both take a while.
      vi.setSystemTime(Date.now() + 61_000);
      version = 2;
      const read = gate();
      const write = gate();
      readGate = read.opened;
      cache.writeGate = write.opened;

      const second = request(cached, kind);
      // The stale value is served at once...
      expect(await second.result).toEqual({ name: 'list', version: 1 });
      expect(reads).toHaveBeenCalledTimes(2);
      // ...and the revalidation behind it is handed to waitUntil, so the function is not frozen in the middle of it.
      expect(second.handed).toHaveLength(1);
      const keptAlive = track(Promise.all(second.handed));

      read.open();
      await flush();
      expect(keptAlive.settled).toBe(false);
      expect(cache.stored()).toEqual([{ name: 'list', version: 1 }]);

      write.open();
      await Promise.all(second.handed);
      expect(cache.stored()).toEqual([{ name: 'list', version: 2 }]);
    },
  );

  it("keeps a new entry's cache write alive", async () => {
    const cached = cacheWithWaitUntil(() => reads('list'), ['list'], { revalidate: 60 });
    const write = gate();
    cache.writeGate = write.opened;

    const first = request(cached);
    // A missing entry is read in the request; only the write is left behind it.
    expect(await first.result).toEqual({ name: 'list', version: 1 });
    expect(first.handed).toHaveLength(1);
    const keptAlive = track(Promise.all(first.handed));
    await flush();
    expect(keptAlive.settled).toBe(false);
    expect(cache.stored()).toEqual([]);

    write.open();
    await Promise.all(first.handed);
    expect(cache.stored()).toEqual([{ name: 'list', version: 1 }]);
  });

  it('hands each pending promise over once, however many cached reads the request makes', async () => {
    const list = cacheWithWaitUntil(() => reads('list'), ['list'], { revalidate: 60 });
    const other = cacheWithWaitUntil(() => reads('other'), ['other'], { revalidate: 60 });

    const first = request(async () => [await list(), await list(), await other(), await list()]);
    await first.result;
    expect(reads).toHaveBeenCalledTimes(2);
    // The two writes, each once.
    expect(first.handed).toHaveLength(2);
    await Promise.all(first.handed);
  });

  it('passes the cached value and errors through unchanged', async () => {
    const failure = new Error('14 UNAVAILABLE: fake outage');
    const failing = cacheWithWaitUntil(() => Promise.reject(failure), ['failing'], { revalidate: 60 });
    const cached = cacheWithWaitUntil((name: string) => reads(name), ['args'], { revalidate: 60 });

    const first = request(async () => {
      await expect(failing()).rejects.toBe(failure);
      return cached('by-argument');
    });
    expect(await first.result).toEqual({ name: 'by-argument', version: 1 });
  });

  it('works as plain unstable_cache where the platform has no waitUntil', async () => {
    const cached = cacheWithWaitUntil(() => reads('list'), ['list'], { revalidate: 60 });
    const first = request(cached, 'rsc', false);
    expect(await first.result).toEqual({ name: 'list', version: 1 });
    expect(first.handed).toEqual([]);
  });

  it('works as plain unstable_cache outside a request', async () => {
    globalWithStorage.__incrementalCache = cache;
    const cached = cacheWithWaitUntil(() => reads('list'), ['list'], { revalidate: 60 });
    expect(await cached()).toEqual({ name: 'list', version: 1 });
    expect(cache.stored()).toEqual([{ name: 'list', version: 1 }]);
  });
});
