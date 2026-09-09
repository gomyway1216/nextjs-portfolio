import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({ getFirestore: vi.fn(), verifyIdToken: vi.fn(), isAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/withActivityLog', () => ({ withActivityLog: (_name: string, fn: unknown) => fn }));
vi.mock('@/lib/firebase-admin', () => ({ getFirestore: mocks.getFirestore }));
vi.mock('@/lib/auth-utils', () => ({ verifyIdToken: mocks.verifyIdToken, isAdmin: mocks.isAdmin }));
vi.mock('@/app/api/utils/errorLogger', () => ({ logApiError: vi.fn(), logCloudFunctionError: vi.fn() }));
vi.mock('@/app/api/constants', () => ({
  getCloudFunctionUrl: vi.fn(), STUDY_ARTICLES_COLLECTION: 'articles', STUDY_READ_HISTORY_COLLECTION: 'history',
}));
import { GET } from '@/app/api/study/articles/route';

const query = { where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), select: vi.fn(), startAfter: vi.fn(), get: vi.fn(), doc: vi.fn() };
const history = { where: vi.fn(), get: vi.fn() };
const cursor = { get: vi.fn() };
const collection = vi.fn();
const doc = (id: string, data: Record<string, unknown> = {}) => ({ id, data: () => ({ title: id, status: 'published', ...data }) });
async function read(params = '', token?: string) {
  const handler = GET as (request: NextRequest) => Promise<Response>;
  return handler(new NextRequest(`https://example.com/api/study/articles?${params}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  }));
}
beforeEach(() => {
  vi.resetAllMocks();
  for (const method of ['where', 'orderBy', 'limit', 'select', 'startAfter'] as const) query[method].mockReturnValue(query);
  query.get.mockResolvedValue({ docs: [] }); query.doc.mockReturnValue(cursor);
  cursor.get.mockResolvedValue({ exists: false });
  history.where.mockReturnValue(history); history.get.mockResolvedValue({ docs: [] });
  collection.mockImplementation(name => name === 'articles' ? query : history);
  mocks.getFirestore.mockReturnValue({ collection });
  mocks.verifyIdToken.mockResolvedValue(null); mocks.isAdmin.mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('direct server-side study article listing', () => {
  it('reads cards directly from Firestore without the second serverless hop', async () => {
    query.get.mockResolvedValue({ docs: [doc('one', {
      content: 'Full body stays out of the list', createdAt: Timestamp.fromDate(new Date('2026-09-08T12:00:00Z')),
      publishedAt: Timestamp.fromDate(new Date('2026-09-09T12:00:00Z')), learningPlay: { secret: 'not a card field' },
    })] });
    const response = await read('listView=true');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const data = await response.json();
    expect(data.articles).toEqual([{
      id: 'one', title: 'one', status: 'published', createdAt: '2026-09-08T12:00:00.000Z',
      publishedAt: '2026-09-09T12:00:00.000Z', language: 'en', tags: [], quizIds: [], keyTakeaways: [],
    }]);
    expect(query.select).toHaveBeenCalledOnce();
    expect(query.select.mock.calls[0]).toContain('isPublic');
    expect(query.select.mock.calls[0]).not.toContain('content');
    expect(query.get).toHaveBeenCalledOnce();
    expect(query.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, 'invalid', 'non-admin'])('forces published status for an unprivileged caller (%s)', async token => {
    if (token === 'non-admin') mocks.verifyIdToken.mockResolvedValue({ uid: 'reader' });
    await read('status=all', token);
    expect(query.where).toHaveBeenCalledWith('status', '==', 'published');
  });
  it('verifies the bearer once and permits admins to view drafts', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'owner', admin: true }); mocks.isAdmin.mockReturnValue(true);
    query.get.mockResolvedValue({ docs: [doc('draft', { status: 'draft', isPublic: false, content: 'owner content' })] });
    const response = await read('status=all', 'owner-token');
    expect(mocks.verifyIdToken).toHaveBeenCalledExactlyOnceWith('owner-token');
    expect(query.where).not.toHaveBeenCalledWith('status', expect.anything(), expect.anything());
    expect((await response.json()).articles[0].content).toBe('owner content');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('allows an admin to narrow the status rather than returning every draft', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'owner' }); mocks.isAdmin.mockReturnValue(true);
    await read('status=draft', 'owner-token');
    expect(query.where).toHaveBeenCalledWith('status', '==', 'draft');
  });
  it('hides private titles/bodies and refills a public page instead of ending pagination early', async () => {
    const privateDoc = doc('private', { isPublic: false, content: 'hidden' });
    query.get.mockResolvedValueOnce({ docs: [privateDoc, doc('public-1')] })
      .mockResolvedValueOnce({ docs: [doc('public-2')] });
    const response = await read('limit=2');
    const data = await response.json();
    expect(data.articles.map((a: { id: string }) => a.id)).toEqual(['public-1', 'public-2']);
    expect(data.hasMore).toBe(true);
    expect(query.startAfter).toHaveBeenCalledWith(expect.objectContaining({ id: 'public-1' }));
    expect(query.limit).toHaveBeenLastCalledWith(1);
    expect(JSON.stringify(data)).not.toContain('hidden');
  });
  it('terminates an exhausted private-only page without returning private records', async () => {
    query.get.mockResolvedValueOnce({ docs: [doc('private', { isPublic: false })] })
      .mockResolvedValueOnce({ docs: [] });
    expect(await (await read('limit=1')).json()).toMatchObject({ articles: [], hasMore: false });
    expect(query.get).toHaveBeenCalledTimes(2);
  });
  it.each([[undefined, 401], ['other-token', 403]] as const)('denies foreign read-history lookups (%s)', async (token, status) => {
    if (token) mocks.verifyIdToken.mockResolvedValue({ uid: 'other' });
    expect((await read('userId=owner', token)).status).toBe(status);
    expect(collection).not.toHaveBeenCalled();
  });
  it('starts same-owner history lookup while the article query is still pending', async () => {
    let complete!: (value: { docs: ReturnType<typeof doc>[] }) => void;
    query.get.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    mocks.verifyIdToken.mockResolvedValue({ uid: 'owner' });
    history.get.mockResolvedValue({ docs: [{ data: () => ({ articleId: 'newest-read' }) }] });
    const pending = read('userId=owner&readStatus=all', 'owner-token');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(history.where).toHaveBeenCalledWith('userId', '==', 'owner');
    expect(history.get).toHaveBeenCalledOnce();
    complete({ docs: [doc('newest-read'), doc('older-unread')] });
    const data = await (await pending).json();
    expect(data.articles.map((a: { id: string }) => a.id)).toEqual(['newest-read', 'older-unread']);
    expect(data.readArticleIds).toEqual(['newest-read']);
  });
  it.each([['read', ['one']], ['unread', ['two']]])('preserves the %s filter', async (readStatus, expected) => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'owner' });
    history.get.mockResolvedValue({ docs: [{ data: () => ({ articleId: 'one' }) }] });
    query.get.mockResolvedValue({ docs: [doc('one'), doc('two')] });
    const data = await (await read(`userId=owner&readStatus=${readStatus}`, 'owner-token')).json();
    expect(data.articles.map((a: { id: string }) => a.id)).toEqual(expected);
  });
  it('preserves category/topic/language/difficulty, creation-date bounds, and ordering', async () => {
    await read('categoryId=cs&topicId=queues&language=ja&difficulty=advanced&fromDate=2026-09-01&toDate=2026-09-10&orderDir=asc');
    for (const [field, value] of [['categoryId', 'cs'], ['topicId', 'queues'], ['language', 'ja'], ['difficulty', 'advanced']]) {
      expect(query.where).toHaveBeenCalledWith(field, '==', value);
    }
    expect(query.where).toHaveBeenCalledWith('createdAt', '>=', Timestamp.fromDate(new Date('2026-09-01')));
    expect(query.where).toHaveBeenCalledWith('createdAt', '<', Timestamp.fromDate(new Date('2026-09-10')));
    expect(query.orderBy).toHaveBeenCalledWith('createdAt', 'asc');
  });
  it.each(['title', 'summary', 'tags', 'keyTakeaways'])('searches %s case-insensitively', async field => {
    query.get.mockResolvedValue({ docs: [doc('matching', {
      [field]: ['tags', 'keyTakeaways'].includes(field) ? ['Queue'] : 'Queue',
    }), doc('unrelated')] });
    const data = await (await read('search=QUEUE&limit=1')).json();
    expect(data.articles.map((a: { id: string }) => a.id)).toEqual(['matching']);
    expect(data.totalMatched).toBe(1);
    expect(query.limit).toHaveBeenCalledWith(100);
  });
  it('continues after a valid article cursor and serializes full-article timestamps', async () => {
    const last = { exists: true, id: 'last' }; cursor.get.mockResolvedValue(last);
    query.get.mockResolvedValue({ docs: [doc('next', { updatedAt: Timestamp.fromDate(new Date('2026-09-09')) })] });
    const data = await (await read('lastId=last&orderBy=title&orderDir=asc')).json();
    expect(query.doc).toHaveBeenCalledWith('last'); expect(query.startAfter).toHaveBeenCalledWith(last);
    expect(query.orderBy).toHaveBeenCalledWith('title', 'asc');
    expect(data.articles[0].updatedAt).toBe('2026-09-09T00:00:00.000Z');
  });
  it.each(['limit=0', 'limit=101', 'limit=1.5', 'limit=bad', 'fromDate=bad', 'toDate=bad',
    'fromDate=2026-09-10&toDate=2026-09-01', 'fromDate=2026-09-01&orderBy=title', 'lastId=bad/path'])
  ('rejects invalid query parameters before a database request: %s', async params => {
    const response = await read(params);
    expect(response.status).toBe(400); expect(collection).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('fails closed without exposing database error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    query.get.mockRejectedValue(new Error('private connection details'));
    const response = await read();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: 'Failed to fetch articles' });
  });
});
