import { describe, expect, it } from 'vitest';
import { deploy, gameReducer, initialGame, newSave, parseSave, startBattle, summon, toggleTeam, upgrade } from '@/components/game/StarcatCaravan/engine';

describe('Starcat ownership boundaries', () => {
  it.each(['constructor', 'toString', '__proto__', 'prototype'])('never treats %s as an owned companion', (id) => {
    const save = { ...newSave(), team: ['ember'] };
    const before = structuredClone(save);
    expect(upgrade(save, id)).toBe(save);
    expect(toggleTeam(save, id)).toBe(save);
    for (const type of ['upgrade', 'team'] as const) {
      const state = { ...initialGame(), save };
      expect(gameReducer(state, { type, id })).toEqual(state);
    }
    expect(save).toEqual(before);
    expect(parseSave(JSON.stringify(save))).toEqual(before);
    expect(Number.isFinite(save.coins)).toBe(true);

    // Even a forged party must be rejected before looking up the character definition.
    const forged = { ...save, team: ['ember', id] };
    const battle = startBattle(forged, 0)!;
    expect(deploy(battle, forged, id)).toBe(battle);
    const active = { ...initialGame(), save: forged, battle };
    expect(gameReducer(active, { type: 'deploy', id })).toEqual(active);
    expect(battle.units).toHaveLength(0);
    expect(battle.energy).toBe(100);
  });

  it('requires own inventory entries even for a real companion inherited from a prototype', () => {
    const save = newSave();
    Object.setPrototypeOf(save.owned, { luna: { level: 20, copies: 6 } });
    expect(upgrade(save, 'luna')).toBe(save);
    const freeSlot = { ...save, team: ['ember'] };
    expect(toggleTeam(freeSlot, 'luna')).toBe(freeSlot);
    const forged = { ...save, team: ['ember', 'luna'] };
    const battle = startBattle(forged, 0)!;
    expect(deploy(battle, forged, 'luna')).toBe(battle);

    const result = summon(save, 1, () => 0)!;
    expect(result.pulls).toEqual([{ id: 'luna', isNew: true, coins: 0 }]);
    expect(result.save.owned.luna).toEqual({ level: 1, copies: 1 });
    expect(result.save.coins).toBe(save.coins);
    expect(Object.hasOwn(save.owned, 'luna')).toBe(false);
    expect(parseSave(JSON.stringify(result.save))).toEqual(result.save);
  });
});
