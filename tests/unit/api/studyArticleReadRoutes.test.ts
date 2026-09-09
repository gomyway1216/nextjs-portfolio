import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getCloudFunctionUrl: vi.fn(),
  getFirestore: vi.fn(),
  getOptionalAdmin: vi.fn(),
  getArticle: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));

vi.mock('@/app/api/constants', () => ({
  getCloudFunctionUrl: mocks.getCloudFunctionUrl,
  STUDY_ARTICLES_COLLECTION: 'study_articles',
  STUDY_READ_HISTORY_COLLECTION: 'study_read_history',
}));

vi.mock('@/app/api/utils/errorLogger', () => ({
  logApiError: vi.fn(),
  logCloudFunctionError: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: mocks.getFirestore,
}));
vi.mock('@/lib/auth-utils', () => ({ getOptionalAdmin: mocks.getOptionalAdmin }));

type StaticRoute = (request: NextRequest) => Promise<Response>;
type ArticleRoute = (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

function request(path: string, authorization?: string): NextRequest {
  return new NextRequest(`https://example.com${path}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('Study article read routes', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getCloudFunctionUrl.mockReset().mockImplementation(
      (name: string) => `https://${name.toLowerCase()}.example/`,
    );
    mocks.getFirestore.mockReset();
    mocks.getOptionalAdmin.mockReset().mockResolvedValue(null);
    mocks.getArticle.mockReset();
    mocks.updateArticle.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it('starts read-history lookup without waiting for the article upstream', async () => {
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const getHistory = vi.fn().mockResolvedValue({ docs: [{ data: () => ({ articleId: 'one' }) }] });
    mocks.getFirestore.mockReturnValue({
      collection: () => ({ where: () => ({ get: getHistory }) }),
    });
    const { GET } = await import('@/app/api/study/articles/route');
    const pending = (GET as StaticRoute)(request('/api/study/articles?userId=owner'));
    expect(getHistory).toHaveBeenCalledTimes(1);
    complete(Response.json({ success: true, articles: [{ id: 'one' }], hasMore: false }));
    const data = await (await pending).json();
    expect(data.articles).toEqual([{ id: 'one' }]);
    expect(data.readArticleIds).toEqual(['one']);
  });

  it('forwards admin authentication when listing drafts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      articles: [],
      hasMore: false,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/study/articles/route');

    await (GET as StaticRoute)(request(
      '/api/study/articles?status=all',
      'Bearer admin-token',
    ));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://getstudyarticles.example/?status=all',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );
  });

  it('keeps anonymous article lists anonymous', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      articles: [],
      hasMore: false,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/study/articles/route');

    await (GET as StaticRoute)(request('/api/study/articles'));

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      headers: {},
    });
  });

  it('preserves server creation-date order when attaching read status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      articles: [
        { id: 'newest-read', createdAt: '2026-09-08T12:00:00.000Z' },
        { id: 'older-unread', createdAt: '2026-09-07T12:00:00.000Z' },
      ],
      hasMore: false,
    }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.getFirestore.mockReturnValue({
      collection: () => ({
        where: () => ({
          get: async () => ({
            docs: [{ data: () => ({ articleId: 'newest-read' }) }],
          }),
        }),
      }),
    });
    const { GET } = await import('@/app/api/study/articles/route');

    const response = await (GET as StaticRoute)(request(
      '/api/study/articles?userId=user-1&readStatus=all&orderBy=createdAt&orderDir=desc',
    ));
    const data = await response.json();

    expect(data.articles.map((article: { id: string }) => article.id)).toEqual([
      'newest-read',
      'older-unread',
    ]);
    expect(data.readArticleIds).toEqual(['newest-read']);
  });

  function articleData(data: Record<string, unknown> | null) {
    mocks.getArticle.mockResolvedValue({
      exists: data !== null, id: 'article-1', data: () => data,
      ref: { update: mocks.updateArticle },
    });
    mocks.getFirestore.mockReturnValue({
      collection: () => ({ doc: () => ({ get: mocks.getArticle }) }),
    });
  }
  async function read(authorization?: string) {
    const { GET } = await import('@/app/api/study/articles/[id]/route');
    return (GET as ArticleRoute)(
      request('/api/study/articles/article-1', authorization),
      { params: Promise.resolve({ id: 'article-1' }) },
    );
  }

  it('reads owner drafts directly without a second serverless request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    articleData({ status: 'draft', content: 'Private content', learningPlay: { version: 1 } });
    mocks.getOptionalAdmin.mockResolvedValue({ uid: 'owner', isAdmin: true });
    const response = await read('Bearer valid-admin');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      success: true, article: { id: 'article-1', content: 'Private content', learningPlay: { version: 1 } },
    });
    expect(mocks.getOptionalAdmin.mock.calls[0][0].headers.get('authorization')).toBe('Bearer valid-admin');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.updateArticle).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer invalid', 'Bearer non-admin'])(
    'hides drafts from callers without verified admin access (%s)', async authorization => {
      articleData({ status: 'draft', content: 'Private content' });
      const response = await read(authorization);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ success: false, error: 'Article not found' });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(mocks.updateArticle).not.toHaveBeenCalled();
    },
  );

  it.each(['draft', 'archived', 'failed', 'published'])(
    'never exposes explicitly private content even with status %s', async status => {
      articleData({ status, isPublic: false, content: 'Private content' });
      expect((await read()).status).toBe(404);
      expect(mocks.updateArticle).not.toHaveBeenCalled();
    },
  );

  it('serves published articles and retains the view counter', async () => {
    articleData({ status: 'published', content: 'Public content', viewCount: 3 });
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ article: { content: 'Public content', viewCount: 3 } });
    expect(mocks.updateArticle).toHaveBeenCalledWith({ viewCount: expect.anything() });
    expect(mocks.getOptionalAdmin).not.toHaveBeenCalled();
  });

  it('returns an indistinguishable missing-article response', async () => {
    articleData(null);
    const response = await read('Bearer valid-admin');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'Article not found' });
  });

  it('fails closed on database errors without leaking details', async () => {
    articleData(null);
    mocks.getArticle.mockRejectedValue(new Error('internal database details'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await read();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: 'Failed to fetch article' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    log.mockRestore();
  });
});
