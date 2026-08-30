import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getPrivateMemoryHistoryServer,
  getPrivateMemoryIndexServer,
} from '@/lib/memory/getPrivateMemoriesServer';

const indexItem = {
  id: 'memory-1',
  title: 'Private context',
  category: 'career',
  sensitivity: 'sensitive',
  visibility: 'private',
  tags: ['career'],
  revision: 1,
  updatedAt: '2026-08-29T10:00:00.000Z',
};

describe('private memory server client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERSONAL_MEMORY_ADMIN_API_URL', 'https://memory.example.com/admin/memories');
    vi.stubEnv('PERSONAL_MEMORY_DASHBOARD_READ_KEY', 'server-only-dashboard-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the credential only in the server-side authorization header', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      view: 'index', items: [indexItem], total: 1,
    }), { status: 200 }));

    await expect(getPrivateMemoryIndexServer()).resolves.toEqual([indexItem]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://memory.example.com/admin/memories?view=index&limit=500&offset=0');
    expect(String(url)).not.toContain('server-only-dashboard-key');
    expect(init).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer server-only-dashboard-key',
      },
    }));
  });

  it('loads every stable index page without duplicating records', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        view: 'index', items: [indexItem], total: 2, nextOffset: 1,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        view: 'index', items: [{...indexItem, id: 'memory-2'}], total: 2,
      }), { status: 200 }));

    await expect(getPrivateMemoryIndexServer()).resolves.toEqual([
      indexItem,
      {...indexItem, id: 'memory-2'},
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('offset=1');
  });

  it('requests one summary-only history by validated id', async () => {
    const snapshot = {
      title: 'Private context', canonicalSummaryJa: 'Detailed summary', category: 'career',
      sensitivity: 'sensitive', visibility: 'private', tags: ['career'], revision: 1,
      updatedAt: '2026-08-29T10:00:00.000Z',
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      view: 'history', memoryId: 'memory-1', items: [{
        id: 'memory-1.0000000001', memoryId: 'memory-1', lineageId: 'memory-1',
        revision: 1, committedAt: '2026-08-29T10:00:00.000Z', snapshot,
      }],
    }), { status: 200 }));

    await expect(getPrivateMemoryHistoryServer('memory-1')).resolves.toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('memoryId=memory-1');
    await expect(getPrivateMemoryHistoryServer('../private')).rejects.toThrow('Invalid memory id');
  });

  it('rejects insecure, credentialed, and non-admin endpoints before fetch', async () => {
    vi.stubEnv('PERSONAL_MEMORY_ADMIN_API_URL', 'http://memory.example.com/admin/memories');
    await expect(getPrivateMemoryIndexServer()).rejects.toThrow('must use HTTPS');

    vi.stubEnv('PERSONAL_MEMORY_ADMIN_API_URL', 'https://user:pass@memory.example.com/admin/memories');
    await expect(getPrivateMemoryIndexServer()).rejects.toThrow('must not include credentials');

    vi.stubEnv('PERSONAL_MEMORY_ADMIN_API_URL', 'https://memory.example.com/mcp');
    await expect(getPrivateMemoryIndexServer()).rejects.toThrow('admin memories route');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
