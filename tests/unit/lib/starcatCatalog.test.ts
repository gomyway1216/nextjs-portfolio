import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
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

  it('rejects stale revisions without clobbering a newer edit', async () => {
    const initial = await getOrCreateStarcatCatalog();
    const latest = await updateStarcatCatalog(initial, 'first-admin');
    await expect(updateStarcatCatalog(initial, 'second-admin')).rejects.toMatchObject({ status: 409 });
    expect(await getOrCreateStarcatCatalog()).toEqual(latest);
    expect(update).toHaveBeenCalledTimes(1);
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
