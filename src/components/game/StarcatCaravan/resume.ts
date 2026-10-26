import { ELEMENTS, ROLES, STAGES } from './data';
import { ABILITIES } from './abilities';
import { encounterCount, type Arena } from './arena';
import type { OwnedCat } from './engine';

export interface EncounterCheckpoint { version: 1; arena: Arena }
const finite = (n: unknown, max=1e9, min=0): n is number => typeof n==='number' && Number.isFinite(n) && n>=min && n<=max;
const whole = (n: unknown, max=1e6, min=0): n is number => finite(n,max,min) && Number.isSafeInteger(n);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const point = (p: unknown) => object(p) && finite(p.x,95,5) && finite(p.y,53,7);
const direction = (d: unknown) => typeof d==='string' && ['up','down','left','right'].includes(d);
const member = (key: unknown, table: object) => typeof key==='string' && Object.hasOwn(table,key);

/** Freeze gameplay, not presentation or held input. No offline time is simulated. */
export function checkpointArena(a: Arena): EncounterCheckpoint {
  return {version:1,arena:{...a,paused:true,direction:null,target:null,events:[],player:{...a.player},companions:a.companions.map(c=>({...c})),enemies:a.enemies.map(e=>({...e,aim:{...e.aim}}))}};
}
export function resumeArena(checkpoint: EncounterCheckpoint): Arena {
  return {...checkpointArena(checkpoint.arena).arena,paused:false};
}

/** Invalid snapshots protect the entire journal instead of losing an unfinished fight. */
export function parseEncounter(value: unknown, owned: Record<string,OwnedCat>, cleared: number[]): EncounterCheckpoint | null {
  if(!object(value)||value.version!==1||!object(value.arena))return null;
  const a=value.arena as unknown as Arena;
  if(!whole(a.stage,STAGES.length-1)||(a.stage>0&&!cleared.includes(a.stage-1))||a.status!=='playing'||a.paused!==true||a.direction!==null||a.target!==null||!Array.isArray(a.events)||a.events.length!==0)return null;
  if(!finite(a.time,180)||a.time>=180||!point(a.player)||!direction(a.facing)||!whole(a.maxHp,1e9,1)||!whole(a.hp,a.maxHp,1)||!whole(a.defense)||!whole(a.shield,Math.round(a.maxHp*.25))||!finite(a.shieldUntil,300)||!finite(a.charge,100))return null;
  if(!whole(a.spawned,encounterCount(a.stage))||!finite(a.nextSpawn,50,1)||!whole(a.nextKey,1e6,1)||!whole(a.hits))return null;
  if(!Array.isArray(a.companions)||a.companions.length<1||a.companions.length>4||new Set(a.companions.map(c=>object(c)?c.id:null)).size!==a.companions.length)return null;
  if(a.companions.some(c=>!object(c)||!member(c.id,owned)||!member(c.element,ELEMENTS)||!member(c.role,ROLES)||!member(c.ability,ABILITIES)||!whole(c.hp,1e9,1)||!whole(c.attack)||!finite(c.range,100)||!finite(c.cooldown,5)||!whole(c.strikes,10000)||!finite(c.supportAt,300)))return null;
  if(a.maxHp!==a.companions.reduce((sum,c)=>sum+c.hp,0))return null;
  if(!Array.isArray(a.enemies)||a.enemies.length>a.spawned||a.enemies.length>encounterCount(a.stage)||new Set(a.enemies.map(e=>object(e)?e.key:null)).size!==a.enemies.length)return null;
  if(a.enemies.some(e=>!object(e)||!whole(e.key,a.nextKey-1,1)||!point(e)||!point(e.aim)||!whole(e.maxHp,1e9,1)||!whole(e.hp,e.maxHp,1)||typeof e.boss!=='boolean'||!whole(e.defense)||!finite(e.cooldown,300)||!finite(e.frozenUntil,300)||!finite(e.windup,300)||!finite(e.auraUntil,300)||!finite(e.reactionAt,300)||(e.aura!==undefined&&!member(e.aura,ELEMENTS))))return null;
  if(a.enemies.filter(e=>e.boss).length>1||a.enemies.some(e=>e.boss&&a.spawned!==encounterCount(a.stage))||(a.spawned===encounterCount(a.stage)&&!a.enemies.length))return null;
  return checkpointArena(a);
}
