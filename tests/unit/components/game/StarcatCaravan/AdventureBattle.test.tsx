import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AdventureBattle from '@/components/game/StarcatCaravan/AdventureBattle';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { createArena } from '@/components/game/StarcatCaravan/arena';
import { newSave } from '@/components/game/StarcatCaravan/engine';

describe('simple adventure battle controls',()=>{
  it.each(['ja','en'] as const)('offers movement and one big move, with the entire owned party (%s)',language=>{
    const save=newSave(),arena=createArena(save,0)!;
    const html=renderToStaticMarkup(<AdventureBattle arena={arena} save={save} characters={CHARACTERS} language={language} ready dispatch={vi.fn()} reward={null}/>);
    expect(html.includes(language==='ja'?'大技・星の絆':'Big move: Star bond')).toBe(true);
    expect(html.match(/data-direction=/g)).toHaveLength(4);
    expect(html.includes(language==='ja'?'通常攻撃は仲間が自動':'Your companions attack automatically')).toBe(true);
    expect(html).toContain(`aria-label="${language==='ja'?'探索へ戻る':'Back to the trail'}"`);
    expect(html).not.toContain('Deploy energy');expect(html).not.toContain('出撃エネルギー');
    expect(html).not.toContain('Star cannon');expect(html).not.toContain('luna-v1.webp');
    for(const id of save.team)expect(html.includes(`${id}-v1.webp`)).toBe(true);
  });
});
