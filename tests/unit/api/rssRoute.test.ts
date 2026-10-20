import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRESTORE_READ_DEADLINE_MS } from '@/lib/firestoreDeadline';

const mocks = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  getSlugMapResult: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({ getFirestore: mocks.getFirestore }));
vi.mock('@/lib/blog/getSlugIndexServer', () => ({ getSlugMapResult: mocks.getSlugMapResult }));

const POST_ID = 'Ab3dEf6hIj9kLm2nOp5q';

function firestoreWith(get: () => Promise<unknown>) {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get,
  };
  return { collection: () => query };
}

const snapshot = {
  docs: [{
    id: POST_ID,
    data: () => ({
      category: 'system-design',
      translations: { en: { title: 'Fast Routes', body: '<p>Routes that stay fast.</p>' } },
      created: '2026-10-01T00:00:00.000Z',
      lastUpdated: '2026-10-02T00:00:00.000Z',
    }),
  }],
};

describe('GET /rss.xml', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.useRealTimers();
  });

  it('links by slug and lets the CDN cache the feed', async () => {
    mocks.getFirestore.mockReturnValue(firestoreWith(() => Promise.resolve(snapshot)));
    mocks.getSlugMapResult.mockResolvedValue({
      slugById: new Map([[POST_ID, 'fast-routes']]),
      complete: true,
    });
    const { GET } = await import('@/app/rss.xml/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(await response.text()).toContain('<link>https://www.meetyudai.com/blog/system-design/fast-routes</link>');
  });

  it('serves an id-linked feed once without letting the CDN cache it', async () => {
    mocks.getFirestore.mockReturnValue(firestoreWith(() => Promise.resolve(snapshot)));
    mocks.getSlugMapResult.mockResolvedValue({ slugById: new Map(), complete: false });
    const { GET } = await import('@/app/rss.xml/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toContain(`<link>https://www.meetyudai.com/blog/system-design/${POST_ID}</link>`);
  });

  it('answers 503 at the read deadline when the posts query never settles', async () => {
    vi.useFakeTimers();
    mocks.getFirestore.mockReturnValue(firestoreWith(() => new Promise<never>(() => {})));
    mocks.getSlugMapResult.mockResolvedValue({ slugById: new Map(), complete: true });
    const { GET } = await import('@/app/rss.xml/route');

    const pending = GET();
    await vi.advanceTimersByTimeAsync(FIRESTORE_READ_DEADLINE_MS);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith('[rss] feed generation failed:', expect.any(Error));
  });
});
