import { CHARACTERS, ORIGINAL_CHARACTER_IDS } from '@/components/game/StarcatCaravan/data';
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
    // Preview deployments may share the live Firebase project. Never publish new
    // schema/companions from an unmerged preview and strand older live clients.
    if (process.env.VERCEL_ENV === 'preview') {
      if (document.exists) return storedCatalog(document.data());
      throw new CatalogError('The catalog must be initialized by the production deployment.', 503);
    }
    if (document.exists) {
      const data = document.data();
      const current = storedCatalog(data);
      // Add missing fields and new companions once; never reset administrator choices or player saves.
      const expand = typeof data?.contentVersion !== 'number' || data.contentVersion < 2;
      let changed = expand;
      const characters = current.characters.map((cat) => {
        if (!(ORIGINAL_CHARACTER_IDS as readonly string[]).includes(cat.id)) return cat;
        const seed = CHARACTERS.find((entry) => entry.id === cat.id);
        if (!seed) return cat;
        const next = { ...cat };
        if (!Object.hasOwn(cat, 'portraitUrl') && seed.portraitUrl) { next.portraitUrl = seed.portraitUrl; changed = true; }
        if (expand) {
          if (!Object.hasOwn(cat, 'defense') && seed.defense !== undefined) next.defense = seed.defense;
          if (!Object.hasOwn(cat, 'ability') && seed.ability !== undefined) next.ability = seed.ability;
          if (!Object.hasOwn(cat, 'abilityName') && next.ability === seed.ability && seed.abilityName) next.abilityName = seed.abilityName;
        }
        return next;
      });
      if (expand) for (const seed of CHARACTERS) if (characters.length < 200 && !characters.some((cat) => cat.id === seed.id)) characters.push({ ...seed });
      if (!changed) return current;
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new CatalogError('The catalog revision cannot be increased further.', 503);
      const catalog = validateCharacterCatalog({ revision: current.revision + 1, characters });
      transaction.update(reference, { ...catalog, contentVersion: 2, updatedAt: new Date(), updatedBy: 'companions-v2' });
      return catalog;
    }
    const catalog = validateCharacterCatalog({ revision: 1, characters: CHARACTERS });
    const now = new Date();
    transaction.create(reference, { ...catalog, contentVersion: 2, createdAt: now, updatedAt: now, updatedBy: 'bootstrap' });
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
