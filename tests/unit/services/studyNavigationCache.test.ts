import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string; getIdToken: () => Promise<string> } },
}));
vi.mock('@/lib/firebaseConnect', () => ({ auth: mocks.auth }));

function articleResponse(title = 'Original') {
  return Response.json({ success: true, article: { id: 'one', title } });
}

describe('Study navigation data reuse', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.auth.currentUser = null;
    vi.stubGlobal('window', {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares the click-started request with the article page, and reuses the response', async () => {
    let complete!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { getArticle } = await import('@/services/studyService');
    const click = getArticle('one');
    const page = getArticle('one');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    complete(articleResponse());
    expect(await click).toEqual(await page);
    expect(await getArticle('one')).toMatchObject({ title: 'Original' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reuses lists and categories but keeps filters and pagination separate', async () => {
    const fetch = vi.fn(async () => Response.json({ success: true, articles: [], categories: [], hasMore: false }));
    vi.stubGlobal('fetch', fetch);
    const { getArticles, getCategories } = await import('@/services/studyService');
    await getArticles({ listView: true });
    await getArticles({ listView: true });
    await getArticles({ listView: true, categoryId: 'cs' });
    await getArticles({ listView: true, lastId: 'one' });
    await getCategories();
    await getCategories();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('expires responses after 30 seconds', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetch = vi.fn(async () => articleResponse());
    vi.stubGlobal('fetch', fetch);
    const { getArticle } = await import('@/services/studyService');
    await getArticle('one');
    now.mockReturnValue(31_000);
    await getArticle('one');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never reuses private data after sign-out, a viewer change, or token refresh', async () => {
    const getIdToken = vi.fn().mockResolvedValue('token-one');
    mocks.auth.currentUser = { uid: 'owner', getIdToken };
    const fetch = vi.fn(async () => articleResponse());
    vi.stubGlobal('fetch', fetch);
    const { getArticle } = await import('@/services/studyService');
    await getArticle('one');
    getIdToken.mockResolvedValue('token-two');
    await getArticle('one');
    mocks.auth.currentUser = { uid: 'other', getIdToken };
    await getArticle('one');
    mocks.auth.currentUser = null;
    await getArticle('one');
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[3]).toEqual([
      '/api/study/articles/one',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    ]);
  });

  it('does not cache failures, so a private article can be retried', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ success: false, error: 'Article not found' }, { status: 404 }))
      .mockResolvedValueOnce(articleResponse());
    vi.stubGlobal('fetch', fetch);
    const { getArticle } = await import('@/services/studyService');
    await expect(getArticle('one')).rejects.toThrow('Article not found');
    await expect(getArticle('one')).resolves.toMatchObject({ id: 'one' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached data on successful study mutations', async () => {
    const fetch = vi.fn(async () => articleResponse());
    vi.stubGlobal('fetch', fetch);
    const { getArticle, updateArticle } = await import('@/services/studyService');
    await getArticle('one');
    await updateArticle('one', { title: 'Updated' });
    await getArticle('one');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not let a read started before a mutation repopulate the cache', async () => {
    let complete!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }))
      .mockImplementation(async () => articleResponse('Updated'));
    vi.stubGlobal('fetch', fetch);
    const { getArticle, updateArticle } = await import('@/services/studyService');
    const pending = getArticle('one');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await updateArticle('one', { title: 'Updated' });
    complete(articleResponse());
    await pending;
    expect(await getArticle('one')).toMatchObject({ title: 'Updated' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects an in-flight private response after the viewer signs out', async () => {
    mocks.auth.currentUser = { uid: 'owner', getIdToken: async () => 'token' };
    let complete!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { getArticle } = await import('@/services/studyService');
    const pending = getArticle('one');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    mocks.auth.currentUser = null;
    complete(articleResponse());
    await expect(pending).rejects.toThrow('Authentication changed');
  });

  it('does not keep a server-side response cache', async () => {
    vi.stubGlobal('window', undefined);
    const fetch = vi.fn(async () => articleResponse());
    vi.stubGlobal('fetch', fetch);
    const { getArticle } = await import('@/services/studyService');
    await getArticle('one');
    await getArticle('one');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
