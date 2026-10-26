import { CHARACTERS, characterById, RARITY_POWER, type Character } from './data';
import { trainedRarity } from './growth';
import type { OwnedCat } from './engine';

/** Identical trained stats are used by cards, exploration battles and the legacy simulator. */
export function catStats(id: string, owned: OwnedCat, characters: readonly Character[] = CHARACTERS) {
  const cat = characterById(id, characters);
  const copies = 1 + Math.min(5, owned.copies - 1) * 0.04;
  const multiplier = RARITY_POWER[trainedRarity(cat,owned)] * (1 + (owned.level - 1) * 0.14) * copies;
  const armor = RARITY_POWER[trainedRarity(cat,owned)] * (1 + (owned.level - 1) * 0.07) * copies;
  return { hp: Math.round(cat.hp * multiplier), attack: Math.round(cat.attack * multiplier), defense: Math.round((cat.defense ?? 0) * armor) };
}
