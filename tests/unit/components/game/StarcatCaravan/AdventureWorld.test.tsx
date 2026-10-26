import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AdventureWorld from '@/components/game/StarcatCaravan/AdventureWorld';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { initialGame } from '@/components/game/StarcatCaravan/engine';
import { newAdventure } from '@/components/game/StarcatCaravan/adventure';

describe('adventure map presentation',()=>{
  it.each(['ja','en'] as const)('shows walking controls, island routes, goals and only owned party artwork (%s)',language=>{
    const html=renderToStaticMarkup(<AdventureWorld game={initialGame()} characters={CHARACTERS} language={language} ready readGame={initialGame} dispatch={vi.fn()} onParty={vi.fn()} onWish={vi.fn()}/>);
    expect(html).toContain(language==='ja'?'消えた星の灯火':'The missing starlight');
    for(const direction of ['up','down','left','right'])expect(html).toContain(`data-direction="${direction}"`);
    expect(html).toContain(language==='ja'?'灯守に話しかけよう':'Speak to the lightkeeper');
    expect(html).toContain('ember-v1.webp');expect(html).not.toContain('luna-v1.webp');
    expect(html).toContain('aria-label="'+(language==='ja'?'ソヨを先頭にする':'Lead with Breeze')+'"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`aria-label="${language==='ja'?'旅の手帳':'Travel journal'}"`);
    expect(html).toContain(`aria-label="${language==='ja'?'仲間・育成':'Party &amp; training'}"`);
  });
  it('shows an already restored journal without replaying or claiming rewards',()=>{
    const game=initialGame();game.save={...game.save,cleared:[0],adventure:{...newAdventure(),met:[0],opened:['0:west','0:east'],restored:[0]}};
    const html=renderToStaticMarkup(<AdventureWorld game={game} characters={CHARACTERS} language="en" ready readGame={initialGame} dispatch={vi.fn()} onParty={vi.fn()} onWish={vi.fn()}/>);
    expect(html).toContain('Set off for the next island');
    expect(html).toContain('2/2');
  });
  it('keeps an unknown saved companion protected while a newer catalog is still unavailable',()=>{
    const game=initialGame();game.save={...game.save,owned:{'future-cat':{level:8,copies:2}},team:['future-cat']};
    const html=renderToStaticMarkup(<AdventureWorld game={game} characters={CHARACTERS} language="en" ready={false} readGame={()=>game} dispatch={vi.fn()} onParty={vi.fn()} onWish={vi.fn()}/>);
    expect(html.includes('The missing starlight')).toBe(true);
    expect(html).not.toContain('ember-v1.webp');
    expect(game.save.owned['future-cat']).toEqual({level:8,copies:2});
  });
});
