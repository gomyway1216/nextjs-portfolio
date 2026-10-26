import { describe, expect, it } from 'vitest';
import { worldViewBox, MAP_WIDTH, MAP_HEIGHT, TILE } from '@/components/game/StarcatCaravan/adventure';
import { arenaViewBox, castArenaBurst, createArena, tickArena } from '@/components/game/StarcatCaravan/arena';
import { newSave, type Save } from '@/components/game/StarcatCaravan/engine';

function finish(save:Save,stage:number,useSkill:boolean){
  let arena=createArena(save,stage)!;
  for(let n=0;n<1801&&arena.status==='playing';n++){
    if(useSkill&&arena.charge>=100&&(arena.enemies.length>=2||arena.enemies.some(e=>e.boss)))arena=castArenaBurst(arena);
    arena=tickArena(arena);
  }
  return arena;
}

describe('mobile play and relaxed progression',()=>{
  it.each([[302,302],[372,372],[550,170],[826,180]])('fills a %s×%s compact trail without cropping its center or leaving empty bands',(width,height)=>{
    for(const position of [{x:1,y:1},{x:12,y:8},{x:22,y:14}]){
      const [x,y,w,h]=worldViewBox(position,width,height,true).split(' ').map(Number);
      expect(w/h).toBeCloseTo(width/height);
      expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
      expect(x+w).toBeLessThanOrEqual(MAP_WIDTH*TILE);expect(y+h).toBeLessThanOrEqual(MAP_HEIGHT*TILE);
      expect(position.x*TILE+TILE/2).toBeGreaterThanOrEqual(x);expect(position.x*TILE+TILE/2).toBeLessThanOrEqual(x+w);
      expect(position.y*TILE+TILE/2).toBeGreaterThanOrEqual(y);expect(position.y*TILE+TILE/2).toBeLessThanOrEqual(y+h);
    }
  });
  it('keeps desktop exploration unchanged and ignores unavailable layout measurements',()=>{
    for(const [width,height,compact] of [[1160,650,false],[0,0,true],[-1,300,true]] as const)expect(worldViewBox({x:3,y:11},width,height,compact)).toBe('0 0 960 640');
  });
  it('shows an entire boss warning circle around the party in short landscape battle viewports',()=>{
    for(const [width,height] of [[550,173],[826,243]]){
      const [x,y,w,h]=arenaViewBox({x:50,y:30},width,height,true).split(' ').map(Number);
      expect(w/h).toBeCloseTo(width/height);
      expect(y).toBeLessThanOrEqual(300-120);expect(y+h).toBeGreaterThanOrEqual(300+120);
      expect(x).toBeLessThanOrEqual(500-120);expect(x+w).toBeGreaterThanOrEqual(500+120);
    }
  });
  it('lets the initial free party clear the first island without rapid inputs or prior training',()=>{
    const save=newSave(),before=structuredClone(save);
    const result=finish(save,0,true);
    expect(result.status).toBe('won');expect(result.time).toBeLessThan(60);expect(result.hp/result.maxHp).toBeGreaterThan(.5);
    expect(save).toEqual(before);
  });
  it('keeps later islands worth training for and allows a party without a healer to clear the campaign',()=>{
    expect(finish({...newSave(),cleared:[0,1,2,3,4]},5,false).status).toBe('lost');
    const team=['ember','spark','brook','breeze'];
    const save={...newSave(),team,cleared:[0,1,2,3,4],owned:Object.fromEntries(team.map(id=>[id,{level:10,copies:1}]))};
    const final=finish(save,5,true);
    expect(final.status).toBe('won');expect(final.time).toBeLessThan(180);expect(final.hp).toBeGreaterThan(0);
  });
});
