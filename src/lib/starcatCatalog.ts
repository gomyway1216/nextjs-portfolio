import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { CatalogError, parseCharacterCatalog, validateCharacterCatalog, type CharacterCatalog } from '@/components/game/StarcatCaravan/catalog';
import { getFirestore } from './firebase-admin';

const COLLECTION = 'game_catalogs';
const DOCUMENT = 'starcat-caravan';

function storedCatalog(value: unknown): CharacterCatalog {
  const catalog = parseCharacterCatalog(value);
  if (!catalog) throw new CatalogError('The character catalog in the database cannot be read. It has not been replaced.', 503);
  return catalog;
}

/** Bootstrap once in Firestore. An existing catalog, including an unreadable one, is never reset. */
export async function getOrCreateStarcatCatalog(): Promise<CharacterCatalog> {
  const db = getFirestore();
  const reference = db.collection(COLLECTION).doc(DOCUMENT);
  return db.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    if (document.exists) {
      const current = storedCatalog(document.data());
      // Add the first portrait set once. Keep administrator artwork (including an
      // explicit null), names, stats and every permanent ID exactly as stored.
      let changed = false;
      const characters = current.characters.map((cat) => {
        const portraitUrl = CHARACTERS.find((seed) => seed.id === cat.id)?.portraitUrl;
        if (Object.hasOwn(cat, 'portraitUrl') || !portraitUrl) return cat;
        changed = true;
        return { ...cat, portraitUrl };
      });
      if (!changed) return current;
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new CatalogError('The catalog revision cannot be increased further.', 503);
      const catalog = { revision: current.revision + 1, characters };
      transaction.update(reference, { ...catalog, updatedAt: new Date(), updatedBy: 'portraits-v1' });
      return catalog;
    }
    const catalog = validateCharacterCatalog({ revision: 1, characters: CHARACTERS });
    const now = new Date();
    transaction.create(reference, { ...catalog, createdAt: now, updatedAt: now, updatedBy: 'bootstrap' });
    return catalog;
  });
}

/** Admin-only route supplies the actor. A transaction protects both revision and permanent IDs. */
export async function updateStarcatCatalog(input: CharacterCatalog, uid: string): Promise<CharacterCatalog> {
  const candidate = validateCharacterCatalog(input);
  const db = getFirestore();
  const reference = db.collection(COLLECTION).doc(DOCUMENT);
  return db.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    if (!document.exists) throw new CatalogError('Load the catalog before editing it.', 409);
    const current = storedCatalog(document.data());
    if (candidate.revision !== current.revision) throw new CatalogError('The catalog changed since you opened it. Reload before saving.', 409);
    if (current.revision === Number.MAX_SAFE_INTEGER) throw new CatalogError('The catalog revision cannot be increased further.', 409);
    const nextIds = new Set(candidate.characters.map((cat) => cat.id));
    const removed = current.characters.filter((cat) => !nextIds.has(cat.id));
    if (removed.length) throw new CatalogError(`Existing companion IDs cannot be removed or renamed: ${removed.map((cat) => cat.id).join(', ')}.`, 409);
    const catalog: CharacterCatalog = { revision: current.revision + 1, characters: candidate.characters };
    transaction.update(reference, { ...catalog, updatedAt: new Date(), updatedBy: uid });
    return catalog;
  });
}
