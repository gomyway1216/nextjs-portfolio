import { describe, expect, it } from 'vitest';
import { GUEST, type Player } from '@/components/game/MedalPusher/account';
import { CHARACTERS, SAVE_KEY, characterById, type Character } from '@/components/game/StarcatCaravan/data';
import { catStats, deploy, gameReducer, initialGame, newSave, parseSave, startBattle } from '@/components/game/StarcatCaravan/engine';
import { createProgress } from '@/components/game/StarcatCaravan/progress';
import { FakeAccounts, FakeSlots, settled, signedIn } from '../MedalPusher/accountFakes';

const catalog = () => structuredClone(CHARACTERS);
const newcomer = (): Character => ({
  ...structuredClone(CHARACTERS[3]), id: 'nova', rarity: 5,
  name: { ja: 'ノヴァ', en: 'Nova' }, title: { ja: '新星の薬師', en: 'Newstar herbalist' },
  hp: 200, attack: 40, cost: 50,
});

function rig() {
  const slots = new FakeSlots();
  const now = () => Date.UTC(2026, 9, 25);
  const accounts = new FakeAccounts(now);
  let marks = 0;
  const start = async (characters: Character[], player: Player = GUEST) => {
    const progress = createProgress({ characters, store: accounts.store, slots: () => slots, now, mark: () => `catalog-${++marks}` });
    progress.attend(player);
    progress.start();
    await settled();
    return progress;
  };
  return { slots, accounts, start };
}

describe('runtime character catalogs', () => {
  it('uses edited names and combat stats per instance while preserving owned levels and copies', () => {
    const before = JSON.stringify(CHARACTERS);
    const first = catalog();
    const second = catalog();
    first[0] = { ...first[0], name: { ja: '新しいコハク', en: 'Ember renamed' }, hp: 900, attack: 80 };
    second[0] = { ...second[0], hp: 100, attack: 10 };
    const save = newSave();
    save.owned.ember = { level: 4, copies: 3 };
    const raw = JSON.stringify(save);
    expect(parseSave(raw, first)).toEqual(save);
    expect(characterById('ember', first).name.en).toBe('Ember renamed');
    const expectedMultiplier = (1 + 3 * 0.14) * (1 + 2 * 0.04);
    expect(catStats('ember', save.owned.ember, first)).toEqual({ hp: Math.round(900 * expectedMultiplier), attack: Math.round(80 * expectedMultiplier) });
    const battle = startBattle(save, 0)!;
    const firstUnit = deploy(battle, save, 'ember', first).units[0];
    const secondUnit = deploy(battle, save, 'ember', second).units[0];
    expect(firstUnit.maxHp).toBe(Math.round(900 * expectedMultiplier));
    expect(secondUnit.maxHp).toBe(Math.round(100 * expectedMultiplier));
    expect(save.owned.ember).toEqual({ level: 4, copies: 3 });
    expect(JSON.stringify(CHARACTERS)).toBe(before);
  });

  it('summons, trains, fields, and restores a newly added companion without resetting old progress', () => {
    const characters = [...catalog(), newcomer()];
    let state = initialGame();
    state.save.owned.ember = { level: 3, copies: 4 };
    state.save.cleared = [0];
    state.save.wins = 2;
    state = gameReducer(state, { type: 'summon', count: 1, rolls: [0, 0.999] }, characters);
    expect(state.pulls[0].id).toBe('nova');
    state = gameReducer(state, { type: 'close-pulls' }, characters);
    state = gameReducer(state, { type: 'upgrade', id: 'nova' }, characters);
    state = gameReducer(state, { type: 'team', id: 'breeze' }, characters);
    state = gameReducer(state, { type: 'team', id: 'nova' }, characters);
    expect(state.save).toMatchObject({ gems: 2900, coins: 540, pulls: 1, pityFive: 0, pityFour: 0, wins: 2, cleared: [0] });
    expect(state.save.owned.ember).toEqual({ level: 3, copies: 4 });
    expect(state.save.owned.nova).toEqual({ level: 2, copies: 1 });
    expect(parseSave(JSON.stringify(state.save), characters)).toEqual(state.save);
    state = gameReducer(state, { type: 'start', stage: 1 }, characters);
    state = gameReducer(state, { type: 'deploy', id: 'nova' }, characters);
    state = gameReducer(state, { type: 'tick' }, characters);
    // The added Wind companion joins the existing Wind members, so resonance applies.
    expect(state.battle?.units[0]).toMatchObject({ catId: 'nova', maxHp: 274, attack: 53 });
    expect(state.battle?.time).toBe(0.1);
  });

  it('preserves a newer guest journal when an offline catalog lacks its companion, then opens it with the new catalog', async () => {
    const { slots, start } = rig();
    const expanded = [...catalog(), newcomer()];
    const saved = newSave();
    saved.gems = 1789;
    saved.coins = 321;
    saved.owned.nova = { level: 7, copies: 4 };
    saved.team = ['brook', 'nova'];
    saved.cleared = [0, 1];
    const raw = JSON.stringify(saved);
    slots.setItem(SAVE_KEY, raw);
    const older = await start(catalog());
    expect(older.getSnapshot()).toMatchObject({ ready: true, playable: false, catalogMissing: true, game: { save: saved } });
    older.dispatch({ type: 'upgrade', id: 'brook' });
    older.save('hidden');
    older.close();
    expect(slots.getItem(SAVE_KEY)).toBe(raw);
    const current = await start(expanded);
    expect(current.getSnapshot()).toMatchObject({ playable: true, catalogMissing: false, game: { save: saved } });
    current.close();
  });

  it.each(['existing', 'missing'] as const)('preserves a newer cached account journal when the cloud copy is %s', async (cloud) => {
    const { accounts, start } = rig();
    const expanded = [...catalog(), newcomer()];
    const saved = newSave();
    saved.gems = 1234;
    saved.owned.nova = { level: 9, copies: 2 };
    saved.team = ['nova'];
    accounts.put('member', JSON.stringify(saved), 'newer-device');
    const first = await start(expanded, signedIn('member'));
    first.close();
    await settled();
    if (cloud === 'missing') accounts.docs.delete('member');
    const older = await start(catalog(), signedIn('member'));
    expect(older.getSnapshot()).toMatchObject({ playable: false, catalogMissing: true, game: { save: saved } });
    older.dispatch({ type: 'summon', count: 1, rolls: [0.9, 0] });
    older.close();
    await settled();
    expect(parseSave(accounts.text('member'), expanded)).toEqual(saved);
    const current = await start(expanded, signedIn('member'));
    expect(current.getSnapshot()).toMatchObject({ playable: true, game: { save: saved } });
    current.close();
  });

  it('protects malformed local data instead of replacing it with a fresh journal', async () => {
    const { slots, accounts, start } = rig();
    const raw = '{unreadable journal';
    slots.setItem(SAVE_KEY, raw);
    const progress = await start(catalog());
    expect(progress.getSnapshot()).toMatchObject({ ready: false, playable: false, recovered: true });
    progress.dispatch({ type: 'summon', count: 1, rolls: [0, 0] });
    progress.save('hidden');
    progress.close();
    await settled();
    expect(slots.getItem(SAVE_KEY)).toBe(raw);
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
  });
});
