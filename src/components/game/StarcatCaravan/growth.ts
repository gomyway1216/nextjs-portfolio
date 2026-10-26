import type { Character, Rarity } from './data';
import type { OwnedCat } from './engine';

export const trainedRarity = (cat: Character, owned: OwnedCat): Rarity => Math.max(cat.rarity, owned.stars ?? cat.rarity) as Rarity;

/** Promotions spend coins, never levels or duplicate copies. Wish rarity stays in the catalog. */
export function ascensionOffer(cat: Character, owned: OwnedCat) {
  const current = trainedRarity(cat, owned);
  return current === 5 ? null : { stars: (current + 1) as Rarity, level: current === 3 ? 5 : 10, coins: current === 3 ? 600 : 1200 };
}
