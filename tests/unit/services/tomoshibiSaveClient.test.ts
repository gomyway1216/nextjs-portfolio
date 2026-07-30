import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebaseConnect', () => ({
  auth: { currentUser: null },
}));

vi.mock('@/lib/gameAuth', () => ({
  ensureGameSignIn: vi.fn(async () => ({
    uid: 'test-uid',
    getIdToken: async () => 'test-token',
  })),
}));

import { loadTomoshibiSave, saveTomoshibiSave } from '@/services/tomoshibiSaveClient';

describe('tomoshibiSaveClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ save: '{"turns":42}' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns the stored save', async () => {
    await expect(loadTomoshibiSave()).resolves.toBe('{"turns":42}');
  });

  // fetchCloudFunction normalises init.headers into a Headers instance on its
  // way through, so this has to be read with get() rather than as a property.
  it('sends the caller ID token, so the save lands on the right user', async () => {
    await loadTomoshibiSave();
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
  });

  // The game reads the result synchronously at startup and treats '' as "no
  // cloud save", falling back to the local one. Anything that throws out of
  // here would stop the game from starting at all.
  it('returns an empty string when the request fails, rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(loadTomoshibiSave()).resolves.toBe('');
  });

  it('returns an empty string on a non-OK response', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(loadTomoshibiSave()).resolves.toBe('');
  });

  it('returns an empty string when the body has no usable save', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ save: { not: 'a string' } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    await expect(loadTomoshibiSave()).resolves.toBe('');
  });

  it('posts the save as-is', async () => {
    await saveTomoshibiSave('{"turns":7}');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ save: '{"turns":7}' });
  });

  // An empty string is how the game says the run is over, so it must reach the
  // backend rather than being treated as "nothing to send".
  it('posts an empty save, which is how a finished run is deleted', async () => {
    await saveTomoshibiSave('');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ save: '' });
  });

  // Storing is best-effort: the local save is the real one, so a failure here
  // must not interrupt play.
  it('never throws when storing fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(saveTomoshibiSave('{"turns":1}')).resolves.toBeUndefined();
  });
});
