import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { CATALOG_CACHE_KEY, loadCharacterCatalog } from '@/components/game/StarcatCaravan/catalogClient';
import { FakeSlots } from '../MedalPusher/accountFakes';

const catalog = () => ({ revision: 3, characters: structuredClone(CHARACTERS) });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('the playable character catalog client', () => {
  it('fetches the current DB catalog without caching the request and keeps a validated offline copy', async () => {
    const slots = new FakeSlots();
    const fresh = catalog();
    fresh.characters[0].name.en = 'A DB-managed name';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fresh));
    expect(await loadCharacterCatalog(fetcher, () => slots)).toEqual({ catalog: fresh, offline: false });
    expect(fetcher).toHaveBeenCalledWith('/api/game/starcat/catalog', { cache: 'no-store' });
    expect(JSON.parse(slots.getItem(CATALOG_CACHE_KEY)!)).toEqual(fresh);
  });

  it.each(['network', 'server', 'invalid'] as const)('uses the last validated catalog when the %s response is unavailable', async (failure) => {
    const slots = new FakeSlots();
    const cached = catalog();
    slots.setItem(CATALOG_CACHE_KEY, JSON.stringify(cached));
    const fetcher = vi.fn<typeof fetch>();
    if (failure === 'network') fetcher.mockRejectedValue(new TypeError('Failed to fetch'));
    else fetcher.mockResolvedValue(failure === 'server' ? response({ error: 'unavailable' }, 503) : response({ revision: 4, characters: [] }));
    expect(await loadCharacterCatalog(fetcher, () => slots)).toEqual({ catalog: cached, offline: true });
    expect(slots.getItem(CATALOG_CACHE_KEY)).toBe(JSON.stringify(cached));
  });

  it.each([null, 'not json', JSON.stringify({ revision: 1, characters: [] })])('fails without an invented bootstrap catalog when the cache is %s', async (written) => {
    const slots = new FakeSlots();
    if (written !== null) slots.setItem(CATALOG_CACHE_KEY, written);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ error: 'unavailable' }, 503));
    await expect(loadCharacterCatalog(fetcher, () => slots)).rejects.toThrow('Character catalog unavailable');
    expect(slots.getItem(CATALOG_CACHE_KEY)).toBe(written);
  });

  it('still returns a valid online catalog when browser storage is blocked', async () => {
    const slots = new FakeSlots();
    slots.blocked = true;
    const fresh = catalog();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fresh));
    expect(await loadCharacterCatalog(fetcher, () => slots)).toEqual({ catalog: fresh, offline: false });
  });

  it('propagates the network error when both the network and browser storage are unavailable', async () => {
    const slots = new FakeSlots();
    slots.blocked = true;
    const error = new TypeError('Failed to fetch');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(loadCharacterCatalog(fetcher, () => slots)).rejects.toBe(error);
  });
});
