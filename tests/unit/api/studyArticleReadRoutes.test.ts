import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getCloudFunctionUrl: vi.fn(),
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
  getFirestore: vi.fn(),
}));

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
    vi.unstubAllGlobals();
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

  it('forwards admin authentication when reading a private article', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      article: { id: 'draft-1', status: 'draft' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/study/articles/[id]/route');

    await (GET as ArticleRoute)(
      request('/api/study/articles/draft-1', 'Bearer admin-token'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://getstudyarticle.example/?id=draft-1',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );
  });

  it('keeps anonymous single-article reads anonymous', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: false,
      error: 'Article not found',
    }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/study/articles/[id]/route');

    await (GET as ArticleRoute)(
      request('/api/study/articles/draft-1'),
      { params: Promise.resolve({ id: 'draft-1' }) },
    );

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      headers: {},
    });
  });
});
