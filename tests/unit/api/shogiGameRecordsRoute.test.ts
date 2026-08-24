import { beforeEach, describe, expect, it, vi } from 'vitest';

// This route is reachable without any credential, so what it refuses matters
// as much as what it forwards. The Cloud Function behind it is mocked out —
// the payload rules are tested in the backend repo.

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  getCloudFunctionUrl: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  isRateLimited: mocks.isRateLimited,
  clientIpFrom: () => '203.0.113.7',
}));

vi.mock('@/app/api/constants', () => ({
  getCloudFunctionUrl: mocks.getCloudFunctionUrl,
}));

const ENDPOINT = 'https://example.com/api/game/shogi/records';

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }) as never;
}

async function callPost(request: never) {
  const { POST } = await import('@/app/api/game/shogi/records/route');
  return POST(request);
}

describe('POST /api/game/shogi/records', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.isRateLimited.mockReset().mockReturnValue(false);
    mocks.getCloudFunctionUrl.mockReset().mockReturnValue('https://saveshogigamerecord.example/');
    vi.unstubAllGlobals();
  });

  it('forwards the body to the saveShogiGameRecord function', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true, stored: true }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const body = JSON.stringify({ schema: 'shogi-game-record-v1', moves_usi: ['7g7f'] });
    const response = await callPost(makeRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, stored: true });
    expect(mocks.getCloudFunctionUrl).toHaveBeenCalledWith('saveShogiGameRecord');
    expect(fetchMock.mock.calls[0][1].body).toBe(body);
  });

  it('passes an ID token through when the player is signed in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await callPost(makeRequest('{}', { authorization: 'Bearer token-123' }));

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-123');
  });

  it('sends no Authorization header for an anonymous visitor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await callPost(makeRequest('{}'));

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('rate limits per IP without touching the Cloud Function', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.isRateLimited.mockReturnValue(true);

    const response = await callPost(makeRequest('{}'));

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an oversized body before forwarding it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // Well past the 96KB ceiling — the shape of a caller trying to park a blob
    // in a collection anyone can write to.
    const response = await callPost(makeRequest('x'.repeat(200 * 1024)));

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses on a declared Content-Length before reading the body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await callPost(
      makeRequest('{}', { 'content-length': String(500 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a transport failure as a 500 rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await callPost(makeRequest('{}'));

    expect(response.status).toBe(500);
    errorSpy.mockRestore();
  });

  it('passes the Cloud Function\'s own rejection back to the client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({ success: false, error: 'move_count mismatch' }, { status: 400 }),
      ),
    );

    const response = await callPost(makeRequest('{}'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
