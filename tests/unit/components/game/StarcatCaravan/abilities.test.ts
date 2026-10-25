import { describe, expect, it } from 'vitest';
import { abilityFor } from '@/components/game/StarcatCaravan/abilities';
import { CHARACTERS, STAGES, type Ability, type Character, type Rarity } from '@/components/game/StarcatCaravan/data';
import { applyDamage, catStats, deploy, fireCannon, newSave, parseSave, startBattle, summon, tickBattle, upgrade, type Battle, type Unit } from '@/components/game/StarcatCaravan/engine';

const probe = (ability: Ability): Character => ({ ...CHARACTERS[0], id: 'probe', rarity: 3, hp: 200, attack: 100, defense: 0, ability, abilityName: undefined });
function arena(ability: Ability) {
  const cat = probe(ability); const save = newSave();
  save.owned.probe = { level: 1, copies: 1 }; save.team = ['probe'];
  const battle = deploy(startBattle(save, 0)!, save, 'probe', [cat]);
  battle.spawned = STAGES[0].enemies;
  battle.units[0].x = 50;
  battle.units.push({ ...battle.units[0], key: 90, catId: null, side: 'enemy', x: 55, hp: 2000, maxHp: 2000, attack: 0, cooldown: 99 });
  return { cat, battle };
}
function fourHits(ability: Ability, change?: (battle: Battle) => void) {
  const { cat, battle: initial } = arena(ability); change?.(initial);
  let battle = initial;
  for (let i = 0; i < 4; i++) {
    battle = { ...battle, units: battle.units.map((unit) => unit.catId === 'probe' ? { ...unit, cooldown: 0 } : unit) };
    battle = tickBattle(battle, .1, [cat]);
  }
  return battle;
}

describe('defense, wards and rarity', () => {
  it('applies defense before shielding and expires wards without granting invulnerability', () => {
    const target: Unit = { ...arena('none').battle.units[0], defense: 100, shield: 30, shieldUntil: 6 };
    applyDamage(target, 100, 1);
    expect(target.hp).toBe(180); expect(target.shield).toBe(0);
    target.shield = 30;
    applyDamage(target, 100, 7);
    expect(target.hp).toBe(130); expect(target.shield).toBe(0);
    target.defense = 100000;
    applyDamage(target, 1, 8); expect(target.hp).toBe(129);
    applyDamage(target, 0, 8); expect(target.hp).toBe(129);
  });

  it('makes every higher rarity stronger at identical base stats, levels and copies', () => {
    const characters = ([3, 4, 5] as Rarity[]).map((rarity) => ({ ...probe('none'), id: `rarity-${rarity}`, rarity, defense: 20 }));
    const stats = characters.map((cat) => catStats(cat.id, { level: 1, copies: 1 }, characters));
    expect(stats).toEqual([{ hp: 200, attack: 100, defense: 20 }, { hp: 240, attack: 120, defense: 24 }, { hp: 300, attack: 150, defense: 30 }]);
    expect(catStats('rarity-5', { level: 2, copies: 2 }, characters).defense).toBeGreaterThan(30);
  });

  it('keeps old catalog fields optional with zero defense and normal attacks', () => {
    const cat = { ...probe('none'), defense: undefined, ability: undefined, abilityName: undefined };
    expect(catStats(cat.id, { level: 1, copies: 1 }, [cat]).defense).toBe(0);
    expect(abilityFor(cat).id).toBe('none');
  });

  it('does not add empty shield state to an unshielded companion on every frame', () => {
    const { cat, battle } = arena('none');
    expect(Object.hasOwn(battle.units[0], 'shield')).toBe(false);
    expect(Object.hasOwn(tickBattle(battle, .1, [cat]).units[0], 'shield')).toBe(false);
  });
});

describe('automatic companion abilities', () => {
  it('summons and trains all four new IDs while retaining existing ownership and progress through restore', () => {
    let save = newSave(); save.owned.ember.level = 4; save.cleared = [0]; save.wins = 2;
    for (const id of ['yuki', 'fubuki', 'raika', 'shiden']) {
      const cat = CHARACTERS.find((entry) => entry.id === id)!;
      const pool = CHARACTERS.filter((entry) => entry.rarity === cat.rarity);
      const rolls = [cat.rarity === 5 ? 0 : .1, (pool.findIndex((entry) => entry.id === id) + .1) / pool.length];
      const result = summon(save, 1, () => rolls.shift()!)!;
      expect(result.pulls[0].id).toBe(id);
      save = upgrade(result.save, id);
    }
    save.team = ['yuki', 'fubuki', 'raika', 'shiden'];
    const restored = parseSave(JSON.stringify(save))!;
    expect(restored).toEqual(save); expect(restored.owned.ember.level).toBe(4);
    for (const id of restored.team) expect(restored.owned[id]).toEqual({ level: 2, copies: 1 });
    expect(restored.cleared).toEqual([0]); expect(restored.wins).toBe(2);
  });

  it.each([['yuki', 'fubuki'], ['raika', 'shiden']])('can complete the six islands with a trained new-element party: %j', (...team) => {
    const save = newSave(); save.team = team; save.cleared = [0, 1, 2, 3, 4, 5];
    for (const id of team) save.owned[id] = { level: 20, copies: 1 };
    for (let stage = 0; stage < STAGES.length; stage++) {
      let battle = startBattle(save, stage)!;
      for (let step = 0; step < 1801 && battle.status === 'playing'; step++) {
        if (step % 20 === 0) for (const id of team) battle = deploy(battle, save, id);
        if (battle.units.some((unit) => unit.side === 'enemy' && unit.x < 60)) battle = fireCannon(battle);
        battle = tickBattle(battle);
      }
      expect(battle.status, `Island ${stage + 1}`).toBe('won');
    }
  });

  it('triggers a follow-up on the fourth normal enemy hit only', () => {
    const battle = fourHits('strike');
    expect(battle.units.find((unit) => unit.key === 90)?.hp).toBe(1525);
    expect(battle.skills.map((event) => event.ability)).toEqual(['strike']);
  });

  it('limits splash to its radius and chains to two other targets without applying auras', () => {
    const addTargets = (battle: Battle) => {
      const enemy = battle.units[1];
      battle.units.push(...[66, 70, 72, 90].map((x, i) => ({ ...enemy, key: 91 + i, x })));
    };
    const splash = fourHits('splash', addTargets);
    expect(splash.units.find((unit) => unit.key === 90)?.hp).toBe(1540);
    expect(splash.units.find((unit) => unit.key === 91)?.hp).toBe(1940);
    expect(splash.units.find((unit) => unit.key === 92)?.hp).toBe(2000);
    const chain = fourHits('chain', addTargets);
    for (const key of [91, 92]) { expect(chain.units.find((unit) => unit.key === key)?.hp).toBe(1930); expect(chain.units.find((unit) => unit.key === key)?.aura).toBeUndefined(); }
    expect(chain.units.find((unit) => unit.key === 93)?.hp).toBe(2000);
  });

  it.each([false, true])('freezes attacks and movement, with half the duration for a boss (%s)', (boss) => {
    const battle = fourHits('frost', (before) => { before.units[1].boss = boss; before.units[1].speed = 5; });
    const enemy = battle.units.find((unit) => unit.key === 90)!;
    expect(enemy.frozenUntil! - battle.time).toBeCloseTo(boss ? .5 : 1);
    const frozen = tickBattle({ ...battle, units: battle.units.map((unit) => ({ ...unit, cooldown: 99 })) }, .1, [probe('frost')]);
    expect(frozen.units.find((unit) => unit.key === 90)?.x).toBe(enemy.x);
    expect(battle.skills.map((event) => event.ability)).toEqual(['frost']);
  });

  it('starts support cooldown at deployment, caps wards and does not add overlapping shields', () => {
    const { cat, battle } = arena('ward');
    expect(battle.units[0].skillReadyAt).toBe(10);
    const ally = { ...battle.units[0], key: 91, maxHp: 40, hp: 40, skillReadyAt: 99 };
    battle.units.push(ally, { ...battle.units[0], key: 92 }); battle.time = 9.95;
    const after = tickBattle(battle, .1, [cat]);
    expect(after.units.find((unit) => unit.key === 91)?.shield).toBe(10);
    expect(after.units[0].shield).toBe(16);
    expect(after.units[0].skillReadyAt).toBeCloseTo(20.05);
    expect(after.skills).toHaveLength(2);
    const expired = tickBattle({ ...after, time: 16.1 }, .1, [cat]);
    expect(expired.units[0].shield).toBe(0);
  });

  it('heals all living allies without reviving and does not trigger while paused', () => {
    const { cat, battle } = arena('mend'); battle.time = 9.95;
    battle.units.push({ ...battle.units[0], key: 91, hp: 10, maxHp: 100, skillReadyAt: 99 }, { ...battle.units[0], key: 92, hp: 0 });
    expect(tickBattle({ ...battle, paused: true }, .1, [cat]).skills).toEqual([]);
    const after = tickBattle(battle, .1, [cat]);
    expect(after.units.find((unit) => unit.key === 91)?.hp).toBe(90);
    expect(after.units.some((unit) => unit.key === 92)).toBe(false);
    expect(after.skills.map((event) => event.ability)).toEqual(['mend']);
  });
});
