import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createGameState } from '@/components/game/MiniAdventure/GameEngine';
import {
  ITEM_NAMES,
  getMiniAdventureStrings,
  localizeItemDescription,
  localizeItemName,
  localizeLogText,
  parseLogText,
  type LogKey,
} from '@/components/game/MiniAdventure/i18n';
import {
  createArmor, createCard, createEgg, createPotion, createScroll, createTorch, createWeapon,
} from '@/components/game/MiniAdventure/Items';
import { CardEffect, type Item, PetType, ScrollEffect } from '@/components/game/MiniAdventure/types';

const root = process.cwd();
const engineSource = readFileSync(join(root, 'src/components/game/MiniAdventure/GameEngine.ts'), 'utf8');
const componentSource = readFileSync(join(root, 'src/components/game/MiniAdventure/MiniAdventure.tsx'), 'utf8');

/** One of every item the engine can create. */
function everyItem(): Item[] {
  return [
    ...Array.from({ length: 10 }, (_, level) => createWeapon(level)),
    ...Array.from({ length: 10 }, (_, level) => createArmor(level)),
    ...Object.values(ScrollEffect).map(effect => createScroll(effect)),
    ...Object.values(CardEffect).map(effect => createCard(effect)),
    ...Object.values(PetType).map(pet => createEgg(pet)),
    createTorch(42),
    createPotion(),
  ];
}

/**
 * Every message the engine can log, read from its source: each string passed to
 * `addMessage`, with its `${…}` values replaced by sample values of the right kind.
 */
function everyEngineMessage(): string[] {
  const sample = (expr: string) => {
    if (/\.name$/.test(expr) && /item/i.test(expr)) return 'Iron Sword';
    if (/enemy\.name$/.test(expr)) return 'Goblin';
    if (/getPetName/.test(expr)) return 'Python';
    return '7';
  };
  const literal = /`([^`]*)`|'((?:[^'\\]|\\.)*)'|"([^"]*)"/g;
  const messages: string[] = [];
  for (const line of engineSource.split('\n')) {
    if (!line.includes('addMessage(') || line.includes('function addMessage')) continue;
    for (const m of line.matchAll(literal)) {
      const text = m[1] ?? m[2] ?? m[3];
      if (['info', 'combat', 'item', 'important'].includes(text)) continue;
      messages.push(text.replace(/\$\{([^}]*)\}/g, (_, expr: string) => sample(expr.trim())));
    }
  }
  return messages;
}

describe('Mini Adventure item and log translations', () => {
  it('has every item name, description and log message in both languages', () => {
    const ja = getMiniAdventureStrings('ja');
    const en = getMiniAdventureStrings('en');
    for (const name of ITEM_NAMES) {
      expect(en.itemNames[name], name).toBe(name);
      expect(ja.itemNames[name], name).toBeTruthy();
      expect(ja.itemNames[name], name).not.toMatch(/[A-Za-z]/);
    }
    for (const group of ['scroll', 'card', 'egg'] as const) {
      const keys = Object.keys(en.itemDescriptions[group]);
      expect(Object.keys(ja.itemDescriptions[group]).sort()).toEqual(keys.sort());
    }
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    const keys = Object.keys(en.log) as LogKey[];
    expect(Object.keys(ja.log).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(en.log[key], key).toBeTruthy();
      expect(ja.log[key], key).toBeTruthy();
      expect(placeholders(ja.log[key]), key).toEqual(placeholders(en.log[key]));
    }
  });

  it('names every item the engine creates', () => {
    const items = everyItem();
    expect(new Set(items.map(item => item.name))).toEqual(new Set(ITEM_NAMES));
    for (const item of items) {
      // English stays exactly as the engine wrote it.
      expect(localizeItemName(item, 'en')).toBe(item.name);
      expect(localizeItemDescription(item, 'en')).toBe(item.description);
      expect(localizeItemName(item, 'ja'), item.name).not.toMatch(/[A-Za-z]/);
      expect(localizeItemDescription(item, 'ja').replace(/HP/g, ''), item.name).not.toMatch(/[A-Za-z]/);
    }
  });

  it('builds Japanese descriptions from the item data', () => {
    expect(localizeItemDescription(createWeapon(2), 'ja')).toBe('攻撃 +6');
    expect(localizeItemDescription(createArmor(4), 'ja')).toBe('防御 +10');
    expect(localizeItemDescription(createTorch(42), 'ja')).toBe('松明の明かりを 42 回復');
  });

  it('matches every message the engine logs to a template', () => {
    const messages = [...createGameState().messages.map(m => m.text), ...everyEngineMessage()];
    // 46 addMessage calls, one of which logs either of two messages.
    expect(messages.length).toBeGreaterThanOrEqual(48);
    for (const text of messages) {
      expect(parseLogText(text), text).not.toBeNull();
      expect(localizeLogText(text, 'en')).toBe(text);
      // Only the key names and "HP" stay in Latin letters.
      expect(localizeLogText(text, 'ja').replace(/WASD|HP|「g」/g, ''), text).not.toMatch(/[A-Za-z]/);
    }
  });

  it('translates the names inside a log line', () => {
    expect(localizeLogText('Welcome to the dungeon! Find the stairs to descend.', 'ja'))
      .toBe('ダンジョンへようこそ！階段を見つけて下へ進もう。');
    expect(localizeLogText('You hit the Goblin for 12 damage!', 'ja')).toBe('ゴブリンに12のダメージ！');
    expect(localizeLogText('The card hits Slime for 14 damage!', 'ja')).toBe('カードがスライムに命中、14のダメージ！');
    expect(localizeLogText('The Orc hits you for 3 damage!', 'ja')).toBe('オークの攻撃で3のダメージ！');
    expect(localizeLogText('You picked up the Mythril Sword.', 'ja')).toBe('ミスリルの剣を拾った。');
    expect(localizeLogText('Your egg hatched into a Grabber Bird!', 'ja')).toBe('卵が孵ってつかみ鳥が生まれた！');
    expect(localizeLogText('You defeated the Dragon! (+100 exp)', 'ja')).toBe('ドラゴンを倒した！（経験値 +100）');
  });

  it('shows an unknown line as written', () => {
    expect(localizeLogText('Something new happened.', 'ja')).toBe('Something new happened.');
  });

  it('renders the log and the inventory through the translations', () => {
    expect(componentSource).toContain('{localizeLogText(msg.text, language)}');
    expect(componentSource).toContain('{localizeItemName(item, language)}');
    expect(componentSource).toContain('{localizeItemDescription(item, language)}');
    expect(componentSource).not.toMatch(/\{msg\.text\}|\{item\.name\}|\{item\.description\}/);
  });
});
