import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FortressBriefing } from '@/components/game/StarcatCaravan/FortressBriefing';
import { battleBriefing } from '@/components/game/StarcatCaravan/briefing';
import { castArenaBurst, createArena, tickArena, type Arena } from '@/components/game/StarcatCaravan/arena';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { newSave, type Save } from '@/components/game/StarcatCaravan/engine';

const solo = (): Save => ({ ...newSave(), team: ['ember'] });
const until = (arena: Arena, done: (arena: Arena) => boolean) => {
  for (let n = 0; n < 1800 && arena.status === 'playing' && !done(arena); n++) arena = tickArena(arena);
  expect(done(arena)).toBe(true);
  return arena;
};

describe('fortress briefing numbers', () => {
  it('reports the starting party exactly as the arena fields it, resonance included', () => {
    const save = newSave(), before = structuredClone(save);
    expect(battleBriefing(save, 0, CHARACTERS)).toEqual({
      stage: 0, element: 'wind', enemies: 5, hp: 830, attack: 99, defense: 14,
      shadow: { hp: 130, defense: 4, hit: 19, burst: 286 },
      guardian: { hp: 750, defense: 18, hit: 57, burst: 252 },
      party: [{ id: 'ember', edge: true }, { id: 'brook', edge: false }, { id: 'breeze', edge: false }, { id: 'moss', edge: false }],
      bench: [],
    });
    expect(save).toEqual(before);
    const arena = createArena(save, 0)!;
    expect([arena.maxHp, arena.defense]).toEqual([830, 14]);
  });

  it.each([0, 3, 5])('matches the shadows and guardian that really spawn on island %s', (stage) => {
    const save: Save = { ...newSave(), cleared: [0, 1, 2, 3, 4].slice(0, stage), owned: Object.fromEntries(['ember', 'brook', 'breeze', 'moss'].map((id) => [id, { level: 20, copies: 6 }])) };
    const brief = battleBriefing(save, stage, CHARACTERS)!;
    const first = until(createArena(save, stage)!, (arena) => arena.enemies.length > 0).enemies[0];
    expect([first.boss, first.maxHp, first.defense]).toEqual([false, brief.shadow.hp, brief.shadow.defense]);
    const late = until(createArena(save, stage)!, (arena) => arena.enemies.some((enemy) => enemy.boss));
    const boss = late.enemies.find((enemy) => enemy.boss)!;
    expect([boss.maxHp, boss.defense, late.spawned]).toEqual([brief.guardian.hp, brief.guardian.defense, brief.enemies]);
  });

  it('predicts the damage of one marked hit on a party without a ward', () => {
    const save = solo(), brief = battleBriefing(save, 0, CHARACTERS)!;
    const hit = until(createArena(save, 0)!, (arena) => arena.hits > 0);
    expect(hit.hits).toBe(1);
    expect(hit.maxHp - hit.hp).toBe(brief.shadow.hit);
  });

  it('predicts one Star bond against a full-HP shadow, whether or not it is enough', () => {
    const weak = solo(), weakBrief = battleBriefing(weak, 0, CHARACTERS)!;
    expect(weakBrief.shadow.burst).toBeLessThan(weakBrief.shadow.hp);
    const left = castArenaBurst(until(createArena(weak, 0)!, (arena) => arena.enemies.length > 0));
    expect(left.enemies[0].hp).toBe(weakBrief.shadow.hp - weakBrief.shadow.burst);

    const strong = newSave(), strongBrief = battleBriefing(strong, 0, CHARACTERS)!;
    expect(strongBrief.shadow.burst).toBeGreaterThanOrEqual(strongBrief.shadow.hp);
    expect(castArenaBurst(until(createArena(strong, 0)!, (arena) => arena.enemies.length > 0)).enemies).toHaveLength(0);
  });

  it('marks who is strong against the island and lists only owned companions from outside the party', () => {
    const save: Save = { ...newSave(), cleared: [0], owned: { ...newSave().owned, raika: { level: 1, copies: 1 }, pearl: { level: 1, copies: 1 } } };
    const brief = battleBriefing(save, 1, CHARACTERS)!;
    expect(brief.element).toBe('water');
    expect(brief.party.filter((member) => member.edge).map((member) => member.id)).toEqual(['breeze', 'moss']);
    expect(brief.bench).toEqual(['raika']);
  });

  it('has nothing to say about a locked island or a party the catalog cannot field', () => {
    expect(battleBriefing(newSave(), 1, CHARACTERS)).toBeNull();
    expect(battleBriefing(newSave(), 6, CHARACTERS)).toBeNull();
    expect(battleBriefing(newSave(), 0, CHARACTERS.filter((cat) => cat.id !== 'moss'))).toBeNull();
    const stranger = newSave(); stranger.team = ['ember', 'luna'];
    expect(battleBriefing(stranger, 0, CHARACTERS)).toBeNull();
    expect(renderToStaticMarkup(<FortressBriefing save={stranger} characters={CHARACTERS} language="en" />)).toBe('');
  });
});

describe('fortress briefing panel', () => {
  it('shows the current island, the party numbers and four fixed party slots in both languages', () => {
    const save = solo();
    const ja = renderToStaticMarkup(<FortressBriefing save={save} characters={CHARACTERS} language="ja" />);
    for (const text of ['砦の偵察メモ', '1. はじまりの草原', '風属性の影', '敵5体（最後の1体はボス）', '未攻略', 'コハク', '有利 ×1.5', '控えで有利な仲間', 'いません', '耐える', '影の守り手']) expect(ja).toContain(text);
    expect(ja.match(/<li/g)).toHaveLength(4);
    expect(ja.match(/data-empty="true"/g)).toHaveLength(3);
    expect(ja).not.toMatch(/Fortress|Empty slot|None|survives/);
    const en = renderToStaticMarkup(<FortressBriefing save={save} characters={CHARACTERS} language="en" />);
    for (const text of ['FORTRESS BRIEFING', '1. Firstlight Meadow', 'Wind shadows', '5 enemies (the last is the boss)', 'Not cleared yet', 'Ember', 'Strong ×1.5', 'Empty slot', 'None', 'survives', 'Shadow guardian']) expect(en).toContain(text);
    expect(en).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });

  it('follows the island being explored and never names a companion the player does not own', () => {
    const owned = Object.fromEntries(['ember', 'brook', 'breeze', 'moss', 'clover', 'gale', 'raika', 'shiden'].map((id) => [id, { level: 1, copies: 1 }]));
    const save: Save = { ...newSave(), version: 2, cleared: [0], owned, team: ['ember', 'brook'], adventure: { version: 1, region: 1, position: { x: 3, y: 11 }, opened: [], met: [], restored: [] } };
    const html = renderToStaticMarkup(<FortressBriefing save={save} characters={CHARACTERS} language="en" />);
    expect(html).toContain('2. Whispering Woods');
    expect(html).toContain('Water shadows');
    expect(html).toContain('Breeze, Moss, Clover +3 more');
    expect(html).not.toContain('Strong ×1.5');
    for (const absent of ['Luna', 'Sol', 'Mist', 'Fubuki']) expect(html).not.toContain(absent);
    expect(html).toContain('Not cleared yet');
    expect(renderToStaticMarkup(<FortressBriefing save={{ ...save, cleared: [0, 1] }} characters={CHARACTERS} language="en" />)).toContain('· Cleared');
  });
});
