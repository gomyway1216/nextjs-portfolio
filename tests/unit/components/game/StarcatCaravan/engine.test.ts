import { describe, expect, it } from 'vitest';
import { CHARACTERS, MAX_LEVEL, STAGES, characterById } from '@/components/game/StarcatCaravan/data';
import { battleReward, catStats, deploy, elementMultiplier, fireCannon, gameReducer, initialGame, newSave, parseSave, startBattle, summon, tickBattle, toggleTeam, upgrade, upgradeCost, type Battle, type Save } from '@/components/game/StarcatCaravan/engine';

function sequence(...values: number[]) {
  let index = 0;
  return () => values[index++ % values.length];
}

function playStage(save: Save, stage: number): Battle {
  let battle = startBattle(save, stage)!;
  for (let step = 0; step < 1801 && battle.status === 'playing'; step++) {
    // A simple player: lead with a shield, add damage and healing, fire when enemies approach.
    const order = ['brook', 'ember', 'breeze', 'moss'].filter((id) => save.team.includes(id));
    if (step % 20 === 0) {
      for (const id of order) battle = deploy(battle, save, id);
    }
    if (battle.units.some((unit) => unit.side === 'enemy' && unit.x < 60)) battle = fireCannon(battle);
    battle = tickBattle(battle);
  }
  return battle;
}

describe('starcat wishes', () => {
  it.each([[0, 5], [0.0299, 5], [0.03, 4], [0.1799, 4], [0.18, 3], [0.999, 3]])('uses the published rarity boundary %s → ★%s', (roll, rarity) => {
    const result = summon(newSave(), 1, sequence(roll, 0))!;
    expect(characterById(result.pulls[0].id).rarity).toBe(rarity);
    expect(result.save.gems).toBe(2900);
  });
  it('guarantees a ★4+ within ten single wishes, including across reloads', () => {
    let save = newSave();
    const rarities: number[] = [];
    for (let i = 0; i < 10; i++) {
      const result = summon(save, 1, sequence(0.9, 0))!;
      save = parseSave(JSON.stringify(result.save))!;
      rarities.push(characterById(result.pulls[0].id).rarity);
    }
    expect(rarities).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 4]);
    expect(save.pityFour).toBe(0);
    expect(save.pityFive).toBe(10);
  });
  it('shares guarantees between single and ten pulls, with ★5 taking precedence', () => {
    const save = { ...newSave(), pityFive: 49, pityFour: 9 };
    const result = summon(save, 10, sequence(0.99, 0))!;
    expect(characterById(result.pulls[0].id).rarity).toBe(5);
    expect(result.save.pityFive).toBe(9);
    expect(result.save.pityFour).toBe(9);
    expect(result.save.gems).toBe(2000);
    expect(result.save.pulls).toBe(10);
    expect(characterById(summon(result.save, 1, sequence(0.99, 0))!.pulls[0].id).rarity).toBe(4);
  });
  it('resets each counter on an early natural rarity hit', () => {
    const four = summon({ ...newSave(), pityFour: 8, pityFive: 32 }, 1, sequence(0.1, 0))!.save;
    expect(four.pityFour).toBe(0);
    expect(four.pityFive).toBe(33);
    const five = summon(four, 1, sequence(0.01, 0))!.save;
    expect(five.pityFour).toBe(0);
    expect(five.pityFive).toBe(0);
  });
  it('refuses insufficient currency without changing the source save', () => {
    const save = { ...newSave(), gems: 999 };
    const before = structuredClone(save);
    expect(summon(save, 10)).toBeNull();
    expect(save).toEqual(before);
    expect(summon({ ...save, gems: 99 }, 1)).toBeNull();
  });
  it('converts duplicate pulls to copies and the advertised coins without mutating the old save', () => {
    const save = newSave();
    const result = summon(save, 1, sequence(0.9, 0))!;
    expect(result.pulls[0]).toEqual({ id: 'ember', isNew: false, coins: 80 });
    expect(result.save.owned.ember.copies).toBe(2);
    expect(result.save.coins).toBe(680);
    expect(save.owned.ember.copies).toBe(1);
    const rare = summon(save, 1, sequence(0.01, 0))!;
    expect(rare.pulls[0]).toEqual({ id: 'luna', isNew: true, coins: 0 });
    expect(summon(rare.save, 1, sequence(0.01, 0))!.save.coins).toBe(920);
  });
  it('a ten-pull has exactly the same result as ten individual pulls', () => {
    const randomBatch = sequence(0.95, 0.9, 0.1, 0.8, 0.04, 0.01);
    const randomSingle = sequence(0.95, 0.9, 0.1, 0.8, 0.04, 0.01);
    const batch = summon(newSave(), 10, randomBatch)!;
    let single = newSave();
    for (let i = 0; i < 10; i++) single = summon(single, 1, randomSingle)!.save;
    expect(single).toEqual(batch.save);
  });
  it('selects every character from the corresponding equally spaced pool', () => {
    for (const rarity of [3, 4, 5]) {
      const pool = CHARACTERS.filter((cat) => cat.rarity === rarity);
      pool.forEach((cat, index) => expect(summon(newSave(), 1, sequence(rarity === 5 ? 0 : rarity === 4 ? 0.1 : 0.9, (index + 0.5) / pool.length))!.pulls[0].id).toBe(cat.id));
    }
  });
});

describe('progress, training, and party', () => {
  it('round trips a complete save and rejects corrupt, future, and malformed data', () => {
    const save = newSave();
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    for (const raw of [null, '', '{', 'null', '[]', JSON.stringify({ ...save, version: 2 }), JSON.stringify({ ...save, gems: -1 }), JSON.stringify({ ...save, coins: 1.5 }), JSON.stringify({ ...save, pityFive: 50 }), JSON.stringify({ ...save, pityFour: 10 }), JSON.stringify({ ...save, team: ['missing'] }), JSON.stringify({ ...save, team: ['ember', 'ember'] }), JSON.stringify({ ...save, team: [] }), JSON.stringify({ ...save, team: ['toString'] }), JSON.stringify({ ...save, cleared: [1] }), JSON.stringify({ ...save, cleared: [0, 0] }), JSON.stringify({ ...save, cleared: [6] }), JSON.stringify({ ...save, owned: { ember: { level: 21, copies: 1 } } }), JSON.stringify({ ...save, owned: { ember: { level: 1, copies: 0 } } })]) expect(parseSave(raw)).toBeNull();
  });
  it.each([3, 4, 5] as const)('keeps existing progress and makes an added ★%s companion summonable without a save reset', (rarity) => {
    const existing: Save = {
      ...newSave(),
      gems: 1725,
      coins: 930,
      owned: { ...newSave().owned, ember: { level: 7, copies: 4 }, luna: { level: 12, copies: 3 } },
      team: ['luna', 'moss', 'ember'],
      cleared: [0, 1, 2],
      pityFive: 37,
      pityFour: 6,
      pulls: 87,
      wins: 14,
      losses: 3,
    };
    const journalBeforeUpdate = JSON.stringify(existing);
    const originalCatalog = [...CHARACTERS];
    const added = { ...structuredClone(CHARACTERS.find((cat) => cat.rarity === rarity)!), id: `future-companion-${rarity}` };
    try {
      CHARACTERS.push(added);
      const restored = parseSave(journalBeforeUpdate)!;
      expect(restored).toEqual(existing);
      expect(restored.owned).not.toHaveProperty(added.id);

      const result = summon(restored, 1, sequence(rarity === 5 ? 0.01 : rarity === 4 ? 0.1 : 0.9, 0.999))!;
      expect(result.pulls).toEqual([{ id: added.id, isNew: true, coins: 0 }]);
      expect(result.save).toEqual({
        ...existing,
        gems: existing.gems - 100,
        owned: { ...existing.owned, [added.id]: { level: 1, copies: 1 } },
        pityFive: rarity === 5 ? 0 : existing.pityFive + 1,
        pityFour: rarity >= 4 ? 0 : existing.pityFour + 1,
        pulls: existing.pulls + 1,
      });
      expect(parseSave(JSON.stringify(result.save))).toEqual(result.save);
      expect(restored).toEqual(existing);
    } finally {
      CHARACTERS.splice(0, CHARACTERS.length, ...originalCatalog);
    }
  });
  it('spends coins to train and never passes max level or trains an unowned cat', () => {
    const save = newSave();
    const next = upgrade(save, 'ember');
    expect(next.owned.ember.level).toBe(2);
    expect(next.coins).toBe(save.coins - upgradeCost(1));
    expect(save.owned.ember.level).toBe(1);
    expect(upgrade(save, 'luna')).toBe(save);
    expect(upgrade({ ...save, coins: 0 }, 'ember').owned.ember.level).toBe(1);
    expect(upgrade({ ...save, owned: { ...save.owned, ember: { level: MAX_LEVEL, copies: 1 } } }, 'ember').owned.ember.level).toBe(MAX_LEVEL);
  });
  it('caps awakening at five duplicates but leaves every additional coin reward intact', () => {
    expect(catStats('ember', { level: 1, copies: 6 })).toEqual(catStats('ember', { level: 1, copies: 100 }));
    expect(catStats('ember', { level: 1, copies: 6 }).attack).toBe(36);
    expect(catStats('ember', { level: 2, copies: 1 }).hp).toBe(205);
  });
  it('allows only owned characters, up to four, with at least one left in the team', () => {
    const save = newSave();
    expect(toggleTeam(save, 'luna')).toBe(save);
    const ownsLuna = { ...save, owned: { ...save.owned, luna: { level: 1, copies: 1 } } };
    expect(toggleTeam(ownsLuna, 'luna')).toBe(ownsLuna);
    const freeSlot = toggleTeam(ownsLuna, 'ember');
    expect(toggleTeam(freeSlot, 'luna').team).toEqual(['brook', 'breeze', 'moss', 'luna']);
    expect(toggleTeam({ ...save, team: ['ember'] }, 'ember').team).toEqual(['ember']);
  });
});

describe('island battles', () => {
  it('enforces campaign unlocks and valid stage bounds', () => {
    expect(startBattle(newSave(), 0)).not.toBeNull();
    for (const index of [-1, 0.5, 1, 5, 6, NaN]) expect(startBattle(newSave(), index)).toBeNull();
    expect(startBattle({ ...newSave(), cleared: [0] }, 1)).not.toBeNull();
  });
  it('charges deployment energy, respects cooldowns, team membership, pause, and the unit cap', () => {
    const save = newSave();
    const start = startBattle(save, 0)!;
    const next = deploy(start, save, 'ember');
    expect(next.energy).toBe(55);
    expect(next.units).toHaveLength(1);
    expect(start.units).toHaveLength(0);
    expect(deploy(next, save, 'ember')).toBe(next);
    expect(deploy(next, save, 'luna')).toBe(next);
    const broke = { ...start, energy: 0 };
    expect(deploy(broke, save, 'ember')).toBe(broke);
    const paused = { ...start, paused: true };
    expect(deploy(paused, save, 'ember')).toBe(paused);
    const full = { ...start, units: Array.from({ length: 16 }, (_, index) => ({ ...next.units[0], key: index })) };
    expect(deploy(full, save, 'ember')).toBe(full);
  });
  it('regenerates energy and cooldowns without changing the previous state, and freezes when paused', () => {
    const save = newSave();
    const before = deploy(startBattle(save, 0)!, save, 'ember');
    const snapshot = structuredClone(before);
    const next = tickBattle(before);
    expect(next.energy).toBeCloseTo(56.4);
    expect(next.cooldowns.ember).toBeCloseTo(2.9);
    expect(before).toEqual(snapshot);
    const paused = { ...next, paused: true };
    expect(tickBattle(paused)).toBe(paused);
    expect(tickBattle(before, NaN)).toBe(before);
  });
  it('uses the cyclic element advantage and lets healers restore living allies', () => {
    expect(elementMultiplier('fire', 'wind')).toBe(1.5);
    expect(elementMultiplier('wind', 'water')).toBe(1.5);
    expect(elementMultiplier('water', 'fire')).toBe(1.5);
    expect(elementMultiplier('water', 'wind')).toBe(1);
    const save = newSave();
    let battle = deploy(startBattle(save, 0)!, save, 'ember');
    battle = deploy({ ...battle, energy: 200 }, save, 'moss');
    battle.units[0].hp = 50;
    const healed = tickBattle(battle);
    // Breeze + Moss now grant Wind resonance: round(18 × 1.15) = 21 healing.
    expect(healed.units[0].hp).toBe(71);
    expect(healed.units[1].cooldown).toBe(1);
  });
  it('cannon damages enemies only, requires charge and pause protection', () => {
    let battle = startBattle(newSave(), 0)!;
    for (let i = 0; i < 30; i++) battle = tickBattle(battle);
    battle = deploy(battle, newSave(), 'ember');
    const next = fireCannon(battle);
    expect(next.units.filter((unit) => unit.side === 'enemy')).toHaveLength(0);
    expect(next.units.find((unit) => unit.side === 'ally')?.hp).toBe(180);
    expect(next.cannon).toBe(0);
    expect(fireCannon(next)).toBe(next);
    const paused = { ...battle, paused: true };
    expect(fireCannon(paused)).toBe(paused);
  });
  it('loses an undefended battle, with no currency penalty or reward', () => {
    let battle = startBattle(newSave(), 0)!;
    for (let i = 0; i < 1801 && battle.status === 'playing'; i++) battle = tickBattle(battle);
    expect(battle.status).toBe('lost');
    expect(battleReward(newSave(), battle)).toEqual({ gems: 0, coins: 0, first: false });
    expect(tickBattle(battle)).toBe(battle);
  });
  it('the starting common team can win the first island without any wishes or training', () => {
    const battle = playStage(newSave(), 0);
    expect(battle.status).toBe('won');
    expect(battle.time).toBeLessThan(150);
    expect(battleReward(newSave(), battle)).toEqual({ gems: 500, coins: 250, first: true });
    expect(battleReward({ ...newSave(), cleared: [0] }, battle)).toEqual({ gems: 80, coins: 120, first: false });
  });
  it.each(STAGES.map((_, index) => index))('island %s is winnable with a trained common team, without rare pulls', (stage) => {
    const save = newSave();
    save.cleared = Array.from({ length: stage }, (_, index) => index);
    for (const cat of Object.values(save.owned)) cat.level = Math.min(20, 1 + stage * 3);
    expect(playStage(save, stage).status).toBe('won');
  });
  it('commits first-clear rewards only once, even with repeated timer callbacks', () => {
    const state = initialGame();
    state.battle = { ...startBattle(state.save, 0)!, enemyHp: 0 };
    const finished = gameReducer(state, { type: 'tick' });
    expect(finished.save.gems).toBe(3500);
    expect(finished.save.coins).toBe(850);
    expect(finished.save.cleared).toEqual([0]);
    expect(finished.save.wins).toBe(1);
    expect(gameReducer(finished, { type: 'tick' })).toBe(finished);
    const replay = { ...finished, battle: { ...startBattle(finished.save, 0)!, enemyHp: 0 } };
    expect(gameReducer(replay, { type: 'tick' }).save.gems).toBe(3580);
  });
  it('prevents training, party edits, and repeated summon clicks while their results are displayed', () => {
    const initial = initialGame();
    const result = gameReducer(initial, { type: 'summon', count: 10, rolls: Array(20).fill(0.9) });
    expect(result.pulls).toHaveLength(10);
    expect(gameReducer(result, { type: 'summon', count: 10, rolls: Array(20).fill(0.9) })).toBe(result);
    expect(gameReducer(initial, { type: 'summon', count: 1, rolls: [NaN, 0] })).toBe(initial);
    const active = gameReducer(initial, { type: 'start', stage: 0 });
    expect(gameReducer(active, { type: 'upgrade', id: 'ember' })).toBe(active);
    expect(gameReducer(active, { type: 'team', id: 'ember' })).toBe(active);
    expect(gameReducer(active, { type: 'summon', count: 1, rolls: [0.9, 0] })).toBe(active);
    expect(gameReducer(active, { type: 'start', stage: 0 })).toBe(active);
    expect(gameReducer(active, { type: 'leave' }).save).toEqual(initial.save);
  });
});
