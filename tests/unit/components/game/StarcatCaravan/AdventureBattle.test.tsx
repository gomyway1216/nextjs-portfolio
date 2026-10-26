import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AdventureBattle from '@/components/game/StarcatCaravan/AdventureBattle';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { createArena, tickArena } from '@/components/game/StarcatCaravan/arena';
import { newSave } from '@/components/game/StarcatCaravan/engine';

describe('simple adventure battle controls',()=>{
  it.each(['ja','en'] as const)('offers movement and one big move, with the entire owned party (%s)',language=>{
    const save=newSave(),arena=createArena(save,0)!;
    const html=renderToStaticMarkup(<AdventureBattle arena={arena} save={save} characters={CHARACTERS} language={language} ready dispatch={vi.fn()} reward={null}/>);
    expect(html.includes(language==='ja'?'大技・星の絆':'Big move: Star bond')).toBe(true);
    expect(html.match(/data-direction=/g)).toHaveLength(4);
    expect(html.includes(language==='ja'?'通常攻撃は仲間が自動':'Your companions attack automatically')).toBe(true);
    expect(html).toContain(`aria-label="${language==='ja'?'戦闘を中断して探索へ':'Save battle and return to the trail'}"`);
    expect(html).not.toContain('Deploy energy');expect(html).not.toContain('出撃エネルギー');
    expect(html).not.toContain('Star cannon');expect(html).not.toContain('luna-v1.webp');
    for(const id of save.team)expect(html.includes(`${id}-v1.webp`)).toBe(true);
  });
  it.each(['ja','en'] as const)('shows remaining time and spawn progress through pause and boss combat (%s)',language=>{
    const save=newSave(),base=createArena(save,0)!;
    const spawned=tickArena({...base,time:17});
    const boss={...spawned,spawned:5,enemies:spawned.enemies.map(enemy=>({...enemy,boss:true})),paused:true};
    for(const arena of [base,{...base,time:16.4,spawned:4,paused:true},boss]){
      const html=renderToStaticMarkup(<AdventureBattle arena={arena} save={save} characters={CHARACTERS} language={language} ready dispatch={vi.fn()} reward={null}/>);
      expect(html).toContain('role="timer"');expect(html).toContain(arena.time===0?'3:00':arena.time===16.4?'2:44':'2:43');
      if(arena===boss)expect(html).toContain('data-boss="true"');
      expect(html).toContain(language==='ja'?'敵の出現':'Spawned');expect(html).toContain(arena.time===0?'0':'4');
    }
    const ended=renderToStaticMarkup(<AdventureBattle arena={{...base,status:'won'}} save={save} characters={CHARACTERS} language={language} ready dispatch={vi.fn()} reward={{gems:500,coins:250,first:true}}/>);
    expect(ended).not.toContain('role="timer"');
  });

});
