import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureAdmin: vi.fn(),
  getOptionalAdmin: vi.fn(),
  getFirestore: vi.fn(),
  getSlugMapSafe: vi.fn(),
}));

vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));

vi.mock('@/lib/auth-utils', () => ({
  ensureAdmin: mocks.ensureAdmin,
  getOptionalAdmin: mocks.getOptionalAdmin,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: mocks.getFirestore,
}));

vi.mock('@/lib/blog/getSlugIndexServer', () => ({
  getSlugMapSafe: mocks.getSlugMapSafe,
}));

vi.mock('@/app/api/utils/errorLogger', () => ({
  logApiError: vi.fn(),
}));

describe('GET /api/post', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('returns a short summary instead of full bodies for public lists', async () => {
    const longBody = `<p>${'A useful sentence. '.repeat(30)}</p>`;
    const timestamp = {
      seconds: 1_700_000_000,
      toDate: () => new Date('2026-01-02T00:00:00.000Z'),
    };
    const docs = [{
      id: 'post-1',
      data: () => ({
        category: 'system-design',
        tags: ['caching'],
        isPublic: true,
        translations: { en: { title: 'Fast routes', body: longBody } },
        created: timestamp,
        lastUpdated: timestamp,
      }),
    }];
    const query = {
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      get: vi.fn().mockResolvedValue({ empty: false, docs }),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mocks.getFirestore.mockReturnValue({ collection: vi.fn(() => query) });
    mocks.getSlugMapSafe.mockResolvedValue(new Map([['post-1', 'fast-routes']]));

    const { GET } = await import('@/app/api/post/route');
    const request = {
      nextUrl: new URL('https://example.com/api/post?isPublic=true&language=en&limit=5'),
    } as never;
    const response = await GET(request, undefined as never) as Response;
    const payload = await response.json();

    expect(payload.posts[0]).toMatchObject({
      id: 'post-1',
      slug: 'fast-routes',
      title: 'Fast routes',
      body: '',
    });
    expect(payload.posts[0].summary.length).toBeLessThanOrEqual(160);
    expect(payload.posts[0].summary).toContain('A useful sentence.');
    expect(payload.posts[0].summary).not.toContain('<p>');
    expect(mocks.ensureAdmin).not.toHaveBeenCalled();
  });
});
