import { CHARACTERS, MAX_LEVEL, PITY_FIVE, PITY_FOUR, STAGES, SUMMON_COST, characterById, type Ability, type Character, type Element, type Rarity } from './data';
import { AURA_SECONDS, ELEMENT_ADVANTAGES, REACTION_COOLDOWN, RESONANCE_ATTACK, RESONANCE_HP, partyElements, reactionFor, type Reaction } from './elements';
import { catStats } from './stats';
export { catStats } from './stats';
import { aimArena, castArenaBurst, createArena, steerArena, tickArena, type Arena } from './arena';
import { featureSave } from './achievements';
import { ascensionOffer } from './growth';
import { checkpointArena, parseEncounter, resumeArena, type EncounterCheckpoint } from './resume';
import { adventureOf, checkpoint, interact, movePoint, near, parseAdventure, PLACES, visitRegion, type AdventureSave, type Direction, type Place, type Point } from './adventure';

export interface OwnedCat { level: number; copies: number; stars?: Rarity }
export interface Save {
  version: 1 | 2 | 3;
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
  adventure?: AdventureSave;
  achievements?: string[];
  encounter?: EncounterCheckpoint | null;
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
    if (!value || ![1,2,3].includes(value.version) || (value.version >= 2 && value.adventure === undefined) || !['gems', 'coins', 'pulls', 'wins', 'losses'].every((key) => whole(value[key])) || !whole(value.pityFive, PITY_FIVE - 1) || !whole(value.pityFour, PITY_FOUR - 1)) return null;
    if (!value.owned || typeof value.owned !== 'object' || Array.isArray(value.owned)) return null;
    const owned: Record<string, OwnedCat> = {};
    for (const [id, cat] of Object.entries(value.owned)) {
      if ((!allowUnknownCharacters && !characters.some((entry) => entry.id === id)) || !/^[a-z][a-z0-9-]{0,47}$/.test(id) || ['constructor', 'prototype'].includes(id) || !cat || typeof cat !== 'object') return null;
      const item = cat as OwnedCat;
      if (!whole(item.level, MAX_LEVEL) || item.level < 1 || !whole(item.copies) || item.copies < 1) return null;
      if (item.stars !== undefined && (value.version !== 3 || !whole(item.stars,5) || item.stars < 3)) return null;
      owned[id] = { level: item.level, copies: item.copies, ...(item.stars !== undefined ? { stars:item.stars } : {}) };
    }
    if (!Array.isArray(value.team) || value.team.length < 1 || value.team.length > 4 || new Set(value.team).size !== value.team.length || !value.team.every((id: unknown) => typeof id === 'string' && Object.hasOwn(owned, id))) return null;
    if (!Array.isArray(value.cleared) || new Set(value.cleared).size !== value.cleared.length || !value.cleared.every((stage: unknown) => whole(stage, STAGES.length - 1))) return null;
    // Campaign unlocks form a contiguous prefix, never a jump to an unplayed island.
    const cleared = [...value.cleared].sort((a, b) => a - b);
    if (cleared.some((stage, index) => stage !== index)) return null;
    const adventure = value.adventure === undefined ? undefined : parseAdventure(value.adventure, cleared);
    if (adventure === null) return null;
    if(value.version!==3 && (value.achievements!==undefined||value.encounter!==undefined))return null;
    if(value.version===3 && (!Array.isArray(value.achievements)||value.achievements.length>200||new Set(value.achievements).size!==value.achievements.length||!value.achievements.every((id:unknown)=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(id))||value.encounter===undefined))return null;
    const encounter=value.version===3 && value.encounter!==null?parseEncounter(value.encounter,owned,cleared):null;
    if(value.version===3 && value.encounter!==null && !encounter)return null;
    return { version: value.version, gems: value.gems, coins: value.coins, owned, team: [...value.team], cleared, pityFive: value.pityFive, pityFour: value.pityFour, pulls: value.pulls, wins: value.wins, losses: value.losses, ...(adventure ? { adventure } : {}), ...(value.version===3?{achievements:[...value.achievements],encounter}: {}) };
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
    const previous = Object.hasOwn(next.owned, cat.id) ? next.owned[cat.id] : undefined;
    const coins = previous ? ({ 3: 80, 4: 160, 5: 320 }[rarity]) : 0;
    next.owned[cat.id] = { ...(previous ?? {}), level: previous?.level ?? 1, copies: (previous?.copies ?? 0) + 1 };
    next.coins += coins;
    next.pityFive = rarity === 5 ? 0 : next.pityFive + 1;
    next.pityFour = rarity >= 4 ? 0 : next.pityFour + 1;
    pulls.push({ id: cat.id, isNew: !previous, coins });
  }
  return { save: next, pulls };
}

export const upgradeCost = (level: number) => 60 + (level - 1) * 30;
export function upgrade(save: Save, id: string): Save {
  if (!Object.hasOwn(save.owned, id)) return save;
  const owned = save.owned[id];
  if (!owned || owned.level >= MAX_LEVEL || save.coins < upgradeCost(owned.level)) return save;
  return { ...save, coins: save.coins - upgradeCost(owned.level), owned: { ...save.owned, [id]: { ...owned, level: owned.level + 1 } } };
}
export function toggleTeam(save: Save, id: string): Save {
  if (!Object.hasOwn(save.owned, id) || !save.owned[id]) return save;
  if (save.team.includes(id)) return save.team.length > 1 ? { ...save, team: save.team.filter((entry) => entry !== id) } : save;
  return save.team.length < 4 ? { ...save, team: [...save.team, id] } : save;
}
export function elementMultiplier(attack: Element, defense: Element): number {
  return ELEMENT_ADVANTAGES[attack].includes(defense) ? 1.5 : 1;
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
  aura?: Element;
  auraUntil?: number;
  reactionReadyAt?: number;
  defense?: number;
  shield?: number;
  shieldUntil?: number;
  frozenUntil?: number;
  strikes?: number;
  skillReadyAt?: number;
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
  reactions: { kind: Reaction; x: number; time: number; key: number }[];
  skills: { ability: Ability; catId: string; x: number; time: number; key: number }[];
}
export function startBattle(save: Save, stage: number): Battle | null {
  if (!whole(stage, STAGES.length - 1) || (stage > 0 && !save.cleared.includes(stage - 1)) || !save.team.length) return null;
  return { stage, time: 0, status: 'playing', paused: false, baseHp: 1000, enemyHp: STAGES[stage].hp, energy: 100, cannon: 100, cannonFlash: 0, cooldowns: {}, spawned: 0, nextEnemy: 2, nextKey: 1, units: [], reactions: [], skills: [] };
}
export function deploy(battle: Battle, save: Save, id: string, characters: readonly Character[] = CHARACTERS): Battle {
  if (battle.status !== 'playing' || battle.paused || !save.team.includes(id) || !Object.hasOwn(save.owned, id) || !save.owned[id]) return battle;
  const cat = characterById(id, characters);
  if (battle.energy < cat.cost || (battle.cooldowns[id] ?? 0) > 0 || battle.units.filter((unit) => unit.side === 'ally').length >= 16) return battle;
  const stats = catStats(id, save.owned[id], characters);
  if (partyElements(save.team.filter((entry) => Object.hasOwn(save.owned, entry)), characters).resonances.includes(cat.element)) {
    stats.hp = Math.round(stats.hp * RESONANCE_HP);
    stats.attack = Math.round(stats.attack * RESONANCE_ATTACK);
  }
  const unit: Unit = { key: battle.nextKey, catId: id, side: 'ally', x: 9, hp: stats.hp, maxHp: stats.hp, attack: stats.attack, defense: stats.defense, range: cat.range, speed: cat.speed, element: cat.element, cooldown: 0, flash: 0, boss: false, strikes: 0, skillReadyAt: battle.time + 10 };
  return { ...battle, energy: battle.energy - cat.cost, nextKey: battle.nextKey + 1, cooldowns: { ...battle.cooldowns, [id]: cat.cooldown }, units: [...battle.units, unit] };
}
export function fireCannon(battle: Battle): Battle {
  if (battle.status !== 'playing' || battle.paused || battle.cannon < 100) return battle;
  return { ...battle, cannon: 0, cannonFlash: 0.6, units: battle.units.map((unit) => unit.side === 'enemy' ? { ...unit, hp: unit.hp - 140, x: Math.min(90, unit.x + 5), flash: 0.3 } : unit).filter((unit) => unit.hp > 0) };
}

/** Defense reduces ordinary, reaction and skill damage; a live ward absorbs the remainder. */
export function applyDamage(target: Unit, power: number, time: number) {
  if (power <= 0) return;
  const damage = Math.max(1, Math.round(power * 100 / (100 + (target.defense ?? 0))));
  const shield = (target.shieldUntil ?? 0) > time ? (target.shield ?? 0) : 0;
  const absorbed = Math.min(shield, damage);
  target.shield = shield - absorbed;
  target.hp -= damage - absorbed;
  target.flash = 0.3;
}

function freezeUnit(target: Unit, duration: number, time: number) { target.frozenUntil = Math.max(target.frozenUntil ?? 0, time + duration * (target.boss ? 0.5 : 1)); }

function react(battle: Battle, target: Unit, reaction: Reaction, power: number) {
  const near = (radius: number) => battle.units.filter((enemy) => enemy.side === target.side && (enemy.hp > 0 || enemy === target) && Math.abs(enemy.x - target.x) <= radius);
  if (reaction === 'steam' || reaction === 'melt' || reaction === 'shatter') applyDamage(target, power * ({ steam: 0.75, melt: 0.85, shatter: 1 }[reaction]), battle.time);
  if (reaction === 'flare' || reaction === 'overload' || reaction === 'blizzard') for (const enemy of near(14)) {
    applyDamage(enemy, power * ({ flare: 0.5, overload: 0.65, blizzard: 0.45 }[reaction]), battle.time);
    if (reaction === 'blizzard') freezeUnit(enemy, 0.6, battle.time);
  }
  if (reaction === 'shock' || reaction === 'storm') {
    const others = near(reaction === 'shock' ? 20 : 25).filter((enemy) => enemy !== target).sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x)).slice(0, 2);
    for (const enemy of [target, ...others]) applyDamage(enemy, power * (reaction === 'shock' ? 0.65 : 0.5), battle.time);
  }
  if (reaction === 'freeze') { applyDamage(target, power * 0.25, battle.time); freezeUnit(target, 1.2, battle.time); }
  if (reaction === 'bloom') for (const ally of battle.units) if (ally.side === 'ally' && ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + Math.round(power * 0.5));
  target.aura = undefined;
  target.auraUntil = 0;
  target.reactionReadyAt = battle.time + REACTION_COOLDOWN;
  battle.reactions.push({ kind: reaction, x: target.x, time: battle.time, key: battle.nextKey++ });
}

function skillEvent(battle: Battle, unit: Unit, ability: Ability) { battle.skills.push({ ability, catId: unit.catId!, x: unit.x, time: battle.time, key: battle.nextKey++ }); }

function supportSkill(battle: Battle, unit: Unit, ability: Ability) {
  if ((ability !== 'ward' && ability !== 'mend') || battle.time < (unit.skillReadyAt ?? Infinity)) return;
  unit.skillReadyAt = battle.time + 10;
  supportEffect(battle, unit, ability);
}

function supportEffect(battle: Battle, unit: Unit, ability: Ability) {
  for (const ally of battle.units) if (ally.side === 'ally' && ally.hp > 0) {
    if (ability === 'mend') ally.hp = Math.min(ally.maxHp, ally.hp + Math.round(unit.attack * 0.8));
    else {
      const existing = (ally.shieldUntil ?? 0) > battle.time ? (ally.shield ?? 0) : 0;
      ally.shield = Math.max(existing, Math.min(Math.round(unit.maxHp * 0.08), Math.round(ally.maxHp * 0.25)));
      ally.shieldUntil = battle.time + 6;
    }
  }
  skillEvent(battle, unit, ability);
}

function attackSkill(battle: Battle, unit: Unit, target: Unit, ability: Ability) {
  unit.strikes = (unit.strikes ?? 0) + 1;
  if (unit.strikes % 4 !== 0 || !['strike', 'splash', 'chain', 'frost'].includes(ability)) return;
  attackEffect(battle, unit, target, ability);
}

function attackEffect(battle: Battle, unit: Unit, target: Unit, ability: Ability) {
  if (ability === 'strike') applyDamage(target, unit.attack * 0.75, battle.time);
  if (ability === 'frost') { applyDamage(target, unit.attack * 0.5, battle.time); freezeUnit(target, 1, battle.time); }
  const others = battle.units.filter((enemy) => enemy.side === target.side && enemy.hp > 0 && enemy !== target).sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x));
  if (ability === 'splash') for (const enemy of [target, ...others.filter((entry) => Math.abs(entry.x - target.x) <= 12)]) applyDamage(enemy, unit.attack * 0.6, battle.time);
  if (ability === 'chain') for (const enemy of others.filter((entry) => Math.abs(entry.x - target.x) <= 20).slice(0, 2)) applyDamage(enemy, unit.attack * 0.7, battle.time);
  skillEvent(battle, unit, ability);
}

/** A fixed simulation step. UI scheduling never changes combat speed or the draw order. */
export function tickBattle(previous: Battle, dt = 0.1, characters: readonly Character[] = CHARACTERS): Battle {
  if (previous.status !== 'playing' || previous.paused || dt <= 0 || !Number.isFinite(dt)) return previous;
  const step = Math.min(dt, 0.25);
  const stage = STAGES[previous.stage];
  const battle: Battle = { ...previous, time: previous.time + step, energy: Math.min(200, previous.energy + step * 14), cannon: Math.min(100, previous.cannon + step * 5), cannonFlash: Math.max(0, previous.cannonFlash - step), cooldowns: Object.fromEntries(Object.entries(previous.cooldowns).map(([id, value]) => [id, Math.max(0, value - step)])), units: previous.units.map((unit) => ({ ...unit, cooldown: Math.max(0, unit.cooldown - step), flash: Math.max(0, unit.flash - step) })) };
  battle.reactions = previous.reactions.filter((event) => battle.time - event.time < 1.6);
  battle.skills = previous.skills.filter((event) => battle.time - event.time < 1.6);
  for (const unit of battle.units) if ((unit.shield ?? 0) > 0 && (unit.shieldUntil ?? 0) <= battle.time) unit.shield = 0;
  if (battle.spawned < stage.enemies && battle.time >= battle.nextEnemy) {
    const boss = battle.spawned === stage.enemies - 1;
    const hp = Math.round((boss ? 500 : 115) * stage.strength);
    battle.units.push({ key: battle.nextKey++, catId: null, side: 'enemy', x: 91, hp, maxHp: hp, attack: Math.round((boss ? 48 : 18) * stage.strength), defense: Math.round((boss ? 18 : 4) * stage.strength), range: boss ? 9 : 6, speed: boss ? 3 : 4.5, element: stage.element, cooldown: 0, flash: 0, boss });
    battle.spawned++;
    battle.nextEnemy += stage.interval;
  }
  for (const unit of battle.units) {
    if (unit.hp <= 0 || (unit.frozenUntil ?? 0) > battle.time) continue;
    const cat = unit.catId ? characterById(unit.catId, characters) : null;
    if (cat) supportSkill(battle, unit, cat.ability ?? 'none');
    const opponents = battle.units.filter((target) => target.side !== unit.side && target.hp > 0).sort((a, b) => Math.abs(a.x - unit.x) - Math.abs(b.x - unit.x));
    const target = opponents[0];
    const healer = cat?.role === 'healer';
    const hurt = healer ? battle.units.filter((ally) => ally.side === 'ally' && ally.hp > 0 && ally.hp < ally.maxHp && Math.abs(ally.x - unit.x) <= unit.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] : undefined;
    if (hurt && unit.cooldown <= 0) {
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + unit.attack);
      unit.cooldown = 1;
      unit.flash = 0.3;
    }
    if (target && Math.abs(target.x - unit.x) <= unit.range) {
      if (unit.cooldown <= 0) {
        const power = unit.attack * (healer ? 0.5 : 1);
        applyDamage(target, power * elementMultiplier(unit.element, target.element), battle.time);
        // An enemy's native element affects weakness, not its applied aura. Only ally hits combine.
        if (unit.side === 'ally' && battle.time >= (target.reactionReadyAt ?? 0)) {
          const reaction = target.aura && (target.auraUntil ?? 0) > battle.time ? reactionFor(target.aura, unit.element) : null;
          if (reaction) {
            react(battle, target, reaction, power);
          } else {
            target.aura = unit.element;
            target.auraUntil = battle.time + AURA_SECONDS;
          }
        }
        if (cat) attackSkill(battle, unit, target, cat.ability ?? 'none');
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
  battle.reactions = battle.reactions.slice(-3);
  battle.skills = battle.skills.slice(-3);
  battle.enemyHp = Math.max(0, battle.enemyHp);
  battle.baseHp = Math.max(0, battle.baseHp);
  if (battle.baseHp <= 0 || battle.time >= 180) battle.status = 'lost';
  else if (battle.enemyHp <= 0) battle.status = 'won';
  return battle;
}

export function battleReward(save: Save, battle: Pick<Battle, 'stage' | 'status'>): { gems: number; coins: number; first: boolean } {
  if (battle.status !== 'won') return { gems: 0, coins: 0, first: false };
  const first = !save.cleared.includes(battle.stage);
  return { gems: first ? STAGES[battle.stage].gems : 80, coins: first ? STAGES[battle.stage].coins : 120 + battle.stage * 30, first };
}

export interface GameState { save: Save; battle: Battle | null; pulls: Pull[]; reward: ReturnType<typeof battleReward> | null; journey?: Point; arena?: Arena | null }
export type Action =
  | { type: 'load'; save: Save } | { type: 'summon'; count: 1 | 10; rolls: number[] }
  | { type: 'upgrade' | 'ascend' | 'team' | 'deploy' | 'leader'; id: string }
  | { type: 'start'; stage: number }
  | { type: 'travel'; region: number }
  | { type: 'walk'; direction: Direction }
  | { type: 'interact'; place: Place }
  | { type: 'checkpoint' | 'encounter' | 'resume' | 'restart-encounter' | 'abandon-encounter' }
  | { type: 'arena-tick' | 'arena-burst' | 'arena-pause' }
  | { type: 'arena-steer'; direction: Direction | null }
  | { type: 'arena-aim'; point: Point }
  | { type: 'tick' | 'cannon' | 'pause' | 'leave' | 'close-pulls' };
export const initialGame = (): GameState => ({ save: newSave(), battle: null, pulls: [], reward: null });

/** Currency and victory are committed in the same transition, once per finished battle. */
export function gameReducer(state: GameState, action: Action, characters: readonly Character[] = CHARACTERS): GameState {
  const next=reduceGame(state,action,characters);
  return action.type!=='load' && next.save!==state.save ? {...next,save:featureSave(next.save)} : next;
}
function keepEncounter(save: Save, arena: Arena): Save {
  const encounter=checkpointArena(arena);
  if(JSON.stringify(save.encounter)===JSON.stringify(encounter))return save;
  return {...featureSave(save),encounter};
}
function reduceGame(state: GameState, action: Action, characters: readonly Character[]): GameState {
  if (action.type === 'load') return { ...state, save: action.save, journey: undefined, arena: undefined };
  if(action.type==='checkpoint' && state.arena?.status==='playing')return {...state,save:keepEncounter(state.save,state.arena)};
  if(action.type==='resume'||action.type==='restart-encounter'||action.type==='abandon-encounter'){
    if(state.arena||state.battle||state.pulls.length||!state.save.encounter)return state;
    if(action.type==='abandon-encounter')return {...state,save:{...state.save,encounter:null}};
    if(action.type==='resume')return {...state,arena:resumeArena(state.save.encounter),save:featureSave(state.save,['resumed']),reward:null};
    const arena=createArena(state.save,state.save.encounter.arena.stage,characters);
    return arena?{...state,arena,save:keepEncounter(state.save,arena),reward:null}:state;
  }
  if(action.type==='ascend'){
    if(state.arena||state.battle||!Object.hasOwn(state.save.owned,action.id))return state;
    const cat=characters.find(c=>c.id===action.id),owned=state.save.owned[action.id];
    if(!cat)return state;
    const offer=ascensionOffer(cat,owned);
    if(!offer||owned.level<offer.level||state.save.coins<offer.coins)return state;
    return {...state,save:{...state.save,coins:state.save.coins-offer.coins,owned:{...state.save.owned,[action.id]:{...owned,stars:offer.stars}}}};
  }
  if (action.type === 'arena-steer' || action.type === 'arena-aim' || action.type === 'arena-pause' || action.type === 'arena-tick' || action.type === 'arena-burst') {
    if (!state.arena) return state;
    if (action.type === 'arena-steer') return { ...state, arena: steerArena(state.arena, action.direction) };
    if (action.type === 'arena-aim') return { ...state, arena: aimArena(state.arena, action.point) };
    if (action.type === 'arena-pause') { if(state.arena.status!=='playing')return state; const arena={...state.arena,paused:!state.arena.paused,direction:null,target:null};return {...state,arena,save:keepEncounter(state.save,arena)}; }
    const arena = action.type === 'arena-tick' ? tickArena(state.arena) : castArenaBurst(state.arena);
    if (arena === state.arena) return state;
    if (state.arena.status !== 'playing' || arena.status === 'playing') return { ...state, arena, ...(action.type==='arena-burst'?{save:keepEncounter(featureSave(state.save,['star-bond']),arena)}:{}) };
    const reward = battleReward(state.save, arena);
    const save = { ...state.save, encounter:null, gems: state.save.gems + reward.gems, coins: state.save.coins + reward.coins, wins: state.save.wins + (arena.status === 'won' ? 1 : 0), losses: state.save.losses + (arena.status === 'lost' ? 1 : 0), cleared: reward.first ? [...state.save.cleared, arena.stage] : state.save.cleared };
    return { ...state, arena, save:featureSave(save,[...(arena.status==='won'&&arena.hits===0?['flawless']:[]),...(action.type==='arena-burst'?['star-bond']:[])]), reward };
  }
  if (['travel', 'walk', 'checkpoint', 'interact', 'encounter'].includes(action.type)) {
    if (state.battle || state.arena || state.pulls.length) return state;
    const position = state.journey ?? adventureOf(state.save).position;
    if (action.type === 'travel') { const save = visitRegion(state.save, action.region); return save === state.save ? state : { ...state, save, journey: undefined }; }
    if (action.type === 'walk') { const journey = movePoint(position, action.direction); return journey === position ? state : { ...state, journey }; }
    if (action.type === 'checkpoint') { const save = checkpoint(state.save, position); return save === state.save ? state : { ...state, save }; }
    if (action.type === 'interact') { const save = interact(state.save, position, action.place); return save === state.save ? state : { ...state, save }; }
    if (action.type === 'encounter') {
      if (state.save.encounter || !near(position, PLACES.find((place) => place.id === 'fortress')!)) return state;
      const arena=createArena(state.save,adventureOf(state.save).region,characters);
      return arena?{ ...state, save: keepEncounter(checkpoint(state.save,position),arena), arena, reward: null }:state;
    }
  }
  if (action.type === 'close-pulls') return { ...state, pulls: [] };
  if (action.type === 'leave') return { ...state, save:state.arena?.status==='playing'?keepEncounter(state.save,state.arena):state.save, battle: null, arena: undefined, reward: null };
  if (action.type === 'start') {
    if (state.battle || state.arena || state.save.encounter) return state;
    return { ...state, battle: startBattle(state.save, action.stage), reward: null };
  }
  if (action.type === 'summon') {
    if (state.battle || state.arena || state.pulls.length || action.rolls.length !== action.count * 2 || action.rolls.some((value) => !Number.isFinite(value) || value < 0 || value >= 1)) return state;
    let index = 0;
    const result = summon(state.save, action.count, () => action.rolls[index++], characters);
    return result ? { ...state, ...result } : state;
  }
  if (action.type === 'leader') {
    if (state.battle || state.arena || !state.save.team.includes(action.id) || state.save.team[0] === action.id) return state;
    return { ...state, save: { ...state.save, team: [action.id, ...state.save.team.filter((id) => id !== action.id)] } };
  }
  if (action.type === 'upgrade' || action.type === 'team') {
    if (state.battle || state.arena) return state;
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
