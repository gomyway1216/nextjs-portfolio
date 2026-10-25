import { CHARACTERS, type Character, type Words } from './data';

export interface CharacterCatalog { revision: number; characters: Character[] }

export class CatalogError extends Error {
  constructor(message: string, public readonly status: 400 | 409 | 503 = 400) {
    super(message);
    this.name = 'CatalogError';
  }
}

const BOOTSTRAP_IDS = CHARACTERS.map((cat) => cat.id);
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const RESERVED_IDS = new Set(['constructor', 'prototype', '__proto__']);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function words(value: unknown, label: string, max: number): Words {
  if (!record(value)) throw new CatalogError(`${label} needs Japanese and English text.`);
  const text = (language: 'ja' | 'en') => {
    const entry = value[language];
    if (typeof entry !== 'string' || entry.trim().length < 1 || entry.trim().length > max) throw new CatalogError(`${label}.${language} must contain 1–${max} characters.`);
    return entry.trim();
  };
  return { ja: text('ja'), en: text('en') };
}

function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new CatalogError(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}

/** IDs belong to saved companions permanently; editable display names and stats do not. */
export function validateCharacters(value: unknown): Character[] {
  if (!Array.isArray(value) || value.length > 200) throw new CatalogError('The catalog must be an array of up to 200 companions.');
  const ids = new Set<string>();
  const characters = value.map((entry, index): Character => {
    if (!record(entry)) throw new CatalogError(`Companion ${index + 1} must be an object.`);
    const id = entry.id;
    if (typeof id !== 'string' || !ID.test(id) || RESERVED_IDS.has(id)) throw new CatalogError(`Companion ${index + 1} needs a lowercase ID starting with a letter (up to 48 letters, digits, or hyphens).`);
    if (ids.has(id)) throw new CatalogError(`Duplicate companion ID: ${id}.`);
    ids.add(id);
    const { rarity, role, element, fur, accent } = entry;
    if (rarity !== 3 && rarity !== 4 && rarity !== 5) throw new CatalogError(`${id}.rarity must be 3, 4, or 5.`);
    if (role !== 'guard' && role !== 'fighter' && role !== 'ranger' && role !== 'healer') throw new CatalogError(`${id}.role is not supported.`);
    if (element !== 'fire' && element !== 'water' && element !== 'wind') throw new CatalogError(`${id}.element is not supported.`);
    if (typeof fur !== 'string' || !COLOR.test(fur) || typeof accent !== 'string' || !COLOR.test(accent)) throw new CatalogError(`${id} colors must use #RRGGBB.`);
    return {
      id, name: words(entry.name, `${id}.name`, 80), title: words(entry.title, `${id}.title`, 120),
      rarity, role, element, fur, accent,
      hp: number(entry.hp, `${id}.hp`, 1, 100000, true),
      attack: number(entry.attack, `${id}.attack`, 1, 10000, true),
      range: number(entry.range, `${id}.range`, 1, 40),
      speed: number(entry.speed, `${id}.speed`, 0.1, 30),
      cost: number(entry.cost, `${id}.cost`, 1, 200, true),
      cooldown: number(entry.cooldown, `${id}.cooldown`, 0.1, 60),
    };
  });
  const missing = BOOTSTRAP_IDS.filter((id) => !ids.has(id));
  if (missing.length) throw new CatalogError(`Existing companion IDs cannot be removed or renamed: ${missing.join(', ')}.`, 409);
  for (const rarity of [3, 4, 5]) {
    if (!characters.some((cat) => cat.rarity === rarity)) throw new CatalogError(`Keep at least one ★${rarity} companion in the summon pool.`);
  }
  return characters;
}

export function validateCharacterCatalog(value: unknown): CharacterCatalog {
  if (!record(value) || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new CatalogError('The catalog needs a positive integer revision.');
  return { revision: value.revision, characters: validateCharacters(value.characters) };
}

/** API and cache data are untrusted; callers choose whether to retry or use their known catalog. */
export function parseCharacterCatalog(value: unknown): CharacterCatalog | null {
  try { return validateCharacterCatalog(value); } catch { return null; }
}
