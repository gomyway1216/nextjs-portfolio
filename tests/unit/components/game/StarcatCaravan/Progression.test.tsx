import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AchievementBadges, ResumeEncounter } from '@/components/game/StarcatCaravan/Progression';
import { CompanionCollection } from '@/components/game/StarcatCaravan/Companions';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { initialGame, newSave, gameReducer } from '@/components/game/StarcatCaravan/engine';
import { featureSave } from '@/components/game/StarcatCaravan/achievements';
import { createArena } from '@/components/game/StarcatCaravan/arena';
import { checkpointArena } from '@/components/game/StarcatCaravan/resume';

describe('growth and resume UI',()=>{
  it.each(['ja','en'] as const)('shows ascended stars and the original wish rarity while keeping unowned companions hidden (%s)',language=>{
    const promoted=gameReducer({...initialGame(),save:{...newSave(),coins:1000,owned:{...newSave().owned,ember:{level:5,copies:3}}}},{type:'ascend',id:'ember'}).save;
    const html=renderToStaticMarkup(<CompanionCollection save={promoted} characters={CHARACTERS} language={language} ready onAction={vi.fn()}/>);
    expect(html).toContain('★★★★');expect(html).toContain(language==='ja'?'排出レア度 ★3':'Wish rarity ★3');
    expect(html).toContain(language==='ja'?'★5へ昇格 · Lv.10以上':'Ascend to ★5 · Lv.10+');
    expect(html).not.toContain('luna-v1.webp');expect(html).toContain('Lv. 5');
  });
  it.each(['ja','en'] as const)('shows earlier badges and a frozen battle summary without listing unowned names (%s)',language=>{
    const save={...featureSave({...newSave(),pulls:10,owned:{...newSave().owned,ember:{level:5,copies:1}}}),encounter:checkpointArena({...createArena(newSave(),0)!,time:61.2,hp:100,charge:43.7})};
    const badges=renderToStaticMarkup(<AchievementBadges save={save} language={language}/>);
    expect(badges).toContain('3 / 14');expect(badges.match(/data-earned="true"/g)).toHaveLength(3);
    expect(badges).toContain(language==='ja'?'もう一つの星 · 未達成':'Another star · Locked');
    const html=renderToStaticMarkup(<ResumeEncounter save={save} characters={CHARACTERS} language={language} ready={false} dispatch={vi.fn()}/>);
    for(const text of ['1:01','HP 100/','43%'])expect(html).toContain(text);
    expect(html).toContain(language==='ja'?'中断時の編成・能力':'party and stats from that battle');
    expect(html.match(/disabled=""/g)).toHaveLength(3);expect(html).not.toContain('Luna');
    expect(renderToStaticMarkup(<ResumeEncounter save={newSave()} characters={CHARACTERS} language={language} ready dispatch={vi.fn()}/>)).toBe('');
  });
});
