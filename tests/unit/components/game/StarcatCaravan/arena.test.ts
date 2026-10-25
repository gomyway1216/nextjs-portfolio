import { describe, expect, it } from 'vitest';
import { aimArena, castArenaBurst, createArena, encounterCount, steerArena, tickArena, type Arena, type ArenaEnemy } from '@/components/game/StarcatCaravan/arena';
import { CHARACTERS, STAGES } from '@/components/game/StarcatCaravan/data';
import { gameReducer, initialGame, newSave, parseSave, type GameState, type Save } from '@/components/game/StarcatCaravan/engine';

const enemy = (extra:Partial<ArenaEnemy>={}):ArenaEnemy=>({key:50,x:35,y:30,hp:1000,maxHp:1000,boss:false,defense:0,cooldown:0,frozenUntil:0,windup:0,aim:{x:28,y:30},auraUntil:0,reactionAt:0,...extra});
function play(save:Save,stage:number):Arena{
  let arena=createArena(save,stage)!;
  for(let i=0;i<1801&&arena.status==='playing';i++){
    if(arena.charge>=100&&(arena.enemies.length>=2||arena.enemies.some(e=>e.boss)))arena=castArenaBurst(arena);
    arena=tickArena(arena);
  }
  return arena;
}
describe('simple party adventure battles',()=>{
  it('starts with the entire selected party and trained shared HP, without deployments or energy',()=>{
    const save=newSave(),arena=createArena(save,0)!;
    expect(arena.companions.map(c=>c.id)).toEqual(save.team);
    expect(arena.hp).toBe(arena.companions.reduce((sum,c)=>sum+c.hp,0));
    expect(arena.charge).toBe(100);expect(arena).not.toHaveProperty('energy');
    expect(createArena(save,1)).toBeNull();
  });
  it('moves continuously, clamps map boundaries and supports tap destinations',()=>{
    let arena=steerArena(createArena(newSave(),0)!,'right');
    const before=structuredClone(arena);
    arena=tickArena(arena);expect(arena.player.x).toBeCloseTo(30.8);expect(before.player.x).toBeCloseTo(29.4);
    arena=aimArena(arena,{x:500,y:-20});expect(arena.target).toEqual({x:95,y:7});
    for(let i=0;i<100;i++)arena=tickArena(arena);
    expect(arena.player.x).toBeLessThanOrEqual(95);expect(arena.player.y).toBeGreaterThanOrEqual(7);
    expect(aimArena(arena,{x:NaN,y:3})).toBe(arena);
    expect(tickArena(arena,NaN)).toBe(arena);
  });
  it('warns before an enemy attack and allows the party to move clear of the marked circle',()=>{
    const initial={...createArena(newSave(),0)!,enemies:[enemy()],nextSpawn:999};
    const warning=tickArena(initial);
    expect(warning.enemies[0].windup).toBeGreaterThan(warning.time);
    expect(warning.hp).toBe(initial.hp);
    let safe=steerArena(warning,'down'),hit=warning;
    for(let i=0;i<13;i++){safe=tickArena(safe);hit=tickArena(hit);}
    expect(safe.hits).toBe(0);expect(hit.hits).toBe(1);
    expect(initial.enemies[0].windup).toBe(0);
  });
  it('attacks automatically and applies unordered elemental reactions without button mashing',()=>{
    const arena={...createArena(newSave(),0)!,enemies:[enemy()],nextSpawn:999};
    const next=tickArena(arena);
    expect(next.enemies[0].hp).toBeLessThan(1000);
    expect(next.events.some(e=>e.kind==='attack')).toBe(true);
    expect(next.events.some(e=>e.kind==='reaction')).toBe(true);
    expect(arena.enemies[0].hp).toBe(1000);
  });
  it('uses only a charged big move, heals 10%, and cannot spend it on an empty or paused field',()=>{
    const empty=createArena(newSave(),0)!;
    expect(castArenaBurst(empty)).toBe(empty);
    const arena={...empty,hp:empty.maxHp/2,enemies:[enemy(),enemy({key:51})]};
    const burst=castArenaBurst(arena);
    expect(burst.charge).toBe(0);expect(burst.hp).toBeCloseTo(arena.hp+Math.round(arena.maxHp*.1));
    expect(burst.enemies.every(e=>e.hp<1000)).toBe(true);
    expect(castArenaBurst(burst)).toBe(burst);
    const paused={...arena,paused:true};expect(castArenaBurst(paused)).toBe(paused);expect(tickArena(paused)).toBe(paused);
  });
  it('keeps the boss mandatory and wins only after every wave is defeated',()=>{
    const arena=createArena(newSave(),0)!;
    expect(tickArena({...arena,spawned:encounterCount(0)-1,nextSpawn:999}).status).toBe('playing');
    expect(tickArena({...arena,spawned:encounterCount(0),enemies:[]}).status).toBe('won');
    expect(tickArena({...arena,hp:0}).status).toBe('lost');
    expect(tickArena({...arena,time:179.95}).status).toBe('lost');
  });
  it('lets a first-time party win with automatic attacks and occasional big moves',()=>{
    const result=play(newSave(),0);
    expect(result.status).toBe('won');expect(result.spawned).toBe(encounterCount(0));
    expect(result.time).toBeLessThan(180);
  });
  it.each([0,1,2,3,4,5])('supports a trained party through island %s',stage=>{
    const save={...newSave(),cleared:Array.from({length:stage},(_,i)=>i),owned:Object.fromEntries(newSave().team.map(id=>[id,{level:20,copies:1}]))};
    expect(play(save,stage).status).toBe('won');
  });
  it('preserves DB abilities and gives support companions their automatic effects',()=>{
    const characters=CHARACTERS.map(c=>c.id==='ember'?{...c,ability:'ward' as const}:c);
    let arena=createArena(newSave(),0,characters)!;
    arena={...arena,time:9.9,hp:arena.maxHp/2,nextSpawn:999};
    const next=tickArena(arena,.2);
    expect(next.shield).toBeGreaterThan(0);expect(next.hp).toBeGreaterThan(arena.hp);
    expect(next.events.some(e=>e.kind==='skill'&&e.catId==='ember')).toBe(true);
  });
  it.each([false,true])('freezes interrupt warned attacks and halve duration for bosses (%s)',boss=>{
    const characters=CHARACTERS.map(c=>c.id==='ember'?{...c,ability:'frost' as const}:c);
    const save={...newSave(),team:['ember']};
    const base=createArena(save,0,characters)!;
    const arena={...base,companions:[{...base.companions[0],strikes:3}],enemies:[enemy({boss,windup:1})],nextSpawn:999};
    const next=tickArena(arena);
    expect(next.enemies[0].windup).toBe(0);
    expect(next.enemies[0].frozenUntil).toBeCloseTo(.1+(boss?.5:1));
    expect(next.hits).toBe(0);
  });
  it('commits victory rewards exactly once and never persists unfinished combat',()=>{
    const state:GameState={...initialGame(),arena:{...createArena(newSave(),0)!,spawned:encounterCount(0),enemies:[]}};
    const won=gameReducer(state,{type:'arena-tick'});
    expect(won.save).toMatchObject({gems:3500,coins:850,wins:1,cleared:[0]});
    expect(gameReducer(won,{type:'arena-tick'}).save).toBe(won.save);
    expect(gameReducer(won,{type:'arena-burst'}).save).toBe(won.save);
    const restored=parseSave(JSON.stringify(won.save))!;
    expect(restored).not.toHaveProperty('arena');expect(restored.owned).toEqual(state.save.owned);
    expect(gameReducer(won,{type:'leave'}).arena).toBeUndefined();
  });
  it('locks training, wishes and map movement while the party is fighting',()=>{
    const state:GameState={...initialGame(),arena:createArena(newSave(),0)!};
    expect(gameReducer(state,{type:'walk',direction:'up'})).toBe(state);
    expect(gameReducer(state,{type:'upgrade',id:'ember'})).toBe(state);
    expect(gameReducer(state,{type:'leader',id:'moss'})).toBe(state);
    expect(STAGES).toHaveLength(6);
  });
});
