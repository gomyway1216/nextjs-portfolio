import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The blog's cached reads, run through Next's real unstable_cache against a
// fake Firestore whose reads can be made to hang. The cache layer is Next's
// own code; only its storage (the incremental cache) is an in-memory fake,
// and each "request" runs inside Next's request store the way a page render
// does. Next's storage needs the AsyncLocalStorage its server installs
// globally, so set it before Next loads (everything below is imported
// dynamically, after this line).
const globalWithStorage = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
};
globalWithStorage.AsyncLocalStorage ??= AsyncLocalStorage;

const mocks = vi.hoisted(() => ({ getFirestore: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getFirestore: mocks.getFirestore }));

type Slugs = typeof import('@/lib/blog/getSlugIndexServer');
type Posts = typeof import('@/lib/blog/getPostsServer');
type Post = typeof import('@/lib/blog/getPostServer');
type Deadline = typeof import('@/lib/firestoreDeadline');
type WorkStorage = typeof import('next/dist/server/app-render/work-async-storage.external');

let slugs: Slugs;
let posts: Posts;
let post: Post;
let deadline: Deadline;
let workAsyncStorage: WorkStorage['workAsyncStorage'];

beforeAll(async () => {
  ({ workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external'));
  slugs = await import('@/lib/blog/getSlugIndexServer');
  posts = await import('@/lib/blog/getPostsServer');
  post = await import('@/lib/blog/getPostServer');
  deadline = await import('@/lib/firestoreDeadline');
});

// --- Fake Firestore -------------------------------------------------------

type ReadKind = 'slugIndex' | 'postsPage' | 'post';

const firestore = {
  hanging: new Set<ReadKind>(),
  failing: new Set<ReadKind>(),
  reads: { slugIndex: 0, postsPage: 0, post: 0 } as Record<ReadKind, number>,
};

const timestamp = (seconds: number) => ({ seconds, toDate: () => new Date(seconds * 1000) });

const POSTS = [
  {
    id: 'Ab3dEf6hIj9kLm2nOp5q',
    data: {
      isPublic: true,
      category: 'system-design',
      translations: { en: { title: 'Fast Routes', body: '<p>Routes that stay fast.</p>' } },
      created: timestamp(1_700_000_000),
      lastUpdated: timestamp(1_700_000_200),
    },
  },
  {
    id: 'Zy1xWv4uTs7rQp0oNm3l',
    data: {
      isPublic: true,
      category: 'system-design',
      translations: { en: { title: 'Cache Rules', body: '<p>When to cache.</p>' } },
      created: timestamp(1_700_000_000),
      lastUpdated: timestamp(1_700_000_100),
    },
  },
];
const SLUGS = ['fast-routes', 'cache-rules'];
const IDS = POSTS.map((entry) => entry.id);

function read<T>(kind: ReadKind, value: () => T): Promise<T> {
  firestore.reads[kind] += 1;
  // A read on a dead connection: it never settles at all.
  if (firestore.hanging.has(kind)) return new Promise<never>(() => {});
  if (firestore.failing.has(kind)) return Promise.reject(new Error('14 UNAVAILABLE: fake outage'));
  return Promise.resolve(value());
}

function fakeFirestore() {
  return {
    collection: () => {
      // The slug index reads every public post; a posts page is ordered.
      let kind: ReadKind = 'slugIndex';
      const query = {
        where: () => query,
        orderBy: () => {
          kind = 'postsPage';
          return query;
        },
        limit: () => query,
        get: () =>
          read(kind, () => ({
            empty: false,
            size: POSTS.length,
            docs: POSTS.map((entry) => ({ id: entry.id, exists: true, data: () => entry.data })),
          })),
        doc: (id: string) => ({
          get: () =>
            read('post', () => {
              const found = POSTS.find((entry) => entry.id === id);
              return { id, exists: Boolean(found), data: () => found?.data };
            }),
        }),
      };
      return query;
    },
  };
}

// --- Next's cache, with in-memory storage ---------------------------------

interface StoredEntry {
  body: string;
  storedAt: number;
  revalidate: number;
}

class MemoryIncrementalCache {
  readonly isOnDemandRevalidate = false;
  readonly entries = new Map<string, StoredEntry>();

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
    this.entries.set(cacheKey, {
      body: data.data.body,
      storedAt: Date.now(),
      revalidate: data.revalidate,
    });
  }

  /** Stored entries whose key contains `keyPart` (unstable_cache keys embed the keyParts). */
  stored(keyPart: string): StoredEntry[] {
    return [...this.entries].filter(([key]) => key.includes(keyPart)).map(([, entry]) => ({ ...entry }));
  }

  values(keyPart: string): unknown[] {
    return this.stored(keyPart).map((entry) => JSON.parse(entry.body));
  }
}

let cache: MemoryIncrementalCache;

// One page render. `background` is what Next waits for after the response:
// the cache writes and stale-entry revalidations the request started.
function request<T>(render: () => Promise<T>) {
  const workStore = {
    route: '/blog',
    incrementalCache: cache,
    isStaticGeneration: false,
    isDraftMode: false,
    isOnDemandRevalidate: false,
    fetchCache: undefined,
    nextFetchId: 1,
    pendingRevalidates: undefined as Record<string, Promise<unknown>> | undefined,
  };
  const result = workAsyncStorage.run(workStore as never, render);
  return {
    result,
    async background() {
      await result.catch(() => undefined);
      await Promise.all(Object.values(workStore.pendingRevalidates ?? {}));
    },
  };
}

// Settle state of a promise without awaiting it.
function track<T>(promise: Promise<T>) {
  const state = { settled: false };
  promise.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return state;
}

const SLUG_INDEX_KEY = 'blog-slug-index';
const POSTS_PAGE_KEY = 'blog-posts-initial';
const POST_KEY = 'blog-post-detail';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
  cache = new MemoryIncrementalCache();
  firestore.hanging.clear();
  firestore.failing.clear();
  firestore.reads = { slugIndex: 0, postsPage: 0, post: 0 };
  mocks.getFirestore.mockReset();
  mocks.getFirestore.mockImplementation(fakeFirestore);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('blog cached reads with a Firestore read that never settles', () => {
  const reads: Array<[string, ReadKind[], () => Promise<unknown>, string]> = [
    ['the slug index', ['slugIndex'], () => slugs.getSlugIndexCached(), SLUG_INDEX_KEY],
    [
      'a posts page',
      ['postsPage', 'slugIndex'],
      () => posts.getInitialPostsCached('all', 5, 'en'),
      POSTS_PAGE_KEY,
    ],
    ['a single post', ['post'], () => post.getPublicPostCached(IDS[0]), POST_KEY],
  ];

  it.each(reads)('rejects %s at the deadline and caches nothing', async (_name, hang, render, key) => {
    hang.forEach((kind) => firestore.hanging.add(kind));
    const { result, background } = request(render);
    const outcome = result.catch((error: unknown) => error);
    const state = track(outcome);

    await vi.advanceTimersByTimeAsync(deadline.FIRESTORE_READ_DEADLINE_MS - 1);
    expect(state.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(deadline.FirestoreReadTimeoutError);

    await background();
    expect(cache.stored(key)).toEqual([]);
    expect(cache.stored(SLUG_INDEX_KEY)).toEqual([]);
  });
});

describe('a background revalidation that times out', () => {
  const cases: Array<[string, ReadKind, number, () => Promise<unknown>, string]> = [
    ['slug index', 'slugIndex', 300, () => slugs.getSlugIndexCached(), SLUG_INDEX_KEY],
    ['posts page', 'postsPage', 60, () => posts.getInitialPostsCached('all', 5, 'en'), POSTS_PAGE_KEY],
    ['single post', 'post', 300, () => post.getPublicPostCached(IDS[0]), POST_KEY],
  ];

  it.each(cases)('keeps the cached %s', async (_name, kind, revalidateSeconds, render, key) => {
    const first = request(render);
    const good = await first.result;
    await first.background();
    const [storedGood] = cache.stored(key);
    expect(storedGood).toBeDefined();

    // The entry goes stale, then Firestore stops answering.
    await vi.advanceTimersByTimeAsync(revalidateSeconds * 1000 + 1_000);
    firestore.hanging.add(kind);
    const readsBefore = firestore.reads[kind];

    const second = request(render);
    // The stale value is served at once; the revalidation runs behind it.
    expect(await second.result).toEqual(good);
    const revalidation = second.background();
    const state = track(revalidation);
    expect(firestore.reads[kind]).toBe(readsBefore + 1);

    await vi.advanceTimersByTimeAsync(deadline.FIRESTORE_READ_DEADLINE_MS);
    await revalidation;
    expect(state.settled).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`revalidating cache with key`),
      expect.any(deadline.FirestoreReadTimeoutError),
    );

    // Nothing replaced the good entry: not an empty value, not a fallback.
    expect(cache.stored(key)).toEqual([storedGood]);
    const third = request(render);
    expect(await third.result).toEqual(good);
    void third.background();
  });
});

describe('the slug-index fallback', () => {
  it.each([
    ['times out', 'hanging', () => expect.any(deadline.FirestoreReadTimeoutError)],
    ['fails', 'failing', () => expect.objectContaining({ message: '14 UNAVAILABLE: fake outage' })],
  ] as const)('links one request by id when the index read %s, and is never cached into the posts page', async (_name, mode, expectedError) => {
    firestore[mode].add('slugIndex');

    const first = request(() => posts.getInitialPostsCached('all', 5, 'en'));
    const pending = first.result;
    await vi.advanceTimersByTimeAsync(deadline.FIRESTORE_READ_DEADLINE_MS);
    const degraded = await pending;
    await first.background();

    // This request falls back to id URLs...
    expect(degraded.posts.map((entry) => entry.slug)).toEqual(IDS);
    expect(consoleError).toHaveBeenCalledWith(
      '[blog] slug index fetch failed, falling back to id URLs:',
      expectedError(),
    );
    // ...but the cached posts page holds no slugs, and no index was cached.
    const [cachedPage] = cache.values(POSTS_PAGE_KEY) as Array<{ posts: object[] }>;
    expect(cachedPage.posts).toHaveLength(POSTS.length);
    cachedPage.posts.forEach((entry) => expect(entry).not.toHaveProperty('slug'));
    expect(cache.stored(SLUG_INDEX_KEY)).toEqual([]);

    // The index answers again while the posts page is still fresh.
    firestore[mode].delete('slugIndex');
    const second = request(() => posts.getInitialPostsCached('all', 5, 'en'));
    const recovered = await second.result;
    await second.background();

    expect(recovered.posts.map((entry) => entry.slug)).toEqual(SLUGS);
    expect(firestore.reads.postsPage).toBe(1);
  });

  it('reads the slug index from its own cache, not once per posts page', async () => {
    const pages = request(async () => {
      await posts.getInitialPostsCached('all', 5, 'en');
      await posts.getInitialPostsCached('system-design', 5, 'en');
      await posts.getInitialPostsCached('all', 5, 'ja');
    });
    await pages.result;
    await pages.background();

    const again = request(() => posts.getInitialPostsCached('system-design', 6, 'en'));
    expect((await again.result).posts.map((entry) => entry.slug)).toEqual(SLUGS);
    await again.background();

    expect(firestore.reads.postsPage).toBe(4);
    expect(firestore.reads.slugIndex).toBe(1);
  });

  it('reports the fallback to callers that need to know', async () => {
    firestore.hanging.add('slugIndex');
    const degraded = request(() => slugs.getSlugMapResult());
    const pending = degraded.result;
    await vi.advanceTimersByTimeAsync(deadline.FIRESTORE_READ_DEADLINE_MS);
    expect(await pending).toEqual({ slugById: new Map(), complete: false });
    await degraded.background();

    firestore.hanging.delete('slugIndex');
    const healthy = request(() => slugs.getSlugMapResult());
    expect(await healthy.result).toEqual({
      slugById: new Map(IDS.map((id, index) => [id, SLUGS[index]])),
      complete: true,
    });
    await healthy.background();
  });
});
