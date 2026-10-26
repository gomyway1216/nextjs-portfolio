import { CHARACTERS, STAGES, characterById, type Ability, type Character, type Element, type Role } from './data';
import { ELEMENT_ADVANTAGES, partyElements, reactionFor, type Reaction } from './elements';
import { catStats } from './stats';
import type { Save } from './engine';
import type { Direction, Point } from './adventure';

export interface ArenaCompanion { id: string; element: Element; role: Role; ability: Ability; hp: number; attack: number; range: number; cooldown: number; strikes: number; supportAt: number }
export interface ArenaEnemy extends Point { key: number; hp: number; maxHp: number; boss: boolean; defense: number; cooldown: number; frozenUntil: number; windup: number; aim: Point; aura?: Element; auraUntil: number; reactionAt: number }
export interface ArenaEvent { key: number; x: number; y: number; until: number; kind: 'attack' | 'hit' | 'burst' | 'skill' | 'reaction'; element?: Element; catId?: string; reaction?: Reaction }
export interface Arena {
  stage: number; time: number; status: 'playing' | 'won' | 'lost'; paused: boolean;
  player: Point; target: Point | null; direction: Direction | null; facing: Direction;
  hp: number; maxHp: number; defense: number; shield: number; shieldUntil: number; charge: number;
  companions: ArenaCompanion[]; enemies: ArenaEnemy[]; events: ArenaEvent[]; spawned: number; nextSpawn: number; nextKey: number; hits: number;
}
export const encounterCount = (stage: number) => 5 + Math.min(4, stage);
export const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
/** Fill a phone's viewport without empty SVG bands, keeping the party in view. */
export function arenaViewBox(player: Point, width: number, height: number, compact = width < 600): string {
  if (!compact || width <= 0 || height <= 0) return '0 0 960 600';
  const ratio = width / height;
  const w = Math.min(480, 600 * ratio), h = w / ratio;
  const x = Math.max(0, Math.min(960 - w, player.x * 10 - w / 2));
  const y = Math.max(0, Math.min(600 - h, player.y * 10 - h / 2));
  return `${x} ${y} ${w} ${h}`;
}
export function battleDirection(key: string): Direction | null {
  return new Map<string, Direction>([
    ['ArrowUp', 'up'], ['w', 'up'], ['W', 'up'],
    ['ArrowDown', 'down'], ['s', 'down'], ['S', 'down'],
    ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
    ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
  ]).get(key) ?? null;
}
const bounds = (point: Point): Point => ({x:Math.max(5,Math.min(95,point.x)),y:Math.max(7,Math.min(53,point.y))});

export function createArena(save: Save, stage: number, characters: readonly Character[] = CHARACTERS): Arena | null {
  if (!Number.isInteger(stage) || stage < 0 || stage >= STAGES.length || (stage > 0 && !save.cleared.includes(stage-1)) || !save.team.length) return null;
  const resonance=partyElements(save.team,characters).resonances;
  const companions=save.team.map(id=>{
    const cat=characterById(id,characters), stats=catStats(id,save.owned[id],characters), boosted=resonance.includes(cat.element);
    return {id,element:cat.element,role:cat.role,ability:cat.ability??'none',hp:Math.round(stats.hp*(boosted?1.2:1)),attack:Math.round(stats.attack*(boosted?1.15:1)),range:8+cat.range*.55,cooldown:0,strikes:0,supportAt:10};
  });
  const maxHp=companions.reduce((sum,cat)=>sum+cat.hp,0);
  return {stage,time:0,status:'playing',paused:false,player:{x:28,y:30},target:null,direction:null,facing:'right',hp:maxHp,maxHp,defense:Math.round(save.team.reduce((sum,id)=>sum+catStats(id,save.owned[id],characters).defense,0)/companions.length),shield:0,shieldUntil:0,charge:100,companions,enemies:[],events:[],spawned:0,nextSpawn:1,nextKey:1,hits:0};
}
function event(arena: Arena, point: Point, kind: ArenaEvent['kind'], extra: Partial<ArenaEvent>={}) { arena.events.push({key:arena.nextKey++,x:point.x,y:point.y,until:arena.time+0.65,kind,...extra}); }
function damage(enemy: ArenaEnemy, power: number) { if (power>0) enemy.hp-=Math.max(1,Math.round(power*100/(100+enemy.defense))); }
function freeze(enemy: ArenaEnemy, duration: number, time: number) { enemy.frozenUntil=Math.max(enemy.frozenUntil,time+duration*(enemy.boss ? .5 : 1)); enemy.windup=0; enemy.cooldown=Math.max(enemy.cooldown,enemy.frozenUntil+.2); }
function heal(arena: Arena, power: number) { if(arena.hp>0)arena.hp=Math.min(arena.maxHp,arena.hp+Math.round(power)); }
function reaction(arena: Arena, target: ArenaEnemy, kind: Reaction, power: number) {
  const near=(radius:number)=>arena.enemies.filter(e=>(e.hp>0||e===target)&&distance(e,target)<=radius);
  if(kind==='steam'||kind==='melt'||kind==='shatter')damage(target,power*({steam:.75,melt:.85,shatter:1}[kind]));
  if(kind==='flare'||kind==='overload'||kind==='blizzard')for(const enemy of near(14)){damage(enemy,power*({flare:.5,overload:.65,blizzard:.45}[kind]));if(kind==='blizzard')freeze(enemy,.6,arena.time);}
  if(kind==='shock'||kind==='storm')for(const enemy of [target,...near(kind==='shock'?20:25).filter(e=>e!==target).sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,2)])damage(enemy,power*(kind==='shock'?.65:.5));
  if(kind==='freeze'){damage(target,power*.25);freeze(target,1.2,arena.time);}
  if(kind==='bloom')heal(arena,power*.5);
  target.aura=undefined;target.auraUntil=0;target.reactionAt=arena.time+2;
  event(arena,target,'reaction',{reaction:kind});
}
function ability(arena: Arena, cat: ArenaCompanion, target?: ArenaEnemy) {
  if(cat.ability==='ward') {arena.shield=Math.max(arena.shield,Math.min(Math.round(cat.hp*.08),Math.round(arena.maxHp*.25)));arena.shieldUntil=arena.time+6;}
  if(cat.ability==='mend')heal(arena,cat.attack*.8);
  if(target){
    if(cat.ability==='strike')damage(target,cat.attack*.75);
    if(cat.ability==='frost'){damage(target,cat.attack*.5);freeze(target,1,arena.time);}
    if(cat.ability==='splash')for(const enemy of arena.enemies.filter(e=>(e.hp>0||e===target)&&distance(e,target)<=12))damage(enemy,cat.attack*.6);
    if(cat.ability==='chain')for(const enemy of arena.enemies.filter(e=>e!==target&&e.hp>0&&distance(e,target)<=20).sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,2))damage(enemy,cat.attack*.7);
  }
  event(arena,target??arena.player,'skill',{catId:cat.id,element:cat.element});
}
export function aimArena(arena: Arena, target: Point): Arena {
  if(arena.status!=='playing'||arena.paused||!Number.isFinite(target.x)||!Number.isFinite(target.y))return arena;
  return {...arena,direction:null,target:bounds(target)};
}
export function steerArena(arena: Arena, direction: Direction|null): Arena {
  if(arena.status!=='playing'||arena.paused||(direction!==null&&!['up','down','left','right'].includes(direction)))return arena;
  const delta=direction?{up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[direction]:[0,0];
  return {...arena,direction,target:null,player:bounds({x:arena.player.x+delta[0]*1.4,y:arena.player.y+delta[1]*1.4}),facing:direction??arena.facing};
}
export function castArenaBurst(previous: Arena): Arena {
  if(previous.status!=='playing'||previous.paused||previous.hp<=0||previous.charge<100||!previous.enemies.some(e=>e.hp>0))return previous;
  const arena={...previous,charge:0,enemies:previous.enemies.map(e=>({...e})),events:[...previous.events]};
  const power=arena.companions.reduce((sum,c)=>sum+c.attack,0)*3;
  for(const enemy of arena.enemies)if(enemy.hp>0)damage(enemy,power);
  heal(arena,arena.maxHp*.1);
  event(arena,arena.player,'burst');
  return settleArena(arena);
}
function settleArena(arena: Arena) {
  arena.enemies=arena.enemies.filter(e=>e.hp>0);
  arena.events=arena.events.filter(e=>e.until>arena.time).slice(-12);
  arena.hp=Math.max(0,arena.hp);
  if(arena.hp<=0||arena.time>=180)arena.status='lost';
  else if(arena.spawned===encounterCount(arena.stage)&&!arena.enemies.length)arena.status='won';
  return arena;
}

/** Shared-party combat: move to avoid marked attacks; companions fight automatically. */
export function tickArena(previous: Arena, dt=.1): Arena {
  if(previous.status!=='playing'||previous.paused||!Number.isFinite(dt)||dt<=0)return previous;
  const step=Math.min(.25,dt);
  const arena: Arena={...previous,time:previous.time+step,charge:Math.min(100,previous.charge+step*8),player:{...previous.player},companions:previous.companions.map(c=>({...c,cooldown:Math.max(0,c.cooldown-step)})),enemies:previous.enemies.map(e=>({...e,aim:{...e.aim}})),events:[...previous.events]};
  const stage=STAGES[arena.stage];
  if(arena.shieldUntil<=arena.time)arena.shield=0;
  if(arena.direction){const d={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[arena.direction];arena.player=bounds({x:arena.player.x+d[0]*step*14,y:arena.player.y+d[1]*step*14});arena.facing=arena.direction;}
  else if(arena.target){const length=distance(arena.player,arena.target);if(length<.2){arena.target=null;}else{const amount=Math.min(length,step*14),dx=(arena.target.x-arena.player.x)/length,dy=(arena.target.y-arena.player.y)/length;arena.player=bounds({x:arena.player.x+dx*amount,y:arena.player.y+dy*amount});arena.facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';}}
  if(arena.spawned<encounterCount(arena.stage)&&arena.time>=arena.nextSpawn){
    const boss=arena.spawned===encounterCount(arena.stage)-1;
    const spawns=[{x:88,y:14},{x:88,y:46},{x:55,y:9},{x:65,y:51}];
    const nearby=spawns.filter(point=>distance(point,arena.player)>=27).sort((a,b)=>distance(a,arena.player)-distance(b,arena.player));
    const point=nearby[Math.min(arena.spawned%2,nearby.length-1)]??spawns.sort((a,b)=>distance(b,arena.player)-distance(a,arena.player))[0];
    const hp=Math.round((boss?750:130)*stage.strength);
    arena.enemies.push({...point,key:arena.nextKey++,hp,maxHp:hp,boss,defense:Math.round((boss?18:4)*stage.strength),cooldown:0,frozenUntil:0,windup:0,aim:{...arena.player},auraUntil:0,reactionAt:0});
    arena.spawned++;arena.nextSpawn+=4;
  }
  for(const cat of arena.companions){
    if((cat.ability==='ward'||cat.ability==='mend')&&cat.supportAt<=arena.time){ability(arena,cat);cat.supportAt=arena.time+10;}
    if(cat.cooldown>0)continue;
    if(cat.role==='healer'&&arena.hp<arena.maxHp*.9){heal(arena,cat.attack);cat.cooldown=1.5;continue;}
    const target=arena.enemies.filter(e=>e.hp>0&&distance(e,arena.player)<=cat.range).sort((a,b)=>distance(a,arena.player)-distance(b,arena.player))[0];
    if(!target)continue;
    const power=cat.attack*(cat.role==='healer'?.5:1);
    damage(target,power*(ELEMENT_ADVANTAGES[cat.element].includes(stage.element)?1.5:1));
    if(target.reactionAt<=arena.time){const pair=target.aura&&target.auraUntil>arena.time?reactionFor(target.aura,cat.element):null;if(pair)reaction(arena,target,pair,power);else{target.aura=cat.element;target.auraUntil=arena.time+4;}}
    cat.strikes++;cat.cooldown=1;
    if(cat.strikes%4===0&&['strike','splash','chain','frost'].includes(cat.ability))ability(arena,cat,target);
    event(arena,target,'attack',{element:cat.element,catId:cat.id});
  }
  for(const enemy of arena.enemies){
    if(enemy.hp<=0||enemy.frozenUntil>arena.time)continue;
    if(enemy.windup>0){
      if(enemy.windup>arena.time)continue;
      if(distance(arena.player,enemy.aim)<(enemy.boss?12:8)){
        const amount=Math.max(1,Math.round((enemy.boss?65:22)*stage.strength*100/(100+arena.defense))),absorbed=Math.min(arena.shield,amount);
        arena.shield-=absorbed;arena.hp-=amount-absorbed;arena.hits++;event(arena,enemy.aim,'hit');
      }
      enemy.windup=0;enemy.cooldown=arena.time+2.5;
    }
    const range=enemy.boss?15:11,length=distance(enemy,arena.player);
    if(length<=range){if(enemy.cooldown<=arena.time){enemy.aim={...arena.player};enemy.windup=arena.time+(enemy.boss?1.5:1.2);}}
    else{const amount=Math.min(length-range,step*(enemy.boss?5:8));enemy.x+=(arena.player.x-enemy.x)/length*amount;enemy.y+=(arena.player.y-enemy.y)/length*amount;}
  }
  return settleArena(arena);
}
