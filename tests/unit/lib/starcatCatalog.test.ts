import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, ORIGINAL_CHARACTER_IDS } from '@/components/game/StarcatCaravan/data';
import { getOrCreateStarcatCatalog, updateStarcatCatalog } from '@/lib/starcatCatalog';

const mocks = vi.hoisted(() => ({ getFirestore: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getFirestore: mocks.getFirestore }));

describe('Starcat catalog database', () => {
  let document: Record<string, unknown> | undefined;
  const reference = { path: 'game_catalogs/starcat-caravan' };
  const create = vi.fn();
  const update = vi.fn();
  const get = vi.fn();
  const doc = vi.fn();
  const collection = vi.fn();
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    document = undefined;
    vi.clearAllMocks();
    doc.mockReturnValue(reference);
    collection.mockReturnValue({ doc });
    get.mockImplementation(async () => ({ exists: document !== undefined, data: () => structuredClone(document) }));
    mocks.getFirestore.mockReturnValue({
      collection,
      runTransaction: async (run: (transaction: object) => Promise<unknown>) => {
        let pending: Record<string, unknown> | undefined;
        create.mockImplementation((_ref, value) => { pending = structuredClone(value); });
        update.mockImplementation((_ref, value) => { pending = { ...document, ...structuredClone(value) }; });
        const result = await run({ get, create, update });
        if (pending) document = pending;
        return result;
      },
    });
  });

  it('initializes all original companions in Firestore only once and never exposes audit fields', async () => {
    const first = await getOrCreateStarcatCatalog();
    expect(first).toEqual({ revision: 1, characters: CHARACTERS });
    expect(collection).toHaveBeenCalledWith('game_catalogs');
    expect(doc).toHaveBeenCalledWith('starcat-caravan');
    expect(create).toHaveBeenCalledWith(reference, expect.objectContaining({ revision: 1, characters: CHARACTERS, createdAt: expect.any(Date) }));
    expect(await getOrCreateStarcatCatalog()).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps a preview deployment from publishing new companions into a shared live database', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const legacy = CHARACTERS.slice(0, 12).map(({ defense: _d, ability: _a, abilityName: _n, ...cat }) => cat);
    document = { revision: 2, characters: legacy };
    expect(await getOrCreateStarcatCatalog()).toEqual({ revision: 2, characters: legacy });
    expect(update).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });

  it('does not bootstrap an empty shared database from a preview deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    await expect(getOrCreateStarcatCatalog()).rejects.toMatchObject({ status: 503 });
    expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('updates display names and stats and adds companions without replacing any existing ID', async () => {
    const initial = await getOrCreateStarcatCatalog();
    const characters = structuredClone(initial.characters);
    characters[0].name.ja = '新しいコハク';
    characters[0].attack = 55;
    characters.push({ ...characters[0], id: 'admin-added' });
    const updated = await updateStarcatCatalog({ revision: 1, characters }, 'owner-uid');
    expect(updated).toEqual({ revision: 2, characters });
    expect(document).toMatchObject({ revision: 2, updatedBy: 'owner-uid' });
    expect(await getOrCreateStarcatCatalog()).toEqual(updated);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('adds portraits to an existing database once without resetting edited names, abilities or added companions', async () => {
    const old = CHARACTERS.map(({ portraitUrl: _portrait, ...cat }) => ({ ...cat }));
    old[0].name = { ja: '管理者がつけた名前', en: 'Edited name' };
    old[0].hp = 420;
    old.push({ ...old[0], id: 'later-companion' });
    document = { revision: 8, characters: old, createdAt: 'original-date' };
    const upgraded = await getOrCreateStarcatCatalog();
    expect(upgraded.revision).toBe(9);
    expect(upgraded.characters.map((cat) => cat.id)).toEqual(old.map((cat) => cat.id));
    expect(upgraded.characters[0]).toMatchObject({ name: old[0].name, hp: 420, portraitUrl: CHARACTERS[0].portraitUrl });
    expect(upgraded.characters.at(-1)?.portraitUrl).toBeUndefined();
    expect(document?.createdAt).toBe('original-date');
    expect(await getOrCreateStarcatCatalog()).toEqual(upgraded);
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('preserves an administrator image and an explicit choice to use vector artwork', async () => {
    const characters = structuredClone(CHARACTERS);
    characters[0].portraitUrl = 'https://example.com/custom-ember.webp';
    characters[1].portraitUrl = null;
    document = { revision: 3, contentVersion: 2, characters };
    expect(await getOrCreateStarcatCatalog()).toEqual({ revision: 3, characters });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects stale revisions without clobbering a newer edit', async () => {
    const initial = await getOrCreateStarcatCatalog();
    const latest = await updateStarcatCatalog(initial, 'first-admin');
    await expect(updateStarcatCatalog(initial, 'second-admin')).rejects.toMatchObject({ status: 409 });
    expect(await getOrCreateStarcatCatalog()).toEqual(latest);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('upgrades an actual legacy twelve-cat catalog once, preserving administrator choices and all player records', async () => {
    const legacy = CHARACTERS.filter((cat) => (ORIGINAL_CHARACTER_IDS as readonly string[]).includes(cat.id)).map(({ defense: _defense, ability: _ability, abilityName: _name, portraitUrl: _art, ...cat }) => ({ ...cat }));
    const characters = legacy.map((cat, index) => index === 0 ? { ...cat, name: { ja: '私のコハク', en: 'My Ember' }, hp: 999, defense: 0, ability: 'none' as const, abilityName: { ja: '自由な名前', en: 'Custom name' }, portraitUrl: null } : cat);
    document = { revision: 2, characters, createdAt: 'original' };
    const catalog = await getOrCreateStarcatCatalog();
    expect(catalog.revision).toBe(3); expect(catalog.characters).toHaveLength(16);
    expect(catalog.characters[0]).toEqual(characters[0]);
    expect(catalog.characters.find((cat) => cat.id === 'brook')).toMatchObject({ defense: 28, ability: 'ward' });
    expect(catalog.characters.find((cat) => cat.id === 'yuki')).toMatchObject({ element: 'ice', ability: 'frost' });
    expect(document).toMatchObject({ contentVersion: 2, createdAt: 'original' });
    expect(await getOrCreateStarcatCatalog()).toEqual(catalog); expect(update).toHaveBeenCalledTimes(1);
    expect(collection.mock.calls.every(([name]) => name === 'game_catalogs')).toBe(true);
  });

  it('keeps a pre-existing administrator companion that happens to share a new seed ID', async () => {
    const legacy = structuredClone(CHARACTERS.slice(0, 12));
    const custom = { ...legacy[0], id: 'yuki', name: { ja: '管理者の猫', en: 'Custom cat' }, portraitUrl: null, ability: 'none' as const, defense: 99 };
    document = { revision: 2, characters: [...legacy, custom] };
    const catalog = await getOrCreateStarcatCatalog();
    expect(catalog.characters).toHaveLength(16);
    expect(catalog.characters.find((cat) => cat.id === 'yuki')).toEqual(custom);
    expect(await getOrCreateStarcatCatalog()).toEqual(catalog);
  });

  it('keeps a full administrator catalog readable rather than exceeding the 200-companion limit', async () => {
    const characters = [...structuredClone(CHARACTERS.slice(0, 12)), ...Array.from({ length: 188 }, (_, index) => ({ ...CHARACTERS[0], id: `admin-${index}` }))];
    document = { revision: 2, characters };
    const catalog = await getOrCreateStarcatCatalog();
    expect(catalog.characters).toHaveLength(200);
    expect(catalog.characters.map((cat) => cat.id)).toEqual(characters.map((cat) => cat.id));
    expect(await getOrCreateStarcatCatalog()).toEqual(catalog);
  });

  it('also protects companions that were added after bootstrap from deletion and ID renaming', async () => {
    const initial = await getOrCreateStarcatCatalog();
    const latest = await updateStarcatCatalog({ ...initial, characters: [...initial.characters, { ...CHARACTERS[0], id: 'owned-by-players' }] }, 'admin');
    for (const characters of [CHARACTERS, latest.characters.map((cat) => cat.id === 'owned-by-players' ? { ...cat, id: 'replacement' } : cat)]) {
      await expect(updateStarcatCatalog({ revision: latest.revision, characters }, 'admin')).rejects.toMatchObject({ status: 409, message: expect.stringContaining('owned-by-players') });
    }
    expect(await getOrCreateStarcatCatalog()).toEqual(latest);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('holds malformed database content and does not silently reseed it', async () => {
    document = { revision: 9, characters: [] };
    await expect(getOrCreateStarcatCatalog()).rejects.toMatchObject({ status: 503 });
    await expect(updateStarcatCatalog({ revision: 9, characters: CHARACTERS }, 'admin')).rejects.toMatchObject({ status: 503 });
    expect(document).toEqual({ revision: 9, characters: [] });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses updates before initialization and does not fake success when the database fails', async () => {
    await expect(updateStarcatCatalog({ revision: 1, characters: CHARACTERS }, 'admin')).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled();
    mocks.getFirestore.mockImplementationOnce(() => { throw new Error('Database unavailable'); });
    await expect(getOrCreateStarcatCatalog()).rejects.toThrow('Database unavailable');
  });
});
