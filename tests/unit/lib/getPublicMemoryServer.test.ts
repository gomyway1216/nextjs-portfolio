import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('getPublicMemoryServer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_MEMORY_API_URL', 'https://memory.example.test/public');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches through the server boundary with revalidation and validates the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      items: [{
        id: 'milestone-1',
        title: 'Shipped a project',
        summary: 'Delivered a useful product.',
        category: 'Building',
        occurredAt: '2026-08-01',
        secret: 'not forwarded',
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicMemoryServer } = await import('@/lib/publicMemory/getPublicMemoryServer');
    const result = await getPublicMemoryServer();

    expect(result).toEqual({
      status: 'ready',
      items: [{
        id: 'milestone-1',
        title: 'Shipped a project',
        summary: 'Delivered a useful product.',
        category: 'Building',
        occurredAt: '2026-08-01T00:00:00.000Z',
        tags: [],
      }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://memory.example.test/public'),
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        next: { revalidate: 3600, tags: ['public-memory'] },
        redirect: 'error',
      }),
    );
  });

  it('returns a safe unavailable state without a configured endpoint', async () => {
    vi.stubEnv('PUBLIC_MEMORY_API_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicMemoryServer } = await import('@/lib/publicMemory/getPublicMemoryServer');

    await expect(getPublicMemoryServer()).resolves.toEqual({ status: 'unavailable', items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose malformed, failed, or oversized responses', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ privateItems: [{ secret: true }] }))
      .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"items":[]}', {
        headers: { 'content-length': String(513 * 1024) },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const { getPublicMemoryServer } = await import('@/lib/publicMemory/getPublicMemoryServer');

    await expect(getPublicMemoryServer()).resolves.toEqual({ status: 'unavailable', items: [] });
    await expect(getPublicMemoryServer()).resolves.toEqual({ status: 'unavailable', items: [] });
    await expect(getPublicMemoryServer()).resolves.toEqual({ status: 'unavailable', items: [] });
    expect(errorSpy).toHaveBeenCalledTimes(3);
  });

  it.each(['not-a-number', 'Infinity', '-1'])(
    'rejects an invalid Content-Length of %s before reading the body',
    async (contentLength) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const response = new Response('{"items":[]}', {
        headers: { 'content-length': contentLength },
      });
      const textSpy = vi.spyOn(response, 'text');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      const { getPublicMemoryServer } = await import('@/lib/publicMemory/getPublicMemoryServer');

      await expect(getPublicMemoryServer()).resolves.toEqual({ status: 'unavailable', items: [] });
      expect(textSpy).not.toHaveBeenCalled();
    },
  );

  it('allows a response without Content-Length', async () => {
    const response = new Response('{"items":[]}');
    expect(response.headers.has('content-length')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const { getPublicMemoryServer } = await import('@/lib/publicMemory/getPublicMemoryServer');

    await expect(getPublicMemoryServer()).resolves.toEqual({ status: 'empty', items: [] });
  });
});
