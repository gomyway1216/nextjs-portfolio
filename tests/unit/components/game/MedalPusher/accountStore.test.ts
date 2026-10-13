import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The site's save service is a stand-in here: no account is asked and nothing is fetched.
const service = vi.hoisted(() => ({
  // The two calls that ask for themselves who is signed in. The store is never to use them.
  getGameSave: vi.fn(),
  saveGameSave: vi.fn(),
  getGameSaveAs: vi.fn(),
  saveGameSaveAs: vi.fn(),
  saveGameSaveKeepalive: vi.fn(),
  getGameSaveCredentials: vi.fn(),
  currentGameSaveUid: vi.fn(),
}));
vi.mock('@/services/gameSaveService', () => service);

import { accountStoreFor } from '@/components/game/MedalPusher/accountStore';

const ANN = { uid: 'ann', token: 'anns-made-up-token' };
const BOB = { uid: 'bob', token: 'bobs-made-up-token' };

beforeEach(() => {
  for (const stand of Object.values(service)) stand.mockReset();
  service.getGameSaveCredentials.mockResolvedValue(ANN);
  service.currentGameSaveUid.mockReturnValue(ANN.uid);
  service.saveGameSaveAs.mockResolvedValue(undefined);
  service.saveGameSaveKeepalive.mockResolvedValue(true);
});

afterEach(() => {
  // Whatever a test did, the store never went by the calls that look up the player for themselves.
  expect(service.getGameSave).not.toHaveBeenCalled();
  expect(service.saveGameSave).not.toHaveBeenCalled();
});

describe('the account’s store on the site’s save service', () => {
  it('reads the game’s save for the player who is signed in', async () => {
    service.getGameSaveAs.mockResolvedValue({ state: { data: 'x' }, updatedAt: '2026-10-12T09:00:00.000Z', serverTime: '2026-10-12T09:00:05.000Z' });
    const store = accountStoreFor('medal-pusher');
    expect(await store.load('ann')).toEqual({ state: { data: 'x' }, updatedAt: '2026-10-12T09:00:00.000Z', serverTime: '2026-10-12T09:00:05.000Z' });
    expect(service.getGameSaveAs).toHaveBeenCalledWith('medal-pusher', ANN.token);
    service.getGameSaveAs.mockResolvedValue({ state: {}, updatedAt: null });
    expect(await store.load('ann')).toEqual({ state: {}, updatedAt: null, serverTime: null });
    service.getGameSaveAs.mockResolvedValue(null);
    expect(await store.load('ann')).toBeNull();
  });

  it('fails a read when nobody is signed in, instead of saying the account has nothing', async () => {
    service.getGameSaveCredentials.mockResolvedValue(null);
    service.getGameSaveAs.mockResolvedValue(null);
    const store = accountStoreFor('medal-pusher');
    await expect(store.load('ann')).rejects.toThrow();
    expect(service.getGameSaveAs).not.toHaveBeenCalled();
  });

  it('refuses to read or write for any account but the one signed in', async () => {
    service.getGameSaveCredentials.mockResolvedValue(BOB);
    service.currentGameSaveUid.mockReturnValue(BOB.uid);
    const store = accountStoreFor('medal-pusher');
    await expect(store.load('ann')).rejects.toThrow();
    await expect(store.store('ann', { data: 'anns' })).rejects.toThrow();
    await store.prepare('ann');
    expect(store.storeNow('ann', { data: 'anns' })).toBeNull();
    expect(service.getGameSaveAs).not.toHaveBeenCalled();
    expect(service.saveGameSaveAs).not.toHaveBeenCalled();
    expect(service.saveGameSaveKeepalive).not.toHaveBeenCalled();
  });

  it('writes the game’s save, and passes on a failure with its status', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.store('ann', { data: 'x' });
    expect(service.saveGameSaveAs).toHaveBeenCalledWith('medal-pusher', { data: 'x' }, ANN.token);
    const tooLarge = Object.assign(new Error('Failed to save game (413)'), { status: 413 });
    service.saveGameSaveAs.mockRejectedValue(tooLarge);
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

  it('does not use the token in hand once its player has signed out, and lets it go', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.prepare('ann');
    // She signs out. Nothing has told the store yet; the page is hidden a moment later.
    service.currentGameSaveUid.mockReturnValue(null);
    expect(store.storeNow('ann', { data: 'x' })).toBeNull();
    expect(service.saveGameSaveKeepalive).not.toHaveBeenCalled();
    // The token is gone for good, not kept for when somebody is signed in again.
    service.currentGameSaveUid.mockReturnValue(ANN.uid);
    expect(store.storeNow('ann', { data: 'x' })).toBeNull();
    expect(service.saveGameSaveKeepalive).not.toHaveBeenCalled();
  });

  it('does not use one player’s token in hand when another is signed in', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.prepare('ann');
    service.currentGameSaveUid.mockReturnValue(BOB.uid);
    // Bob's machine is not sent with Ann's token, which would write it to her account; nor hers as him.
    expect(store.storeNow('bob', { data: 'bobs' })).toBeNull();
    expect(store.storeNow('ann', { data: 'anns' })).toBeNull();
    expect(service.saveGameSaveKeepalive).not.toHaveBeenCalled();
  });

  it('refuses when the token that came is another player’s, whoever is signed in by then', async () => {
    service.getGameSaveCredentials.mockResolvedValue(BOB);
    service.getGameSaveAs.mockResolvedValue(null);
    const store = accountStoreFor('medal-pusher');
    await expect(store.load('ann')).rejects.toThrow();
    await expect(store.store('ann', { data: 'anns' })).rejects.toThrow();
    expect(service.getGameSaveAs).not.toHaveBeenCalled();
    expect(service.saveGameSaveAs).not.toHaveBeenCalled();
    expect(store.storeNow('ann', { data: 'anns' })).toBeNull();
  });

  it('lets go of the token when it is told the player has signed out, and of nobody else’s', async () => {
    const store = accountStoreFor('medal-pusher');
    await store.prepare('ann');
    store.forget('bob');
    expect(store.storeNow('ann', {})).not.toBeNull();
    store.forget('ann');
    expect(store.storeNow('ann', {})).toBeNull();
    expect(service.saveGameSaveKeepalive).toHaveBeenCalledTimes(1);
    // Forgetting when there is nothing in hand is nothing.
    expect(() => store.forget('ann')).not.toThrow();
  });

  /** The service's answer about who is signed in, held back until the test lets it go. */
  function heldBack() {
    let give: (who: typeof ANN | null) => void = () => undefined;
    service.getGameSaveCredentials.mockReturnValue(new Promise((resolve) => (give = resolve)));
    return (who: typeof ANN | null) => give(who);
  }

  it('does not keep a token that arrives after its player has signed out', async () => {
    const store = accountStoreFor('medal-pusher');
    const give = heldBack();
    const ready = store.prepare('ann');
    // She signs out while the token is on its way, and the store is told.
    service.currentGameSaveUid.mockReturnValue(null);
    store.forget('ann');
    give(ANN);
    await ready;
    // Even if she is signed in again by the time the page is left, that token is not in hand.
    service.currentGameSaveUid.mockReturnValue(ANN.uid);
    expect(store.storeNow('ann', { data: 'x' })).toBeNull();
    expect(service.saveGameSaveKeepalive).not.toHaveBeenCalled();
  });

  it('sends no read and no write whose player signed out while the token was on its way', async () => {
    service.getGameSaveAs.mockResolvedValue(null);
    const store = accountStoreFor('medal-pusher');
    const give = heldBack();
    const reading = store.load('ann');
    const writing = store.store('ann', { data: 'anns' });
    service.currentGameSaveUid.mockReturnValue(null);
    give(ANN);
    // The read fails; it does not say that the account has nothing.
    await expect(reading).rejects.toThrow();
    await expect(writing).rejects.toThrow();
    expect(service.getGameSaveAs).not.toHaveBeenCalled();
    expect(service.saveGameSaveAs).not.toHaveBeenCalled();
    // Nor when another player has signed in meanwhile.
    const giveAgain = heldBack();
    const late = store.store('ann', { data: 'anns' });
    service.currentGameSaveUid.mockReturnValue(BOB.uid);
    giveAgain(ANN);
    await expect(late).rejects.toThrow();
    expect(service.saveGameSaveAs).not.toHaveBeenCalled();
    expect(store.storeNow('ann', {})).toBeNull();
  });

  it('keeps the token of a read or a write in hand as well', async () => {
    service.getGameSaveAs.mockResolvedValue(null);
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
    expect(service.saveGameSaveAs.mock.calls).toEqual([
      ['medal-pusher', { a: 1 }, ANN.token],
      ['medal-pusher-records', { b: 2 }, ANN.token],
    ]);
  });
});
