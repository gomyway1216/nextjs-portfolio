import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { COMMAND_COST, commandSkill, deploy, newSave, startBattle, type Unit } from '@/components/game/StarcatCaravan/engine';

const enemy=():Unit=>({key:99,catId:null,side:'enemy',x:15,hp:900,maxHp:900,attack:10,range:5,speed:2,element:'wind',cooldown:0,flash:0,boss:false});
describe('manual companion skills',()=>{
  it('requires a deployed companion, range, energy, a live battle and a ready cooldown',()=>{
    const save=newSave();let battle=startBattle(save,0)!;
    expect(commandSkill(battle,save,'ember')).toBe(battle);
    battle=deploy(battle,save,'ember');
    expect(commandSkill(battle,save,'ember')).toBe(battle);
    battle={...battle,energy:100,units:[...battle.units,enemy()]};
    const cast=commandSkill(battle,save,'ember');
    expect(cast).not.toBe(battle);
    expect(cast.energy).toBe(100-COMMAND_COST);
    expect(cast.commands?.ember).toBe(20);
    expect(cast.units.find(u=>u.side==='enemy')!.hp).toBeLessThan(900);
    expect(battle.units.find(u=>u.side==='enemy')!.hp).toBe(900);
    expect(commandSkill(cast,save,'ember')).toBe(cast);
    for(const blocked of [{...battle,paused:true},{...battle,status:'won' as const},{...battle,energy:39}])expect(commandSkill(blocked,save,'ember')).toBe(blocked);
  });
  it.each(['strike','splash','chain','frost','ward','mend'] as const)('executes %s without changing auto-attack counts, auto cooldowns or persistent saves',ability=>{
    const chars=CHARACTERS.map(cat=>cat.id==='ember'?{...cat,ability}:cat);
    const save=newSave();let battle=deploy(startBattle(save,0)!,save,'ember',chars);
    battle={...battle,energy:100,units:[{...battle.units[0],hp:100,strikes:2,skillReadyAt:10},enemy(),{...enemy(),key:100,x:16}]};
    const before=structuredClone(save);
    const cast=commandSkill(battle,save,'ember',chars);
    expect(cast.skills.at(-1)?.ability).toBe(ability);
    expect(cast.units[0].strikes).toBe(2);
    expect(cast.units[0].skillReadyAt).toBe(10);
    expect(save).toEqual(before);
    if(ability==='ward')expect(cast.units[0].shield).toBeGreaterThan(0);
    if(ability==='mend')expect(cast.units[0].hp).toBeGreaterThan(100);
    if(ability==='frost')expect(cast.units.find(u=>u.key===99)?.frozenUntil).toBe(1);
    if(ability==='chain')expect(cast.units.find(u=>u.key===100)!.hp).toBeLessThan(900);
  });
  it('casts from only one deployed instance and becomes ready again after twenty seconds',()=>{
    const save=newSave();let battle=deploy(startBattle(save,0)!,save,'ember');
    battle={...battle,energy:200,units:[...battle.units,{...battle.units[0],key:2,x:12},enemy()]};
    const cast=commandSkill(battle,save,'ember');
    expect(cast.skills).toHaveLength(1);
    expect(cast.energy).toBe(160);
    const ready={...cast,time:20};
    expect(commandSkill(ready,save,'ember').energy).toBe(120);
  });
});
