import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { catStats, gameReducer, initialGame, newSave, parseSave, summon, type GameState, type Save } from '@/components/game/StarcatCaravan/engine';
import { createArena, tickArena, type Arena } from '@/components/game/StarcatCaravan/arena';
import { checkpointArena, parseEncounter, resumeArena } from '@/components/game/StarcatCaravan/resume';
import { BADGES, earnedBadges, featureSave } from '@/components/game/StarcatCaravan/achievements';
import { ascensionOffer, trainedRarity } from '@/components/game/StarcatCaravan/growth';
import { newAdventure } from '@/components/game/StarcatCaravan/adventure';

const cat=CHARACTERS.find(c=>c.id==='ember')!;
const growing=():GameState=>({...initialGame(),save:{...newSave(),coins:5000,owned:{...newSave().owned,ember:{level:5,copies:4}}}});
const pending=():GameState=>{
  let arena=createArena(newSave(),0)!;
  for(let n=0;n<32;n++)arena=tickArena(arena);
  return {...initialGame(),save:{...featureSave(newSave()),encounter:checkpointArena(arena)}};
};
const read=(save:Save)=>parseSave(JSON.stringify(save));

describe('permanent star ascension',()=>{
  it('promotes ★3→4→5 without spending levels or copies and improves all three stats',()=>{
    const before=growing(),old=structuredClone(before.save),stats=catStats('ember',old.owned.ember);
    let next=gameReducer(before,{type:'ascend',id:'ember'});
    expect(next.save.owned.ember).toEqual({level:5,copies:4,stars:4});
    expect(next.save.coins).toBe(4400);
    for(const key of ['hp','attack','defense'] as const)expect(catStats('ember',next.save.owned.ember)[key]).toBeGreaterThan(stats[key]);
    expect({...next.save,version:1,owned:old.owned,coins:old.coins,adventure:undefined,achievements:undefined,encounter:undefined}).toEqual({...old,adventure:undefined,achievements:undefined,encounter:undefined});
    expect(next.save.achievements).toContain('first-ascension');
    expect(read(next.save)).toEqual(next.save);
    expect(gameReducer(next,{type:'ascend',id:'ember'})).toBe(next); // Lv.10 required
    next={...next,save:{...next.save,owned:{...next.save.owned,ember:{...next.save.owned.ember,level:10}}}};
    next=gameReducer(next,{type:'ascend',id:'ember'});
    expect(next.save.owned.ember).toEqual({level:10,copies:4,stars:5});expect(next.save.coins).toBe(3200);
    expect(gameReducer(next,{type:'ascend',id:'ember'})).toBe(next);
    expect(before.save).toEqual(old);
  });
  it.each([{level:4,copies:1,coins:600},{level:5,copies:1,coins:599}])('requires level and coins: %j',({coins,...owned})=>{
    const state=growing();state.save.coins=coins;state.save.owned.ember=owned;
    expect(gameReducer(state,{type:'ascend',id:'ember'})).toBe(state);
  });
  it('rejects unowned characters and ascension during active combat',()=>{
    const state=growing();expect(gameReducer(state,{type:'ascend',id:'luna'})).toBe(state);
    const active={...state,arena:createArena(state.save,0)!};expect(gameReducer(active,{type:'ascend',id:'ember'})).toBe(active);
  });
  it('keeps promoted stars through training and duplicate wishes; base wish rarity still determines pity and coins',()=>{
    const promoted=gameReducer(growing(),{type:'ascend',id:'ember'}).save;
    const trained=gameReducer({...initialGame(),save:promoted},{type:'upgrade',id:'ember'}).save;
    expect(trained.owned.ember).toEqual({level:6,copies:4,stars:4});
    const duplicate=summon(trained,1,()=>.9,[cat,...CHARACTERS.filter(c=>c.rarity!==3)])!;
    expect(duplicate.save.owned.ember).toEqual({level:6,copies:5,stars:4});
    expect(duplicate.pulls[0]).toEqual({id:'ember',isNew:false,coins:80});
    expect(duplicate.save.pityFour).toBe(trained.pityFour+1);expect(cat.rarity).toBe(3);
  });
  it('respects administrator increases without lowering earned stars',()=>{
    expect(trainedRarity({...cat,rarity:5},{level:5,copies:1,stars:4})).toBe(5);
    expect(trainedRarity(cat,{level:5,copies:1,stars:5})).toBe(5);
    expect(ascensionOffer({...cat,rarity:4},{level:1,copies:1})).toEqual({stars:5,level:10,coins:1200});
  });
});

describe('achievement badges and journal compatibility',()=>{
  it.each([1,2] as const)('reads a legacy v%s journal exactly and derives badges without mutation',version=>{
    const legacy:Save={...newSave(),version,coins:2350,pulls:30,owned:{...newSave().owned,ember:{level:2,copies:3}},...(version===2?{adventure:newAdventure()}: {})};
    const raw=JSON.stringify(legacy),loaded=parseSave(raw)!;
    expect(loaded).toEqual(legacy);
    expect(earnedBadges(loaded)).toEqual(['first-wish','ten-wishes','first-training']);
    expect(JSON.stringify(loaded)).toBe(raw);
    const state={...initialGame(),save:loaded};expect(gameReducer(state,{type:'load',save:loaded}).save).toBe(loaded);
  });
  it('records badges monotonically, preserves future IDs and is idempotent',()=>{
    const earned=featureSave({...newSave(),pulls:10,wins:1},['future-achievement','star-bond']);
    expect(earned.achievements).toEqual(expect.arrayContaining(['first-wish','ten-wishes','first-victory','future-achievement','star-bond']));
    expect(featureSave(earned)).toBe(earned);expect(read(earned)).toEqual(earned);
    const later=featureSave({...earned,pulls:0,wins:0});expect(later.achievements).toEqual(earned.achievements);
    expect(new Set(BADGES.map(b=>b.id)).size).toBe(14);
  });
  it.each([
    (s:Save)=>{s.owned.ember.stars=2 as never;},
    (s:Save)=>{s.owned.ember.stars=4.5 as never;},
    (s:Save)=>{delete s.achievements;},
    (s:Save)=>{s.achievements=['first-wish','first-wish'];},
    (s:Save)=>{s.achievements=['bad id'];},
    (s:Save)=>{delete s.encounter;},
    (s:Save)=>{s.version=2;},
  ])('protects the entire journal when new permanent metadata is malformed (%#)',mutate=>{
    const save=featureSave(newSave());mutate(save);expect(read(save)).toBeNull();
  });
});

describe('frozen battle checkpoints',()=>{
  it('accepts reachable snapshots throughout all six encounters, including the new support and freeze abilities',()=>{
    for(const team of [newSave().team,['yuki','fubuki','raika','shiden']])for(let stage=0;stage<6;stage++){
      const save={...newSave(),team,owned:Object.fromEntries(team.map(id=>[id,{level:20,copies:6}])),cleared:Array.from({length:stage},(_,i)=>i)};
      let arena=createArena(save,stage)!;
      for(let n=0;n<1801&&arena.status==='playing';n++){
        arena=tickArena(arena);
        if(n%50===0&&arena.status==='playing'){
          const snapshot=checkpointArena(arena);
          expect(parseEncounter(JSON.parse(JSON.stringify(snapshot)),save.owned,save.cleared)).toEqual(snapshot);
        }
      }
    }
  });
  it('round-trips actual combat including warnings, cooldowns, wards, freeze and charge, discarding held input and visual events',()=>{
    const state=pending(),arena=resumeArena(state.save.encounter!);
    arena.direction='right';arena.target={x:80,y:30};arena.shield=20;arena.shieldUntil=arena.time+6;arena.charge=37;
    arena.hp-=19;arena.companions[0].cooldown=.4;arena.companions[0].strikes=3;
    arena.enemies[0].windup=arena.time+1.2;arena.enemies[0].frozenUntil=arena.time+1;
    const checkpoint=checkpointArena(arena),before=structuredClone(arena);
    expect(checkpoint.arena).toEqual({...arena,paused:true,direction:null,target:null,events:[]});
    expect(parseEncounter(JSON.parse(JSON.stringify(checkpoint)),state.save.owned,[])).toEqual(checkpoint);
    const loaded=read({...state.save,encounter:checkpoint})!;
    const resumed=gameReducer({...initialGame(),save:loaded},{type:'resume'});
    expect(resumed.arena).toEqual({...checkpoint.arena,paused:false});
    expect(resumed.save.achievements).toContain('resumed');
    expect(tickArena(checkpoint.arena,100)).toBe(checkpoint.arena); // no offline clock
    expect(tickArena(resumed.arena!).time).toBeCloseTo(arena.time+.1);
    resumed.arena!.enemies[0].aim.x=6;resumed.arena!.companions[0].cooldown=0;
    expect(arena).toEqual(before);expect(loaded.encounter).toEqual(checkpoint);
  });
  it('checkpoints ticks only when requested, saves immediately on pause/burst/leave and resumes without restarting',()=>{
    let state=pending();state=gameReducer(state,{type:'resume'});
    const original=state.save;state=gameReducer(state,{type:'arena-tick'});expect(state.save).toBe(original);
    state=gameReducer(state,{type:'checkpoint'});expect(state.save.encounter!.arena.time).toBe(state.arena!.time);
    state=gameReducer(state,{type:'arena-burst'});expect(state.save.achievements).toContain('star-bond');expect(state.save.encounter!.arena.charge).toBe(0);
    state=gameReducer(state,{type:'arena-pause'});expect(state.save.encounter!.arena.paused).toBe(true);
    const frozen=checkpointArena(state.arena!);state=gameReducer(state,{type:'leave'});expect(state.arena).toBeUndefined();expect(state.save.encounter).toEqual(frozen);
    expect(gameReducer(state,{type:'resume'}).arena).toEqual({...frozen.arena,paused:false});
  });
  it('resumes with original party and stats after training, party edits and catalog edits; restarting uses the new setup',()=>{
    let state=pending();const original=structuredClone(state.save.encounter!.arena);
    state=gameReducer(state,{type:'upgrade',id:'ember'});state=gameReducer(state,{type:'team',id:'moss'});
    const edited=CHARACTERS.map(c=>({...c,attack:c.attack*2,ability:'none' as const}));
    expect(read(state.save)).toEqual(state.save);
    const resumed=gameReducer(state,{type:'resume'},edited);expect(resumed.arena!.companions).toEqual(original.companions);
    const restarted=gameReducer(state,{type:'restart-encounter'},edited);
    expect(restarted.arena!.time).toBe(0);expect(restarted.arena!.companions).toHaveLength(3);expect(restarted.arena!.companions[0].attack).toBeGreaterThan(original.companions[0].attack);
    expect(restarted.save.encounter!.arena).toEqual({...restarted.arena,paused:true});
    const abandoned=gameReducer(state,{type:'abandon-encounter'});expect(abandoned.save.encounter).toBeNull();
    expect({...abandoned.save,encounter:state.save.encounter}).toEqual(state.save);
    expect(gameReducer(abandoned,{type:'resume'})).toBe(abandoned);
  });
  it('does not overwrite an unfinished encounter with a new battle',()=>{
    const state=pending();expect(gameReducer(state,{type:'start',stage:0})).toBe(state);
    const atFortress={...state,journey:{x:22,y:5}};expect(gameReducer(atFortress,{type:'encounter'})).toBe(atFortress);
  });
  it.each(['won','lost'] as const)('commits %s results and clears the checkpoint exactly once',outcome=>{
    let state=pending();const arena=resumeArena(state.save.encounter!);
    if(outcome==='won'){
      arena.spawned=5;arena.enemies=[{...arena.enemies[0],key:1,hp:1,boss:true}];arena.nextKey=20;arena.hits=0;
    }else arena.time=179.95;
    state={...state,arena};const before=state.save;
    state=gameReducer(state,{type:outcome==='won'?'arena-burst':'arena-tick'});
    expect(state.arena!.status).toBe(outcome);expect(state.save.encounter).toBeNull();
    expect(state.save.wins).toBe(outcome==='won'?1:0);expect(state.save.losses).toBe(outcome==='lost'?1:0);
    expect(state.save.gems).toBe(before.gems+(outcome==='won'?500:0));
    if(outcome==='won')expect(state.save.achievements).toEqual(expect.arrayContaining(['first-victory','flawless','star-bond']));
    const journal=state.save;
    for(let n=0;n<5;n++)for(const type of ['arena-tick','arena-burst','checkpoint'] as const)state=gameReducer(state,{type});
    expect(state.save).toBe(journal);expect(read(journal)).toEqual(journal);
    expect(gameReducer({...initialGame(),save:journal},{type:'resume'}).arena).toBeUndefined();
  });
  it.each([
    (a:Arena)=>{a.stage=5;},(a:Arena)=>{a.status='won';},(a:Arena)=>{a.time=180;},
    (a:Arena)=>{a.hp=0;},(a:Arena)=>{a.hp=a.maxHp+1;},(a:Arena)=>{a.player.x=Infinity;},
    (a:Arena)=>{a.charge=101;},(a:Arena)=>{a.direction='right';},(a:Arena)=>{a.companions[0].id='not-owned';},
    (a:Arena)=>{a.companions[0].ability='unknown' as never;},(a:Arena)=>{a.companions[0].hp++;},
    (a:Arena)=>{a.enemies[0].key=a.nextKey;},(a:Arena)=>{a.enemies[0].boss=true;},
    (a:Arena)=>{a.enemies[0].aim.y=999;},(a:Arena)=>{a.spawned=100;},
  ])('rejects malformed battle state without dropping permanent progress (%#)',mutate=>{
    const save=pending().save;mutate(save.encounter!.arena);expect(read(save)).toBeNull();
  });
});
