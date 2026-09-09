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

  it('still serves the article when the view-counter write fails', async () => {
    articleData({ status: 'published', content: 'Public content' });
    mocks.updateArticle.mockRejectedValue(new Error('temporary contention'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ article: { content: 'Public content' } });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
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
