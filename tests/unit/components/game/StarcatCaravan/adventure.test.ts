import { describe, expect, it } from 'vitest';
import { adventureOf, CHAPTERS, checkpoint, fragmentCount, interact, movePoint, neighbors, newAdventure, objective, parseAdventure, pathTo, PLACES, terrain, TRAIL_START, unlockedRegion, visitRegion, walkable, type Place, type Point } from '@/components/game/StarcatCaravan/adventure';
import { gameReducer, initialGame, newSave, parseSave, type GameState } from '@/components/game/StarcatCaravan/engine';

function walkTo(state: GameState, place: Place): GameState {
  const destination = PLACES.find((entry) => entry.id === place)!;
  for (const point of pathTo(state.journey ?? adventureOf(state.save).position, destination)) {
    const here = state.journey ?? adventureOf(state.save).position;
    state = gameReducer(state, {type:'walk', direction: point.x > here.x ? 'right' : point.x < here.x ? 'left' : point.y > here.y ? 'down' : 'up'});
  }
  return state;
}

describe('adventure navigation', () => {
  it('keeps every chest, keeper, camp, fortress and lantern reachable from camp', () => {
    for (const place of PLACES) {
      let point: Point = { ...TRAIL_START };
      const route = pathTo(point, place);
      if (place.id !== 'camp') expect(route.length, place.id).toBeGreaterThan(0);
      for (const next of route) { expect(Math.abs(next.x-point.x)+Math.abs(next.y-point.y)).toBe(1); expect(walkable(next)).toBe(true); point = next; }
      expect(Math.abs(point.x-place.x)+Math.abs(point.y-place.y)).toBe(1);
    }
  });
  it('crosses the river on the bridge, never by teleportation', () => {
    const route = pathTo(TRAIL_START, {x:20,y:10});
    const crossing = route.filter((point) => point.x === 11 || point.x === 12);
    expect(crossing.length).toBeGreaterThan(0);
    expect(crossing.every((p) => terrain(p.x,p.y) === 'bridge')).toBe(true);
  });
  it.each([{x:0,y:1},{x:-1,y:3},{x:24,y:4},{x:3,y:16},{x:11,y:3},{x:3,y:3},{x:8,y:4},{x:3.1,y:11},{x:NaN,y:11}])('blocks solid or invalid tile %o', (point) => {
    expect(walkable(point)).toBe(false);
    expect(pathTo(TRAIL_START, point)).toEqual([]);
  });
  it('refuses a walk into an object or water and keeps navigation on the grid', () => {
    const point = {x:3,y:11};
    expect(movePoint(point,'down')).toBe(point);
    expect(movePoint({x:10,y:4},'right')).toEqual({x:10,y:4});
    expect(neighbors(point)).not.toContainEqual({x:3,y:12});
  });
  it('unlocks only the next previously reachable island', () => {
    expect(visitRegion(newSave(),1)).toEqual(newSave());
    expect(unlockedRegion(newSave(),NaN)).toBe(false);
    const save = {...newSave(),cleared:[0]};
    expect(adventureOf(visitRegion(save,1))).toMatchObject({region:1,position:TRAIL_START});
    expect(visitRegion(save,2)).toBe(save);
  });
  it('changes the leader using only the selected, owned party and keeps levels', () => {
    const state=initialGame();
    const next=gameReducer(state,{type:'leader',id:'moss'});
    expect(next.save.team).toEqual(['moss','ember','brook','breeze']);
    expect(next.save.owned).toBe(state.save.owned);
    expect(gameReducer(next,{type:'leader',id:'luna'})).toBe(next);
  });
});

describe('persistent adventure rewards', () => {
  it('leaves old journals exactly compatible and adds exploration only when needed', () => {
    const legacy = {...newSave(), gems:0,coins:2350,owned:{...newSave().owned,ember:{level:2,copies:5},maple:{level:4,copies:1}}, team:['brook','breeze','moss'], pulls:30,pityFive:30,pityFour:3};
    expect(parseSave(JSON.stringify(legacy))).toEqual(legacy);
    let state:GameState={...initialGame(),save:legacy};
    const old=state.save;
    state=gameReducer(state,{type:'walk',direction:'right'});
    expect(state.save).toBe(old);
    state=gameReducer(state,{type:'checkpoint'});
    expect(state.save.adventure?.position).toEqual({x:4,y:11});
    expect({...state.save,version:1,adventure:undefined,achievements:undefined,encounter:undefined}).toEqual({...legacy,adventure:undefined,achievements:undefined,encounter:undefined});
    expect(state.save.achievements).toEqual(['first-wish','ten-wishes','first-training']);
    expect(state.save.encounter).toBeNull();
    expect(state.save.version).toBe(3);
    expect(parseSave(JSON.stringify(state.save))).toEqual(state.save);
  });
  it('does not grant remotely requested chest, keeper or lantern rewards', () => {
    const save=newSave();
    for (const place of ['west','east','guide','beacon'] as Place[]) expect(interact(save,TRAIL_START,place)).toBe(save);
  });
  it('awards each chest once, preserving ownership, training, pity and the source save', () => {
    let state=walkTo(initialGame(),'west');
    const before=structuredClone(state.save);
    state=gameReducer(state,{type:'interact',place:'west'});
    expect(state.save).toMatchObject({gems:3100,coins:720,adventure:{opened:['0:west']}});
    expect(state.save.owned).toEqual(before.owned);
    expect(state.save.pulls).toBe(0);
    expect(state.save.pityFive).toBe(0);
    expect(before).toEqual(newSave());
    const again=gameReducer(state,{type:'interact',place:'west'});
    expect(again.save).toEqual(state.save);
    const restored=parseSave(JSON.stringify(state.save))!;
    expect(interact(restored,adventureOf(restored).position,'west')).toBe(restored);
  });
  it('requires meeting the keeper, both fragments and the fortress clear before restoring light', () => {
    let state=walkTo(initialGame(),'beacon');
    state=gameReducer(state,{type:'interact',place:'beacon'});
    expect(state.save.gems).toBe(3000);
    state=walkTo(state,'guide'); state=gameReducer(state,{type:'interact',place:'guide'});
    expect(objective(state.save).en).toContain('0/2');
    for (const place of ['west','east'] as Place[]) {state=walkTo(state,place); state=gameReducer(state,{type:'interact',place});}
    expect(fragmentCount(adventureOf(state.save))).toBe(2);
    expect(objective(state.save).en).toContain('fortress');
    state=walkTo(state,'beacon'); state=gameReducer(state,{type:'interact',place:'beacon'});
    expect(state.save.adventure?.restored).toEqual([]);
    state={...state,save:{...state.save,cleared:[0]}};
    state=gameReducer(state,{type:'interact',place:'beacon'});
    expect(state.save).toMatchObject({gems:3350,coins:1040,adventure:{restored:[0]}});
    expect(parseSave(JSON.stringify(state.save))).toEqual(state.save);
    expect(gameReducer(state,{type:'interact',place:'beacon'}).save).toEqual(state.save);
    expect(objective(state.save).en).toContain('next island');
  });
  it('opens an encounter only by the fortress and keeps movement transient during combat', () => {
    expect(gameReducer(initialGame(),{type:'encounter'})).toBeDefined();
    expect(gameReducer(initialGame(),{type:'encounter'}).battle).toBeNull();
    let state=walkTo(initialGame(),'fortress');
    state=gameReducer(state,{type:'encounter'});
    expect(state.arena?.stage).toBe(0);
    expect(state.save.adventure?.position).toEqual(state.journey);
    expect(gameReducer(state,{type:'walk',direction:'up'})).toBe(state);
    expect(gameReducer(state,{type:'travel',region:0})).toBe(state);
    const saved=parseSave(JSON.stringify(state.save))!;
    expect(saved.adventure?.position).toEqual(state.journey);
    expect(saved).not.toHaveProperty('battle');
    expect(saved).not.toHaveProperty('arena');
  });
  it('offers all six complete stories and preserves a separate pair of chests per island', () => {
    let state:GameState={...initialGame(),save:{...newSave(),cleared:[0,1,2,3,4,5]}};
    for(let region=0;region<6;region++){
      state=gameReducer(state,{type:'travel',region});
      for(const place of ['guide','west','east','beacon'] as Place[]){state=walkTo(state,place);state=gameReducer(state,{type:'interact',place});}
      expect(state.save.adventure?.restored).toContain(region);
      expect(parseSave(JSON.stringify(state.save))).toEqual(state.save);
      expect(CHAPTERS[region].story.ja.length).toBeGreaterThan(20);
    }
    expect(state.save.adventure?.opened).toHaveLength(12);
    expect(state.save.adventure?.restored).toHaveLength(6);
    expect(objective(state.save).en).toContain('Chapter complete');
    expect(state.save.gems).toBe(3000+6*350);
  });
  it('keeps the final chapter ending locked until every earlier lantern is restored', () => {
    let state:GameState={...initialGame(),save:{...newSave(),cleared:[0,1,2,3,4,5]}};
    state=gameReducer(state,{type:'travel',region:5});
    for(const place of ['guide','west','east','beacon'] as Place[]){state=walkTo(state,place);state=gameReducer(state,{type:'interact',place});}
    expect(state.save.adventure?.restored).toEqual([]);
    expect(state.save.gems).toBe(3200);
    expect(objective(state.save).en).toContain('earlier lanterns');
  });
  it('refuses malformed new journals instead of silently removing adventure progress', () => {
    const save={...newSave(),adventure:newAdventure()};
    for(const adventure of [null,{}, {...newAdventure(),version:2},{...newAdventure(),position:{x:11,y:2}},{...newAdventure(),opened:['0:west','0:west']},{...newAdventure(),opened:['bad']},{...newAdventure(),restored:[0]},{...newAdventure(),region:5}]) expect(parseSave(JSON.stringify({...save,adventure}))).toBeNull();
    expect(parseAdventure(newAdventure(),[])).toEqual(newAdventure());
    expect(checkpoint(save,{x:11,y:3})).toBe(save);
  });
  it('rejects malformed chest collections before checking restored lantern fragments', () => {
    const restored = {...newAdventure(),met:[0],restored:[0]};
    for (const opened of [null,{},'0:west',[null],['0:west','invalid']]) {
      expect(() => parseAdventure({...restored,opened},[0])).not.toThrow();
      expect(parseAdventure({...restored,opened},[0])).toBeNull();
    }
    expect(parseAdventure({...restored,opened:['0:west','0:east']},[0])).toEqual({...restored,opened:['0:west','0:east']});
  });
});
