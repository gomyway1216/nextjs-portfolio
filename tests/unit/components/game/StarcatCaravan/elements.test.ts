import { describe, expect, it } from 'vitest';
import { CHARACTERS, STAGES, type Character, type Element } from '@/components/game/StarcatCaravan/data';
import { REACTIONS, partyElements, reactionFor } from '@/components/game/StarcatCaravan/elements';
import { catStats, deploy, fireCannon, newSave, parseSave, startBattle, tickBattle, type Battle, type Unit } from '@/components/game/StarcatCaravan/engine';

const cats: Character[] = (['fire', 'water', 'wind'] as const).map((element) => ({ ...CHARACTERS[0], id: `test-${element}`, element, role: 'fighter' }));
const unit = (element: Element, key: number): Unit => ({ key, catId: `test-${element}`, side: 'ally', x: 50, hp: 100, maxHp: 200, attack: 100, range: 10, speed: 0, element, cooldown: 0, flash: 0, boss: false });
function arena(elements: Element[]): Battle {
  const battle = startBattle(newSave(), 0)!;
  return { ...battle, time: 10, spawned: STAGES[0].enemies, nextKey: 100, units: [...elements.map((element, index) => unit(element, index + 1)), { ...unit('water', 90), catId: null, side: 'enemy', x: 55, hp: 2000, maxHp: 2000, attack: 0, cooldown: 99 }] };
}

describe('element reactions, with no required roles', () => {
  it.each(Object.keys(REACTIONS) as (keyof typeof REACTIONS)[])('combines both attack orders for %s and preserves the previous battle', (id) => {
    const [first, second] = REACTIONS[id].elements;
    for (const order of [[first, second], [second, first]]) {
      const before = arena(order);
      const frozen = JSON.stringify(before);
      const after = tickBattle(before, 0.1, cats);
      expect(after.reactions.map((event) => event.kind)).toEqual([id]);
      expect(after.units.find((entry) => entry.side === 'enemy')?.aura).toBeUndefined();
      expect(JSON.stringify(before)).toBe(frozen);
    }
    expect(reactionFor(first, first)).toBeNull();
  });

  it('adds steam damage separately from the normal weakness multiplier', () => {
    const after = tickBattle(arena(['fire', 'water']), 0.1, cats);
    expect(after.units.find((entry) => entry.side === 'enemy')?.hp).toBe(2000 - 100 - 100 - 75);
  });

  it('spreads fire damage to nearby enemies only, without recursive auras', () => {
    const before = arena(['fire', 'wind']);
    const enemy = before.units.at(-1)!;
    before.units.push({ ...enemy, key: 91, x: 68 }, { ...enemy, key: 92, x: 70 }, { ...unit('fire', 93), cooldown: 99 });
    const after = tickBattle(before, 0.1, cats);
    expect(after.units.find((entry) => entry.key === 90)?.hp).toBe(2000 - 100 - 150 - 50);
    expect(after.units.find((entry) => entry.key === 91)?.hp).toBe(1950);
    expect(after.units.find((entry) => entry.key === 92)?.hp).toBe(2000);
    expect(after.units.find((entry) => entry.key === 93)?.hp).toBe(100);
    expect(after.units.find((entry) => entry.key === 91)?.aura).toBeUndefined();
  });

  it('lets a party without healers heal all living allies, capping HP and never reviving', () => {
    const before = arena(['water', 'wind']);
    before.units.push({ ...unit('fire', 80), x: 9, hp: 190, cooldown: 99 }, { ...unit('fire', 81), hp: 0 });
    const after = tickBattle(before, 0.1, cats);
    expect(after.units.find((entry) => entry.key === 1)?.hp).toBe(150);
    expect(after.units.find((entry) => entry.key === 80)?.hp).toBe(200);
    expect(after.units.some((entry) => entry.key === 81)).toBe(false);
  });

  it('does not react to the native enemy element, same-element hits or expired auras', () => {
    expect(tickBattle(arena(['fire']), 0.1, cats).reactions).toEqual([]);
    expect(tickBattle(arena(['fire', 'fire']), 0.1, cats).reactions).toEqual([]);
    const before = arena(['water']);
    Object.assign(before.units.at(-1)!, { aura: 'fire', auraUntil: 10 });
    const after = tickBattle(before, 0.1, cats);
    expect(after.reactions).toEqual([]);
    expect(after.units.at(-1)?.aura).toBe('water');
  });

  it('consumes the aura and enforces a two-second per-enemy cooldown against a burst of units', () => {
    const before = arena(['fire', 'water', 'wind', 'fire']);
    const after = tickBattle(before, 0.1, cats);
    expect(after.reactions).toHaveLength(1);
    const enemy = after.units.find((entry) => entry.side === 'enemy')!;
    expect(enemy.reactionReadyAt).toBeCloseTo(12.1);
    expect(enemy.aura).toBeUndefined();
    const retry = { ...after, units: after.units.map((entry) => ({ ...entry, cooldown: entry.side === 'ally' ? 0 : 99 })) };
    expect(tickBattle(retry, 0.1, cats).reactions).toHaveLength(1);
    const ready = { ...retry, time: 12.1 };
    expect(tickBattle(ready, 0.1, cats).reactions.map((event) => event.kind)).toEqual(['steam']);
  });

  it('keeps reactions paused and does not apply new elements through the cannon', () => {
    const before = arena(['fire']); before.paused = true;
    expect(tickBattle(before, 0.1, cats)).toBe(before);
    expect(fireCannon({ ...before, paused: false }).units.at(-1)?.aura).toBeUndefined();
  });
});

describe('same-element resonance and compatible progress', () => {
  it('counts distinct selected IDs, supports DB-added characters, and never stacks extra slots', () => {
    expect(partyElements(['ember', 'ember', 'unknown']).resonances).toEqual([]);
    const added = { ...CHARACTERS[0], id: 'new-fire' };
    expect(partyElements(['ember', 'spark', added.id], [...CHARACTERS, added]).resonances).toEqual(['fire']);
    expect(partyElements(['ember', 'spark', 'brook', 'breeze']).reactions).toHaveLength(3);
  });

  it('applies resonance after saved levels and copies, only to the matching element', () => {
    const save = newSave(); save.owned.spark = { level: 3, copies: 2 }; save.team = ['ember', 'spark', 'brook'];
    const restored = parseSave(JSON.stringify(save))!;
    const battle = { ...startBattle(restored, 0)!, energy: 200 };
    const stats = catStats('spark', restored.owned.spark);
    const deployed = deploy(battle, restored, 'spark').units[0];
    expect(deployed.hp).toBe(Math.round(stats.hp * 1.2));
    expect(deployed.attack).toBe(Math.round(stats.attack * 1.15));
    expect(deploy(battle, restored, 'brook').units[0].hp).toBe(catStats('brook', restored.owned.brook).hp);
    expect(restored).toEqual(save);
  });

  it.each([['ember'], ['breeze', 'pearl'], ['ember', 'spark']])('allows %j without a guard or healer slot', (...team) => {
    const save = newSave(); save.team = team;
    for (const id of team) save.owned[id] ??= { level: 1, copies: 1 };
    const battle = startBattle(save, 0)!;
    expect(battle.status).toBe('playing');
    expect(deploy(battle, save, team[0]).units[0].catId).toBe(team[0]);
  });

  it.each([['ember', 'spark'], ['pearl', 'breeze']])('can clear every island with a trained %j party and no guard or healer', (...team) => {
    const save = newSave(); save.team = team; save.cleared = [0, 1, 2, 3, 4, 5];
    for (const id of team) save.owned[id] = { level: 20, copies: 1 };
    for (let stage = 0; stage < STAGES.length; stage++) {
      let battle = startBattle(save, stage)!;
      for (let step = 0; step < 1801 && battle.status === 'playing'; step++) {
        if (step % 20 === 0) for (const id of team) battle = deploy(battle, save, id);
        if (battle.units.some((entry) => entry.side === 'enemy' && entry.x < 60)) battle = fireCannon(battle);
        battle = tickBattle(battle);
      }
      expect(battle.status, `Island ${stage + 1}: ${team.join('/')}`).toBe('won');
    }
  });
});
