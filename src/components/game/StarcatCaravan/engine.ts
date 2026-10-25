import { CHARACTERS, MAX_LEVEL, PITY_FIVE, PITY_FOUR, STAGES, SUMMON_COST, characterById, type Character, type Element, type Rarity } from './data';

export interface OwnedCat { level: number; copies: number }
export interface Save {
  version: 1;
  gems: number;
  coins: number;
  owned: Record<string, OwnedCat>;
  team: string[];
  cleared: number[];
  pityFive: number;
  pityFour: number;
  pulls: number;
  wins: number;
  losses: number;
}
export interface Pull { id: string; isNew: boolean; coins: number }

export function newSave(): Save {
  const team = ['ember', 'brook', 'breeze', 'moss'];
  return { version: 1, gems: 3000, coins: 600, owned: Object.fromEntries(team.map((id) => [id, { level: 1, copies: 1 }])), team, cleared: [], pityFive: 0, pityFour: 0, pulls: 0, wins: 0, losses: 0 };
}

const whole = (value: unknown, max = 1_000_000_000): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

/** Validate browser data before it can enter either the economy or the battle. */
export function parseSave(raw: string | null, characters: readonly Character[] = CHARACTERS, allowUnknownCharacters = false): Save | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !['gems', 'coins', 'pulls', 'wins', 'losses'].every((key) => whole(value[key])) || !whole(value.pityFive, PITY_FIVE - 1) || !whole(value.pityFour, PITY_FOUR - 1)) return null;
    if (!value.owned || typeof value.owned !== 'object' || Array.isArray(value.owned)) return null;
    const owned: Record<string, OwnedCat> = {};
    for (const [id, cat] of Object.entries(value.owned)) {
      if ((!allowUnknownCharacters && !characters.some((entry) => entry.id === id)) || !/^[a-z][a-z0-9-]{0,47}$/.test(id) || ['constructor', 'prototype'].includes(id) || !cat || typeof cat !== 'object') return null;
      const item = cat as OwnedCat;
      if (!whole(item.level, MAX_LEVEL) || item.level < 1 || !whole(item.copies) || item.copies < 1) return null;
      owned[id] = { level: item.level, copies: item.copies };
    }
    if (!Array.isArray(value.team) || value.team.length < 1 || value.team.length > 4 || new Set(value.team).size !== value.team.length || !value.team.every((id: unknown) => typeof id === 'string' && Object.hasOwn(owned, id))) return null;
    if (!Array.isArray(value.cleared) || new Set(value.cleared).size !== value.cleared.length || !value.cleared.every((stage: unknown) => whole(stage, STAGES.length - 1))) return null;
    // Campaign unlocks form a contiguous prefix, never a jump to an unplayed island.
    const cleared = [...value.cleared].sort((a, b) => a - b);
    if (cleared.some((stage, index) => stage !== index)) return null;
    return { version: 1, gems: value.gems, coins: value.coins, owned, team: [...value.team], cleared, pityFive: value.pityFive, pityFour: value.pityFour, pulls: value.pulls, wins: value.wins, losses: value.losses };
  } catch { return null; }
}

export function summon(save: Save, count: 1 | 10, random: () => number = Math.random, characters: readonly Character[] = CHARACTERS): { save: Save; pulls: Pull[] } | null {
  if ((count !== 1 && count !== 10) || save.gems < count * SUMMON_COST) return null;
  const next: Save = { ...save, gems: save.gems - count * SUMMON_COST, owned: { ...save.owned }, pulls: save.pulls + count };
  const pulls: Pull[] = [];
  for (let i = 0; i < count; i++) {
    const roll = random();
    // The 5-star guarantee takes precedence; a 5-star also satisfies the 4-star guarantee.
    const rarity: Rarity = next.pityFive >= PITY_FIVE - 1 || roll < 0.03 ? 5 : next.pityFour >= PITY_FOUR - 1 || roll < 0.18 ? 4 : 3;
    const pool = characters.filter((cat) => cat.rarity === rarity);
    const cat = pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
    const previous = next.owned[cat.id];
    const coins = previous ? ({ 3: 80, 4: 160, 5: 320 }[rarity]) : 0;
    next.owned[cat.id] = { level: previous?.level ?? 1, copies: (previous?.copies ?? 0) + 1 };
    next.coins += coins;
    next.pityFive = rarity === 5 ? 0 : next.pityFive + 1;
    next.pityFour = rarity >= 4 ? 0 : next.pityFour + 1;
    pulls.push({ id: cat.id, isNew: !previous, coins });
  }
  return { save: next, pulls };
}

export const upgradeCost = (level: number) => 60 + (level - 1) * 30;
export function upgrade(save: Save, id: string): Save {
  const owned = save.owned[id];
  if (!owned || owned.level >= MAX_LEVEL || save.coins < upgradeCost(owned.level)) return save;
  return { ...save, coins: save.coins - upgradeCost(owned.level), owned: { ...save.owned, [id]: { ...owned, level: owned.level + 1 } } };
}
export function toggleTeam(save: Save, id: string): Save {
  if (!save.owned[id]) return save;
  if (save.team.includes(id)) return save.team.length > 1 ? { ...save, team: save.team.filter((entry) => entry !== id) } : save;
  return save.team.length < 4 ? { ...save, team: [...save.team, id] } : save;
}
export function catStats(id: string, owned: OwnedCat, characters: readonly Character[] = CHARACTERS) {
  const cat = characterById(id, characters);
  const multiplier = (1 + (owned.level - 1) * 0.14) * (1 + Math.min(5, owned.copies - 1) * 0.04);
  return { hp: Math.round(cat.hp * multiplier), attack: Math.round(cat.attack * multiplier) };
}
export function elementMultiplier(attack: Element, defense: Element): number {
  return ({ fire: 'wind', wind: 'water', water: 'fire' }[attack] === defense) ? 1.5 : 1;
}

export interface Unit {
  key: number;
  catId: string | null;
  side: 'ally' | 'enemy';
  x: number;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  speed: number;
  element: Element;
  cooldown: number;
  flash: number;
  boss: boolean;
}
export interface Battle {
  stage: number;
  time: number;
  status: 'playing' | 'won' | 'lost';
  paused: boolean;
  baseHp: number;
  enemyHp: number;
  energy: number;
  cannon: number;
  cannonFlash: number;
  cooldowns: Record<string, number>;
  spawned: number;
  nextEnemy: number;
  nextKey: number;
  units: Unit[];
}
export function startBattle(save: Save, stage: number): Battle | null {
  if (!whole(stage, STAGES.length - 1) || (stage > 0 && !save.cleared.includes(stage - 1)) || !save.team.length) return null;
  return { stage, time: 0, status: 'playing', paused: false, baseHp: 1000, enemyHp: STAGES[stage].hp, energy: 100, cannon: 100, cannonFlash: 0, cooldowns: {}, spawned: 0, nextEnemy: 2, nextKey: 1, units: [] };
}
export function deploy(battle: Battle, save: Save, id: string, characters: readonly Character[] = CHARACTERS): Battle {
  if (battle.status !== 'playing' || battle.paused || !save.team.includes(id) || !save.owned[id]) return battle;
  const cat = characterById(id, characters);
  if (battle.energy < cat.cost || (battle.cooldowns[id] ?? 0) > 0 || battle.units.filter((unit) => unit.side === 'ally').length >= 16) return battle;
  const stats = catStats(id, save.owned[id], characters);
  const unit: Unit = { key: battle.nextKey, catId: id, side: 'ally', x: 9, hp: stats.hp, maxHp: stats.hp, attack: stats.attack, range: cat.range, speed: cat.speed, element: cat.element, cooldown: 0, flash: 0, boss: false };
  return { ...battle, energy: battle.energy - cat.cost, nextKey: battle.nextKey + 1, cooldowns: { ...battle.cooldowns, [id]: cat.cooldown }, units: [...battle.units, unit] };
}
export function fireCannon(battle: Battle): Battle {
  if (battle.status !== 'playing' || battle.paused || battle.cannon < 100) return battle;
  return { ...battle, cannon: 0, cannonFlash: 0.6, units: battle.units.map((unit) => unit.side === 'enemy' ? { ...unit, hp: unit.hp - 140, x: Math.min(90, unit.x + 5), flash: 0.3 } : unit).filter((unit) => unit.hp > 0) };
}

/** A fixed simulation step. UI scheduling never changes combat speed or the draw order. */
export function tickBattle(previous: Battle, dt = 0.1, characters: readonly Character[] = CHARACTERS): Battle {
  if (previous.status !== 'playing' || previous.paused || dt <= 0 || !Number.isFinite(dt)) return previous;
  const step = Math.min(dt, 0.25);
  const stage = STAGES[previous.stage];
  const battle: Battle = { ...previous, time: previous.time + step, energy: Math.min(200, previous.energy + step * 14), cannon: Math.min(100, previous.cannon + step * 5), cannonFlash: Math.max(0, previous.cannonFlash - step), cooldowns: Object.fromEntries(Object.entries(previous.cooldowns).map(([id, value]) => [id, Math.max(0, value - step)])), units: previous.units.map((unit) => ({ ...unit, cooldown: Math.max(0, unit.cooldown - step), flash: Math.max(0, unit.flash - step) })) };
  if (battle.spawned < stage.enemies && battle.time >= battle.nextEnemy) {
    const boss = battle.spawned === stage.enemies - 1;
    const hp = Math.round((boss ? 500 : 115) * stage.strength);
    battle.units.push({ key: battle.nextKey++, catId: null, side: 'enemy', x: 91, hp, maxHp: hp, attack: Math.round((boss ? 48 : 18) * stage.strength), range: boss ? 9 : 6, speed: boss ? 3 : 4.5, element: stage.element, cooldown: 0, flash: 0, boss });
    battle.spawned++;
    battle.nextEnemy += stage.interval;
  }
  for (const unit of battle.units) {
    if (unit.hp <= 0) continue;
    const opponents = battle.units.filter((target) => target.side !== unit.side && target.hp > 0).sort((a, b) => Math.abs(a.x - unit.x) - Math.abs(b.x - unit.x));
    const target = opponents[0];
    const healer = unit.catId && characterById(unit.catId, characters).role === 'healer';
    const hurt = healer ? battle.units.filter((ally) => ally.side === 'ally' && ally.hp > 0 && ally.hp < ally.maxHp && Math.abs(ally.x - unit.x) <= unit.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] : undefined;
    if (hurt && unit.cooldown <= 0) {
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + unit.attack);
      unit.cooldown = 1;
      unit.flash = 0.3;
    }
    if (target && Math.abs(target.x - unit.x) <= unit.range) {
      if (unit.cooldown <= 0) {
        target.hp -= Math.round(unit.attack * (healer ? 0.5 : 1) * elementMultiplier(unit.element, target.element));
        target.flash = 0.2;
        unit.cooldown = 1;
      }
    } else if (unit.side === 'ally' ? unit.x >= 91 - unit.range : unit.x <= 9 + unit.range) {
      if (unit.cooldown <= 0) {
        if (unit.side === 'ally') battle.enemyHp -= unit.attack * (healer ? 0.5 : 1);
        else battle.baseHp -= unit.attack;
        unit.cooldown = 1;
      }
    } else {
      unit.x += (unit.side === 'ally' ? 1 : -1) * unit.speed * step;
    }
  }
  battle.units = battle.units.filter((unit) => unit.hp > 0);
  battle.enemyHp = Math.max(0, battle.enemyHp);
  battle.baseHp = Math.max(0, battle.baseHp);
  if (battle.baseHp <= 0 || battle.time >= 180) battle.status = 'lost';
  else if (battle.enemyHp <= 0) battle.status = 'won';
  return battle;
}

export function battleReward(save: Save, battle: Battle): { gems: number; coins: number; first: boolean } {
  if (battle.status !== 'won') return { gems: 0, coins: 0, first: false };
  const first = !save.cleared.includes(battle.stage);
  return { gems: first ? STAGES[battle.stage].gems : 80, coins: first ? STAGES[battle.stage].coins : 120 + battle.stage * 30, first };
}

export interface GameState { save: Save; battle: Battle | null; pulls: Pull[]; reward: ReturnType<typeof battleReward> | null }
export type Action =
  | { type: 'load'; save: Save } | { type: 'summon'; count: 1 | 10; rolls: number[] }
  | { type: 'upgrade' | 'team' | 'deploy'; id: string }
  | { type: 'start'; stage: number }
  | { type: 'tick' | 'cannon' | 'pause' | 'leave' | 'close-pulls' };
export const initialGame = (): GameState => ({ save: newSave(), battle: null, pulls: [], reward: null });

/** Currency and victory are committed in the same transition, once per finished battle. */
export function gameReducer(state: GameState, action: Action, characters: readonly Character[] = CHARACTERS): GameState {
  if (action.type === 'load') return { ...state, save: action.save };
  if (action.type === 'close-pulls') return { ...state, pulls: [] };
  if (action.type === 'leave') return { ...state, battle: null, reward: null };
  if (action.type === 'start') {
    if (state.battle) return state;
    return { ...state, battle: startBattle(state.save, action.stage), reward: null };
  }
  if (action.type === 'summon') {
    if (state.battle || state.pulls.length || action.rolls.length !== action.count * 2 || action.rolls.some((value) => !Number.isFinite(value) || value < 0 || value >= 1)) return state;
    let index = 0;
    const result = summon(state.save, action.count, () => action.rolls[index++], characters);
    return result ? { ...state, ...result } : state;
  }
  if (action.type === 'upgrade' || action.type === 'team') {
    if (state.battle) return state;
    return { ...state, save: action.type === 'upgrade' ? upgrade(state.save, action.id) : toggleTeam(state.save, action.id) };
  }
  if (!state.battle) return state;
  if (action.type === 'deploy') return { ...state, battle: deploy(state.battle, state.save, action.id, characters) };
  if (action.type === 'cannon') return { ...state, battle: fireCannon(state.battle) };
  if (action.type === 'pause') return { ...state, battle: { ...state.battle, paused: !state.battle.paused } };
  if (action.type === 'tick') {
    const battle = tickBattle(state.battle, 0.1, characters);
    if (state.battle.status !== 'playing' || battle.status === 'playing') return battle === state.battle ? state : { ...state, battle };
    const reward = battleReward(state.save, battle);
    const save = { ...state.save, gems: state.save.gems + reward.gems, coins: state.save.coins + reward.coins, wins: state.save.wins + (battle.status === 'won' ? 1 : 0), losses: state.save.losses + (battle.status === 'lost' ? 1 : 0), cleared: reward.first ? [...state.save.cleared, battle.stage] : state.save.cleared };
    return { ...state, save, battle, reward };
  }
  return state;
}
