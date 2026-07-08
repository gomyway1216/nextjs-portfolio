/**
 * Mini Adventure - Item Definitions
 */

import {
  Item,
  ItemType,
  WeaponData,
  ArmorData,
  ScrollEffect,
  CardEffect,
  PetType,
} from './types';

// Unique ID generator
let itemIdCounter = 0;
function generateItemId(): string {
  return `item_${++itemIdCounter}`;
}

// Weapon definitions
const WEAPONS: Omit<WeaponData, 'id'>[] = [
  { name: 'Wooden Sword', attack: 2, level: 1 },
  { name: 'Bronze Sword', attack: 4, level: 2 },
  { name: 'Iron Sword', attack: 6, level: 3 },
  { name: 'Steel Sword', attack: 9, level: 4 },
  { name: 'Silver Sword', attack: 12, level: 5 },
  { name: 'Golden Sword', attack: 15, level: 6 },
  { name: 'Platinum Sword', attack: 19, level: 7 },
  { name: 'Mythril Sword', attack: 23, level: 8 },
  { name: 'Diamond Sword', attack: 28, level: 9 },
  { name: 'Legendary Sword', attack: 35, level: 10 },
];

// Armor definitions
const ARMORS: Omit<ArmorData, 'id'>[] = [
  { name: 'Cloth Armor', defense: 1, level: 1 },
  { name: 'Leather Armor', defense: 3, level: 2 },
  { name: 'Chainmail', defense: 5, level: 3 },
  { name: 'Scale Armor', defense: 7, level: 4 },
  { name: 'Plate Armor', defense: 10, level: 5 },
  { name: 'Silver Armor', defense: 13, level: 6 },
  { name: 'Golden Armor', defense: 16, level: 7 },
  { name: 'Mythril Armor', defense: 20, level: 8 },
  { name: 'Diamond Armor', defense: 25, level: 9 },
  { name: 'Legendary Armor', defense: 30, level: 10 },
];

// Scroll definitions
const SCROLLS: { effect: ScrollEffect; name: string; description: string }[] = [
  { effect: ScrollEffect.FIREBALL, name: 'Fireball Scroll', description: 'Burns all visible enemies' },
  { effect: ScrollEffect.FREEZE, name: 'Freeze Scroll', description: 'Freezes all visible enemies' },
  { effect: ScrollEffect.TELEPORT, name: 'Teleport Scroll', description: 'Teleport to a random location' },
  { effect: ScrollEffect.MAP_REVEAL, name: 'Map Scroll', description: 'Reveals the entire floor' },
  { effect: ScrollEffect.POWER_UP, name: 'Power Scroll', description: 'Boosts attack for 10 turns' },
  { effect: ScrollEffect.SHIELD, name: 'Shield Scroll', description: 'Boosts defense for 10 turns' },
];

// Card definitions
const CARDS: { effect: CardEffect; name: string; description: string }[] = [
  { effect: CardEffect.DAMAGE, name: 'Attack Card', description: 'Throw to deal damage from distance' },
  { effect: CardEffect.SLEEP, name: 'Sleep Card', description: 'Puts enemy to sleep' },
  { effect: CardEffect.CONFUSE, name: 'Confuse Card', description: 'Confuses enemy movement' },
  { effect: CardEffect.KNOCKBACK, name: 'Force Card', description: 'Pushes enemy back' },
  { effect: CardEffect.HEAL, name: 'Heal Card', description: 'Restores HP when used on self' },
];

// Egg definitions
const EGGS: { petType: PetType; name: string; description: string }[] = [
  { petType: PetType.GRABBER_BIRD, name: 'Bird Egg', description: 'Hatches into a Grabber Bird (escape ability)' },
  { petType: PetType.PYTHON, name: 'Snake Egg', description: 'Hatches into a Python (weaken enemies)' },
  { petType: PetType.TEDDY, name: 'Bear Egg', description: 'Hatches into a Teddy (guide enemies)' },
];

// Factory functions
export function createWeapon(level?: number): Item {
  const weaponLevel = level ?? Math.floor(Math.random() * WEAPONS.length);
  const weaponData = WEAPONS[Math.min(weaponLevel, WEAPONS.length - 1)];

  return {
    id: generateItemId(),
    type: ItemType.WEAPON,
    name: weaponData.name,
    description: `Attack +${weaponData.attack}`,
    weaponData: {
      ...weaponData,
      id: generateItemId(),
    },
  };
}

export function createArmor(level?: number): Item {
  const armorLevel = level ?? Math.floor(Math.random() * ARMORS.length);
  const armorData = ARMORS[Math.min(armorLevel, ARMORS.length - 1)];

  return {
    id: generateItemId(),
    type: ItemType.ARMOR,
    name: armorData.name,
    description: `Defense +${armorData.defense}`,
    armorData: {
      ...armorData,
      id: generateItemId(),
    },
  };
}

export function createTorch(value?: number): Item {
  const torchValue = value ?? 30 + Math.floor(Math.random() * 40);

  return {
    id: generateItemId(),
    type: ItemType.TORCH,
    name: 'Torch',
    description: `Restores ${torchValue} torch light`,
    torchValue,
  };
}

export function createScroll(effect?: ScrollEffect): Item {
  const scrollData = effect
    ? SCROLLS.find(s => s.effect === effect)!
    : SCROLLS[Math.floor(Math.random() * SCROLLS.length)];

  return {
    id: generateItemId(),
    type: ItemType.SCROLL,
    name: scrollData.name,
    description: scrollData.description,
    scrollEffect: scrollData.effect,
  };
}

export function createCard(effect?: CardEffect): Item {
  const cardData = effect
    ? CARDS.find(c => c.effect === effect)!
    : CARDS[Math.floor(Math.random() * CARDS.length)];

  return {
    id: generateItemId(),
    type: ItemType.CARD,
    name: cardData.name,
    description: cardData.description,
    cardEffect: cardData.effect,
  };
}

export function createEgg(petType?: PetType): Item {
  const eggData = petType
    ? EGGS.find(e => e.petType === petType)!
    : EGGS[Math.floor(Math.random() * EGGS.length)];

  return {
    id: generateItemId(),
    type: ItemType.EGG,
    name: eggData.name,
    description: eggData.description,
    petType: eggData.petType,
    eggTurns: 0,
  };
}

export function createPotion(): Item {
  return {
    id: generateItemId(),
    type: ItemType.POTION,
    name: 'Health Potion',
    description: 'Restores 30 HP',
  };
}

// Generate random item for floor
export function generateRandomItem(floorLevel: number): Item {
  const roll = Math.random();

  // Adjust probabilities based on floor level
  if (roll < 0.15) {
    // Weapon - level scales with floor
    const maxLevel = Math.min(floorLevel + 1, WEAPONS.length - 1);
    const level = Math.floor(Math.random() * (maxLevel + 1));
    return createWeapon(level);
  } else if (roll < 0.30) {
    // Armor - level scales with floor
    const maxLevel = Math.min(floorLevel + 1, ARMORS.length - 1);
    const level = Math.floor(Math.random() * (maxLevel + 1));
    return createArmor(level);
  } else if (roll < 0.50) {
    // Torch
    return createTorch();
  } else if (roll < 0.65) {
    // Scroll
    return createScroll();
  } else if (roll < 0.80) {
    // Card
    return createCard();
  } else if (roll < 0.90) {
    // Potion
    return createPotion();
  } else {
    // Egg (rare)
    return createEgg();
  }
}

// Get item display character
export function getItemChar(item: Item): string {
  switch (item.type) {
    case ItemType.WEAPON: return '/';
    case ItemType.ARMOR: return '[';
    case ItemType.TORCH: return '!';
    case ItemType.SCROLL: return '?';
    case ItemType.CARD: return '*';
    case ItemType.EGG: return 'o';
    case ItemType.POTION: return '!';
    default: return '?';
  }
}

// Get item color
export function getItemColor(item: Item): string {
  switch (item.type) {
    case ItemType.WEAPON: return '#60a5fa'; // Blue
    case ItemType.ARMOR: return '#34d399'; // Green
    case ItemType.TORCH: return '#fbbf24'; // Yellow
    case ItemType.SCROLL: return '#a78bfa'; // Purple
    case ItemType.CARD: return '#f472b6'; // Pink
    case ItemType.EGG: return '#fcd34d'; // Gold
    case ItemType.POTION: return '#f87171'; // Red
    default: return '#9ca3af'; // Gray
  }
}
