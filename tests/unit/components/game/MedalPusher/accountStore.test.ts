import { beforeEach, describe, expect, it, vi } from 'vitest';

// The site's save service is a stand-in here: no account is asked and nothing is fetched.
const service = vi.hoisted(() => ({
  getGameSave: vi.fn(),
  saveGameSave: vi.fn(),
  saveGameSaveKeepalive: vi.fn(),
  getGameSaveCredentials: vi.fn(),
}));
vi.mock('@/services/gameSaveService', () => service);

import { accountStoreFor } from '@/components/game/MedalPusher/accountStore';

const ANN = { uid: 'ann', token: 'anns-made-up-token' };
const BOB = { uid: 'bob', token: 'bobs-made-up-token' };

beforeEach(() => {
  for (const stand of Object.values(service)) stand.mockReset();
  service.getGameSaveCredentials.mockResolvedValue(ANN);
  service.saveGameSave.mockResolvedValue(undefined);
  service.saveGameSaveKeepalive.mockResolvedValue(true);
});

describe('the account’s store on the site’s save service', () => {
  it('reads the game’s save for the player who is signed in', async () => {
    service.getGameSave.mockResolvedValue({ state: { data: 'x' }, updatedAt: '2026-10-12T09:00:00.000Z', serverTime: '2026-10-12T09:00:05.000Z' });
    const store = accountStoreFor('medal-pusher');
    expect(await store.load('ann')).toEqual({ state: { data: 'x' }, updatedAt: '2026-10-12T09:00:00.000Z', serverTime: '2026-10-12T09:00:05.000Z' });
    expect(service.getGameSave).toHaveBeenCalledWith('medal-pusher');
    service.getGameSave.mockResolvedValue({ state: {}, updatedAt: null });
    expect(await store.load('ann')).toEqual({ state: {}, updatedAt: null, serverTime: null });
    service.getGameSave.mockResolvedValue(null);
    expect(await store.load('ann')).toBeNull();
  });

  it('fails a read when nobody is signed in, instead of saying the account has nothing', async () => {
    service.getGameSaveCredentials.mockResolvedValue(null);
    service.getGameSave.mockResolvedValue(null);
    const store = accountStoreFor('medal-pusher');
    await expect(store.load('ann')).rejects.toThrow();
    expect(service.getGameSave).not.toHaveBeenCalled();
  });

  it('refuses to read or write for any account but the one signed in', async () => {
    service.getGameSaveCredentials.mockResolvedValue(BOB);
    const store = accountStoreFor('medal-pusher');
    await expect(store.load('ann')).rejects.toThrow();
    await expect(store.store('ann', { data: 'anns' })).rejects.toThrow();
    await store.prepare('ann');
    expect(store.storeNow('ann', { data: 'anns' })).toBeNull();
    expect(service.getGameSave).not.toHaveBeenCalled();
    expect(service.saveGameSave).not.toHaveBeenCalled();
    expect(service.saveGameSaveKeepalive).not.toHaveBeenCalled();
  });

  it('writes the game’s save, and passes on a failure with its status', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.store('ann', { data: 'x' });
    expect(service.saveGameSave).toHaveBeenCalledWith('medal-pusher', { data: 'x' });
    const tooLarge = Object.assign(new Error('Failed to save game (413)'), { status: 413 });
    service.saveGameSave.mockRejectedValue(tooLarge);
    await expect(store.store('ann', { data: 'x' })).rejects.toBe(tooLarge);
  });

  it('sends the leaving write only with a token in hand for that account, and without waiting for anything', async () => {
    const store = accountStoreFor('medal-pusher');
    // Nothing has been made ready yet.
    expect(store.storeNow('ann', { data: 'x' })).toBeNull();
    await store.prepare('ann');
    service.getGameSaveCredentials.mockClear();
    const going = store.storeNow('ann', { data: 'x' });
    expect(service.saveGameSaveKeepalive).toHaveBeenCalledWith('medal-pusher', { data: 'x' }, ANN.token);
    expect(service.getGameSaveCredentials).not.toHaveBeenCalled();
    await expect(going).resolves.toBe(true);
    // A token in hand for one account is not used for another.
    expect(store.storeNow('bob', { data: 'x' })).toBeNull();
  });

  it('keeps the token of a read or a write in hand as well', async () => {
    service.getGameSave.mockResolvedValue(null);
    const store = accountStoreFor('medal-pusher');
    await store.load('ann');
    expect(store.storeNow('ann', {})).not.toBeNull();
    expect(service.saveGameSaveKeepalive).toHaveBeenLastCalledWith('medal-pusher', {}, ANN.token);
  });

  it('never rejects from getting ready, and lets go of a token whose player has signed out', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.prepare('ann');
    service.getGameSaveCredentials.mockResolvedValue(null);
    await expect(store.prepare('ann')).resolves.toBeUndefined();
    expect(store.storeNow('ann', {})).toBeNull();
    service.getGameSaveCredentials.mockRejectedValue(new Error('the token could not be refreshed'));
    await expect(store.prepare('ann')).resolves.toBeUndefined();
  });

  it('keeps one game’s store apart from another’s', async () => {
    const machine = accountStoreFor('medal-pusher');
    const book = accountStoreFor('medal-pusher-records');
    await machine.store('ann', { a: 1 });
    await book.store('ann', { b: 2 });
    expect(service.saveGameSave.mock.calls).toEqual([
      ['medal-pusher', { a: 1 }],
      ['medal-pusher-records', { b: 2 }],
    ]);
  });
});
