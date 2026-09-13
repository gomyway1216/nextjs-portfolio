import {beforeEach, expect, it, vi} from 'vitest';
import {NextRequest, NextResponse} from 'next/server';
const {auth, fetchDocuments} = vi.hoisted(() => ({auth: vi.fn(), fetchDocuments: vi.fn()}));
vi.mock('@/lib/auth-utils', () => ({ensureAdmin: auth}));
vi.mock('@/lib/memory/getPrivateMemoriesServer', () => ({getStudyDocumentsServer: fetchDocuments}));
import {GET} from '@/app/api/study/documents/route';
beforeEach(() => {auth.mockReset(); fetchDocuments.mockReset();});
it('does not read documents before owner verification and never caches denial', async () => {
  auth.mockResolvedValue({user: null, response: NextResponse.json({}, {status: 401})});
  const result = await GET(new NextRequest('https://example.com/api/study/documents'));
  expect(result.status).toBe(401); expect(result.headers.get('cache-control')).toContain('no-store');
  expect(fetchDocuments).not.toHaveBeenCalled();
});
it('rejects arbitrary URLs, duplicate parameters and traversal', async () => {
  auth.mockResolvedValue({user: {uid: 'owner'}});
  for (const query of ['id=../private', 'url=https://attacker.test', 'course=one&course=two', 'version=latest']) {
    expect((await GET(new NextRequest(`https://example.com/api/study/documents?${query}`))).status).toBe(400);
  }
  expect(fetchDocuments).not.toHaveBeenCalled();
});
it('uses the private bridge and returns a no-store response', async () => {
  auth.mockResolvedValue({user: {uid: 'owner'}}); fetchDocuments.mockResolvedValue({items: []});
  const response = await GET(new NextRequest('https://example.com/api/study/documents?course=CS+564'));
  expect(await response.json()).toEqual({items: []});
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(fetchDocuments.mock.calls[0][0].get('course')).toBe('CS 564');
});
it('rejects out-of-range pagination before calling the private bridge', async () => {
  auth.mockResolvedValue({user: {uid: 'owner'}});
  for (const query of ['page=0', 'page=10001', 'limit=0', 'limit=51', 'offset=-1', 'offset=100001']) {
    expect((await GET(new NextRequest(`https://example.com/api/study/documents?${query}`))).status).toBe(400);
  }
  expect(fetchDocuments).not.toHaveBeenCalled();
});
it('accepts pagination bounds supported by the backend', async () => {
  auth.mockResolvedValue({user: {uid: 'owner'}}); fetchDocuments.mockResolvedValue({items: []});
  for (const query of ['page=1&limit=1&offset=0', 'page=10000&limit=50&offset=100000']) {
    expect((await GET(new NextRequest(`https://example.com/api/study/documents?${query}`))).status).toBe(200);
  }
  expect(fetchDocuments).toHaveBeenCalledTimes(2);
});
it('does not expose upstream failures or fall back to public data', async () => {
  auth.mockResolvedValue({user: {uid: 'owner'}}); fetchDocuments.mockRejectedValue(new Error('private key'));
  const response = await GET(new NextRequest('https://example.com/api/study/documents'));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('private key');
});
