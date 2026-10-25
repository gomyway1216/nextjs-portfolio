import { parseCharacterCatalog, type CharacterCatalog } from './catalog';

export const CATALOG_CACHE_KEY = 'starcat-character-catalog-v1';

/** Keep the last validated catalog for offline play; never start from an invented fallback catalog. */
export async function loadCharacterCatalog(
  fetcher: typeof fetch = fetch,
  slots: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage,
): Promise<{ catalog: CharacterCatalog; offline: boolean }> {
  try {
    const response = await fetcher('/api/game/starcat/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error('Character catalog unavailable');
    const catalog = parseCharacterCatalog(await response.json());
    if (!catalog) throw new Error('Character catalog could not be read');
    try { slots().setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)); } catch { /* Account play still works without device storage. */ }
    return { catalog, offline: false };
  } catch (error) {
    try {
      const raw = slots().getItem(CATALOG_CACHE_KEY);
      const cached = raw ? parseCharacterCatalog(JSON.parse(raw)) : null;
      if (cached) return { catalog: cached, offline: true };
    } catch { /* An unreadable cache must not replace the player's journal. */ }
    throw error;
  }
}
