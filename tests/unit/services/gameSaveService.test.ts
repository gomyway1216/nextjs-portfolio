import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Nobody is signed in and nothing is fetched: the user and the token are made up, and `fetch` is a stand-in.
const firebase = vi.hoisted(() => ({ auth: { currentUser: null as null | { uid: string; getIdToken: () => Promise<string> } } }));
vi.mock('@/lib/firebaseConnect', () => firebase);

import { GameSaveError, currentGameSaveUid, deleteGameSave, getGameSave, getGameSaveCredentials, saveGameSave, saveGameSaveKeepalive } from '@/services/gameSaveService';

const TOKEN = 'a-made-up-token';
const fetchMock = vi.fn();

/** A response as `fetch` gives it, with the headers the service reads. */
const answer = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  firebase.auth.currentUser = { uid: 'a-made-up-player', getIdToken: async () => TOKEN };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading a save', () => {
  it('asks for the game with the player’s token, and gives the save with the server’s time', async () => {
    fetchMock.mockResolvedValue(answer(200, { save: { state: { board: 1 }, updatedAt: '2026-10-12T09:00:00.000Z' } }, { date: 'Mon, 12 Oct 2026 09:00:05 GMT' }));
    const save = await getGameSave<{ board: number }>('medal-pusher');
    expect(fetchMock).toHaveBeenCalledWith('/api/game/saves?gameKey=medal-pusher', { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(save).toEqual({ state: { board: 1 }, updatedAt: '2026-10-12T09:00:00.000Z', serverTime: '2026-10-12T09:00:05.000Z' });
  });

  it('gives no server time when the answer carries none it can read', async () => {
    fetchMock.mockResolvedValue(answer(200, { save: { state: {}, updatedAt: null } }));
    expect((await getGameSave('medal-pusher'))?.serverTime).toBeNull();
    fetchMock.mockResolvedValue(answer(200, { save: { state: {}, updatedAt: null } }, { date: 'yesterday, more or less' }));
    expect((await getGameSave('medal-pusher'))?.serverTime).toBeNull();
    // A stand-in with no headers at all is read too.
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ save: { state: {}, updatedAt: null } }) });
    expect((await getGameSave('medal-pusher'))?.serverTime).toBeNull();
  });

  it('gives null for a player with no save, and for nobody, without asking', async () => {
    fetchMock.mockResolvedValue(answer(200, { save: null }));
    expect(await getGameSave('medal-pusher')).toBeNull();
    firebase.auth.currentUser = null;
    fetchMock.mockClear();
    expect(await getGameSave('medal-pusher')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500, 503])('fails with the status when the server answers %i', async (status) => {
    fetchMock.mockResolvedValue(answer(status, { error: 'no' }));
    const failure = await getGameSave('medal-pusher').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameSaveError);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as GameSaveError).status).toBe(status);
    expect((failure as GameSaveError).message).toBe(`Failed to load save (${status})`);
  });
});

describe('writing a save', () => {
  it('puts the game and its state with the player’s token', async () => {
    fetchMock.mockResolvedValue(answer(200, { success: true }));
    await saveGameSave('medal-pusher', { data: 'x' });
    expect(fetchMock).toHaveBeenCalledWith('/api/game/saves', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ gameKey: 'medal-pusher', state: { data: 'x' } }),
    });
  });

  it.each([401, 413, 500])('fails with the status when the server answers %i', async (status) => {
    fetchMock.mockResolvedValue(answer(status, { error: 'no' }));
    const failure = await saveGameSave('medal-pusher', {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameSaveError);
    expect((failure as GameSaveError).status).toBe(status);
    expect((failure as GameSaveError).message).toBe(`Failed to save game (${status})`);
  });

  it('refuses to write for nobody, without asking the server', async () => {
    firebase.auth.currentUser = null;
    await expect(saveGameSave('medal-pusher', {})).rejects.toThrow('Sign in to save your game');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a write that has to outlive the page', () => {
  it('is on its way before anything is awaited, with the token it was given and keepalive', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    // Nobody needs to be signed in any more by the time it is sent: the token is already in hand.
    firebase.auth.currentUser = null;
    void saveGameSaveKeepalive('medal-pusher', { data: 'x' }, 'the-token-in-hand');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/game/saves', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer the-token-in-hand' },
      body: JSON.stringify({ gameKey: 'medal-pusher', state: { data: 'x' } }),
      keepalive: true,
    });
  });

  it('says whether the server took it, and never rejects', async () => {
    fetchMock.mockResolvedValue(answer(200, { success: true }));
    await expect(saveGameSaveKeepalive('medal-pusher', {}, TOKEN)).resolves.toBe(true);
    fetchMock.mockResolvedValue(answer(413, { error: 'too large' }));
    await expect(saveGameSaveKeepalive('medal-pusher', {}, TOKEN)).resolves.toBe(false);
    fetchMock.mockResolvedValue(answer(401, { error: 'expired' }));
    await expect(saveGameSaveKeepalive('medal-pusher', {}, TOKEN)).resolves.toBe(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(saveGameSaveKeepalive('medal-pusher', {}, TOKEN)).resolves.toBe(false);
    // A body past what the browser sends this way makes `fetch` itself throw.
    fetchMock.mockImplementation(() => {
      throw new TypeError('keepalive body too large');
    });
    await expect(saveGameSaveKeepalive('medal-pusher', {}, TOKEN)).resolves.toBe(false);
  });
});

describe('who is signed in', () => {
  it('is the player and a token of theirs, or nobody', async () => {
    expect(await getGameSaveCredentials()).toEqual({ uid: 'a-made-up-player', token: TOKEN });
    firebase.auth.currentUser = null;
    expect(await getGameSaveCredentials()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('who is signed in at this instant', () => {
  it('is known without waiting for anything, and without asking for a token', () => {
    const getIdToken = vi.fn(async () => TOKEN);
    firebase.auth.currentUser = { uid: 'a-made-up-player', getIdToken };
    expect(currentGameSaveUid()).toBe('a-made-up-player');
    firebase.auth.currentUser = null;
    expect(currentGameSaveUid()).toBeNull();
    expect(getIdToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleting a save', () => {
  it('asks for the game’s save to be deleted, and takes a save that was not there as done', async () => {
    fetchMock.mockResolvedValue(answer(200, { success: true }));
    await deleteGameSave('medal-pusher');
    expect(fetchMock).toHaveBeenCalledWith('/api/game/saves?gameKey=medal-pusher', { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
    fetchMock.mockResolvedValue(answer(404, { error: 'gone' }));
    await expect(deleteGameSave('medal-pusher')).resolves.toBeUndefined();
  });

  it('fails with the status otherwise, and does nothing for nobody', async () => {
    fetchMock.mockResolvedValue(answer(500, { error: 'no' }));
    const failure = await deleteGameSave('medal-pusher').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameSaveError);
    expect((failure as GameSaveError).status).toBe(500);
    firebase.auth.currentUser = null;
    fetchMock.mockClear();
    await expect(deleteGameSave('medal-pusher')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
