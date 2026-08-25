import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getPublicMemoriesServer } from '@/lib/memory/getPublicMemoriesServer';

describe('getPublicMemoriesServer', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PUBLIC_MEMORY_API_URL', 'https://memory.example.com/public');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses only the configured public route and sends no credentials', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'public-1',
        title: 'Public title',
        summary: 'Public summary',
        category: 'career',
        tags: ['systems'],
        canonicalSummaryJa: 'must be discarded',
      }],
    }), { status: 200 }));

    await expect(getPublicMemoriesServer()).resolves.toEqual([{
      id: 'public-1',
      title: 'Public title',
      summary: 'Public summary',
      category: 'career',
      tags: ['systems'],
    }]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://memory.example.com/public?limit=100');
    expect(init).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      next: { revalidate: 300, tags: ['public-memory-projections'] },
    }));
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it('refuses private or insecure remote endpoints before making a request', async () => {
    vi.stubEnv('PUBLIC_MEMORY_API_URL', 'https://memory.example.com/mcp');
    await expect(getPublicMemoriesServer()).rejects.toThrow('public projection route');

    vi.stubEnv('PUBLIC_MEMORY_API_URL', 'http://memory.example.com/public');
    await expect(getPublicMemoriesServer()).rejects.toThrow('must use HTTPS');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on an unavailable or oversized response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(getPublicMemoriesServer()).rejects.toThrow('temporarily unavailable');

    fetchMock.mockResolvedValueOnce(new Response('{"items":[]}', {
      status: 200,
      headers: { 'content-length': '600000' },
    }));
    await expect(getPublicMemoriesServer()).rejects.toThrow('too large');
  });
});
