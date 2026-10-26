import { describe, expect, it } from 'vitest';
import { GUEST, RETRY_AFTER, slotFor, type Player } from '@/components/game/MedalPusher/account';
import { SAVE_KEY } from '@/components/game/StarcatCaravan/data';
import { newSave, parseSave } from '@/components/game/StarcatCaravan/engine';
import { createProgress } from '@/components/game/StarcatCaravan/progress';
import { adventureOf, pathTo, PLACES, type Place } from '@/components/game/StarcatCaravan/adventure';
import { FakeAccounts, FakeSlots, RESTORING, settled, signedIn } from '../MedalPusher/accountFakes';

function rig() {
  const clock = { now: Date.UTC(2026, 9, 25) };
  const slots = new FakeSlots();
  const accounts = new FakeAccounts(() => clock.now);
  let marks = 0;
  const make = () => createProgress({ store: accounts.store, slots: () => slots, now: () => clock.now, mark: () => `starcat-${++marks}` });
  const start = async (player: Player = GUEST) => {
    const progress = make();
    progress.attend(player);
    progress.start();
    await settled();
    return progress;
  };
  return { clock, slots, accounts, make, start };
}

type Progress = ReturnType<typeof createProgress>;

function finishBattle(progress: Progress, deploy: boolean) {
  for (let step = 0; step < 1801 && progress.getSnapshot().game.battle?.status === 'playing'; step++) {
    if (deploy && step % 20 === 0) {
      for (const id of ['brook', 'ember', 'breeze', 'moss']) progress.dispatch({ type: 'deploy', id });
    }
    if (deploy && progress.getSnapshot().game.battle!.units.some((unit) => unit.side === 'enemy' && unit.x < 60)) progress.dispatch({ type: 'cannon' });
    progress.dispatch({ type: 'tick' });
  }
}

describe('Starcat account progress', () => {
  it('restores exploration, chests, conversations and lanterns on an independent account device', async () => {
    const { start, accounts, clock } = rig();
    const progress = await start(signedIn('ann'));
    const walk = (place: Place) => {
      const game=progress.getSnapshot().game;
      for(const point of pathTo(game.journey ?? adventureOf(game.save).position,PLACES.find(p=>p.id===place)!)){
        const current=progress.getSnapshot().game;
        const here=current.journey ?? adventureOf(current.save).position;
        progress.dispatch({type:'walk',direction:point.x>here.x?'right':point.x<here.x?'left':point.y>here.y?'down':'up'});
      }
    };
    progress.dispatch({type:'upgrade',id:'ember'});
    progress.dispatch({type:'leader',id:'brook'});
    for(const place of ['guide','west','east'] as Place[]) {walk(place);progress.dispatch({type:'interact',place});}
    walk('fortress');progress.dispatch({type:'encounter'});
    for(let step=0;step<1801&&progress.getSnapshot().game.arena?.status==='playing';step++){
      const arena=progress.getSnapshot().game.arena!;
      if(arena.charge>=100&&(arena.enemies.length>=2||arena.enemies.some(e=>e.boss)))progress.dispatch({type:'arena-burst'});
      progress.dispatch({type:'arena-tick'});
    }
    expect(progress.getSnapshot().game.arena?.status).toBe('won');
    progress.dispatch({type:'leave'});walk('beacon');progress.dispatch({type:'interact',place:'beacon'});
    const expected=structuredClone(progress.getSnapshot().game.save);
    expect(expected).toMatchObject({gems:3850,coins:1230,owned:{ember:{level:2}},team:['brook','ember','breeze','moss'],adventure:{met:[0],opened:['0:west','0:east'],restored:[0]}});
    progress.close();await settled();
    const newDevice = createProgress({store:accounts.store,slots:()=>newDeviceSlots,now:()=>clock.now,mark:()=> 'independent-adventure-device'});
    const newDeviceSlots = new FakeSlots();
    newDevice.attend(signedIn('ann'));newDevice.start();await settled();
    expect(newDevice.getSnapshot().game.save).toEqual(expected);
    expect(newDevice.getSnapshot().game.battle).toBeNull();
    newDevice.dispatch({type:'interact',place:'beacon'});
    expect(newDevice.getSnapshot().game.save).toEqual(expected);
    newDevice.close();
  });

  it('checkpoints walking on save/close without sending a reward or losing the last position', async () => {
    const {start,accounts}=rig();const progress=await start(signedIn('ann'));
    progress.dispatch({type:'walk',direction:'right'});
    expect(progress.getSnapshot().game.save.adventure).toBeUndefined();
    progress.save('hidden');
    expect(progress.getSnapshot().game.save.adventure?.position).toEqual({x:4,y:11});
    progress.dispatch({type:'walk',direction:'up'});progress.close();await settled();
    expect(parseSave(accounts.text('ann'))).toMatchObject({gems:3000,coins:600,adventure:{position:{x:4,y:10}}});
  });

  it('keeps the old member’s final walking position when another account signs in', async () => {
    const {start,accounts}=rig();
    accounts.put('bob',JSON.stringify({...newSave(),coins:900}),'bob-original');
    const progress=await start(signedIn('ann'));
    progress.dispatch({type:'walk',direction:'right'});
    progress.attend(signedIn('bob'));await settled();
    // Signing out retains unsent work in the old account's slot, without using its old credentials.
    expect(parseSave(accounts.text('ann'))?.adventure).toBeUndefined();
    expect(progress.getSnapshot().game.save.coins).toBe(900);
    expect(progress.getSnapshot().game.save.adventure).toBeUndefined();
    progress.dispatch({type:'walk',direction:'up'});
    progress.attend(signedIn('ann'));await settled();
    expect(progress.getSnapshot().game.save.adventure?.position).toEqual({x:4,y:11});
    expect(progress.getSnapshot().game.save.coins).toBe(600);
    progress.attend(signedIn('bob'));await settled();
    expect(progress.getSnapshot().game.save.adventure?.position).toEqual({x:3,y:10});
    expect(progress.getSnapshot().game.save.coins).toBe(900);
    progress.close();await settled();
    expect(parseSave(accounts.text('bob'))?.adventure?.position).toEqual({x:3,y:10});
  });

  it('walks a queued route synchronously even when React has not rendered any intermediate position', async () => {
    const {start}=rig();const progress=await start();
    const points=pathTo(adventureOf(progress.getSnapshot().game.save).position,PLACES.find(p=>p.id==='east')!);
    let currentPoint=adventureOf(progress.getSnapshot().game.save).position;
    for(const next of points){
      const direction=next.x>currentPoint.x?'right':next.x<currentPoint.x?'left':next.y>currentPoint.y?'down':'up';
      currentPoint=next;
      progress.dispatch({type:'walk',direction});
      expect(progress.getSnapshot().game.journey).toEqual(next);
    }
    progress.save('hidden');
    expect(progress.getSnapshot().game.save.adventure?.position).toEqual(points.at(-1));
    progress.close();
  });

  it('saves and restores currency, companions, training, party, pity, and battle records from real actions', async () => {
    const { start, accounts } = rig();
    const progress = await start(signedIn('ann'));
    progress.dispatch({ type: 'summon', count: 1, rolls: [0, 0] });
    progress.dispatch({ type: 'close-pulls' });
    progress.dispatch({ type: 'summon', count: 1, rolls: [0.9, 0] });
    progress.dispatch({ type: 'close-pulls' });
    progress.dispatch({ type: 'upgrade', id: 'ember' });
    progress.dispatch({ type: 'start', stage: 0 });
    finishBattle(progress, true);
    expect(progress.getSnapshot().game.battle?.status).toBe('won');
    progress.dispatch({ type: 'leave' });
    progress.dispatch({ type: 'start', stage: 1 });
    finishBattle(progress, false);
    expect(progress.getSnapshot().game.battle?.status).toBe('lost');
    progress.dispatch({ type: 'leave' });
    progress.dispatch({ type: 'team', id: 'breeze' });
    progress.dispatch({ type: 'team', id: 'luna' });
    const expected = structuredClone(progress.getSnapshot().game.save);
    expect(expected).toMatchObject({ gems: 3300, coins: 870, pulls: 2, pityFive: 1, pityFour: 1, wins: 1, losses: 1, cleared: [0], team: ['ember', 'brook', 'moss', 'luna'] });
    expect(expected.owned.ember).toEqual({ level: 2, copies: 2 });
    expect(expected.owned.luna).toEqual({ level: 1, copies: 1 });
    progress.close();
    await settled();
    expect(parseSave(accounts.text('ann'))).toEqual(expected);
    const reopened = await start(signedIn('ann'));
    expect(reopened.getSnapshot()).toMatchObject({ ready: true, playable: true, game: { save: expected, battle: null, pulls: [], reward: null } });
    reopened.close();
  });

  it('adopts an existing browser journal for an account with no save', async () => {
    const { slots, accounts, start } = rig();
    const legacy = { ...newSave(), gems: 1765, coins: 940, cleared: [0, 1], wins: 3, losses: 1, pityFive: 27, pityFour: 4, pulls: 43 };
    slots.setItem(SAVE_KEY, JSON.stringify(legacy));
    const progress = await start(signedIn('ann'));
    expect(progress.getSnapshot().game.save).toEqual(legacy);
    expect(parseSave(accounts.text('ann'))).toEqual(legacy);
    expect(slots.getItem(SAVE_KEY)).toBeNull();
    expect(slots.getItem(slotFor(SAVE_KEY, 'ann'))).not.toBeNull();
    progress.close();
  });

  it('opens an existing account instead of guest progress and retains the guest journal on sign-out', async () => {
    const { slots, accounts, start } = rig();
    const guest = { ...newSave(), gems: 1777 };
    const account = { ...newSave(), gems: 8888, cleared: [0, 1, 2], wins: 7 };
    slots.setItem(SAVE_KEY, JSON.stringify(guest));
    accounts.put('ann', JSON.stringify(account), 'another-device');
    const progress = await start(signedIn('ann'));
    expect(progress.getSnapshot().game.save).toEqual(account);
    expect(parseSave(slots.getItem(SAVE_KEY))).toEqual(guest);
    progress.attend(GUEST);
    expect(progress.getSnapshot()).toMatchObject({ playable: true, game: { save: guest } });
    expect(parseSave(accounts.text('ann'))).toEqual(account);
    progress.close();
  });

  it('isolates accounts and keeps unsent changes in their own slot when switching or signing out', async () => {
    const { accounts, start } = rig();
    const ann = { ...newSave(), gems: 1200 };
    const bob = { ...newSave(), gems: 5600 };
    accounts.put('ann', JSON.stringify(ann), 'ann-original');
    accounts.put('bob', JSON.stringify(bob), 'bob-original');
    const progress = await start(signedIn('ann'));
    progress.dispatch({ type: 'upgrade', id: 'ember' });
    const annAfterTraining = structuredClone(progress.getSnapshot().game.save);
    progress.attend(signedIn('bob'));
    expect(progress.getSnapshot().playable).toBe(false);
    await settled();
    expect(progress.getSnapshot().game.save).toEqual(bob);
    progress.dispatch({ type: 'upgrade', id: 'brook' });
    const bobAfterTraining = structuredClone(progress.getSnapshot().game.save);
    progress.attend(GUEST);
    expect(progress.getSnapshot().game.save).toEqual(newSave());
    expect(accounts.forgotten).toContain('ann');
    expect(accounts.forgotten).toContain('bob');
    progress.attend(signedIn('ann'));
    await settled();
    expect(progress.getSnapshot().game.save).toEqual(annAfterTraining);
    progress.attend(signedIn('bob'));
    await settled();
    expect(progress.getSnapshot().game.save).toEqual(bobAfterTraining);
    progress.close();
  });

  it('blocks play during session restoration and ignores a previous account’s late read', async () => {
    const { accounts, make } = rig();
    accounts.put('ann', JSON.stringify({ ...newSave(), gems: 1111 }), 'ann-cloud');
    accounts.put('bob', JSON.stringify({ ...newSave(), gems: 2222 }), 'bob-cloud');
    accounts.heldReads = [];
    const progress = make();
    progress.attend(RESTORING);
    progress.start();
    const before = progress.getSnapshot().game;
    progress.dispatch({ type: 'summon', count: 1, rolls: [0.9, 0] });
    expect(progress.getSnapshot().game).toBe(before);
    expect(progress.getSnapshot().playable).toBe(false);
    progress.attend(signedIn('ann'));
    progress.attend(signedIn('bob'));
    expect(accounts.heldReads).toHaveLength(2);
    accounts.heldReads[1]();
    await settled();
    expect(progress.getSnapshot().game.save.gems).toBe(2222);
    accounts.heldReads[0]();
    await settled();
    expect(progress.getSnapshot().game.save.gems).toBe(2222);
    expect(progress.getSnapshot().playable).toBe(true);
    expect(accounts.count('store')).toBe(0);
    progress.close();
  });

  it('does not spend or overwrite an unread account after load failure, then retries safely', async () => {
    const { accounts, clock, start } = rig();
    const cloud = { ...newSave(), gems: 4567, pityFive: 28 };
    accounts.put('ann', JSON.stringify(cloud), 'cloud');
    accounts.down = true;
    const progress = await start(signedIn('ann'));
    expect(progress.getSnapshot()).toMatchObject({ playable: false, status: { where: 'offline' } });
    const before = progress.getSnapshot().game;
    progress.dispatch({ type: 'summon', count: 1, rolls: [0, 0] });
    progress.save('hidden');
    expect(progress.getSnapshot().game).toBe(before);
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
    expect(parseSave(accounts.text('ann'))).toEqual(cloud);
    accounts.down = false;
    clock.now += RETRY_AFTER[0] * 1000;
    progress.save();
    await settled();
    expect(progress.getSnapshot()).toMatchObject({ playable: true, game: { save: cloud }, status: { where: 'account' } });
    progress.close();
  });

  it('allows the same cached account to play offline and syncs that progress after retry', async () => {
    const { accounts, clock, start } = rig();
    const first = await start(signedIn('ann'));
    first.dispatch({ type: 'upgrade', id: 'ember' });
    const cached = structuredClone(first.getSnapshot().game.save);
    first.close();
    await settled();
    accounts.down = true;
    const offline = await start(signedIn('ann'));
    expect(offline.getSnapshot()).toMatchObject({ playable: true, game: { save: cached }, status: { where: 'offline' } });
    clock.now += 1000;
    offline.dispatch({ type: 'upgrade', id: 'brook' });
    const expected = structuredClone(offline.getSnapshot().game.save);
    expect(expected.owned.brook.level).toBe(2);
    expect(parseSave(accounts.text('ann'))).toEqual(cached);
    accounts.down = false;
    clock.now += RETRY_AFTER[0] * 1000;
    offline.save();
    await settled();
    expect(parseSave(accounts.text('ann'))).toEqual(expected);
    expect(offline.getSnapshot().status.where).toBe('account');
    offline.close();
  });

  it('holds an unreadable future cloud journal without replacing it with a fresh game', async () => {
    const { accounts, start } = rig();
    const future = JSON.stringify({ ...newSave(), version: 2, gems: 9999 });
    accounts.put('ann', future, 'future');
    const progress = await start(signedIn('ann'));
    expect(progress.getSnapshot()).toMatchObject({ playable: false, status: { where: 'unreadable' } });
    const before = progress.getSnapshot().game;
    progress.dispatch({ type: 'upgrade', id: 'ember' });
    expect(progress.getSnapshot().game).toBe(before);
    progress.save('hidden');
    progress.close();
    await settled();
    expect(accounts.text('ann')).toBe(future);
    expect(accounts.count('store') + accounts.count('storeNow')).toBe(0);
  });

  it('restores lasting progress without restoring a wish dialog or an unfinished battle', async () => {
    const { start, slots } = rig();
    const first = await start();
    first.dispatch({ type: 'summon', count: 1, rolls: [0.9, 0] });
    expect(first.getSnapshot().game.pulls).toHaveLength(1);
    first.close();
    const second = await start();
    expect(second.getSnapshot().game).toMatchObject({ pulls: [], battle: null, reward: null, save: { gems: 2900, pulls: 1 } });
    second.dispatch({ type: 'start', stage: 0 });
    second.dispatch({ type: 'deploy', id: 'ember' });
    second.dispatch({ type: 'tick' });
    expect(second.getSnapshot().game.battle?.units).toHaveLength(1);
    const save = structuredClone(second.getSnapshot().game.save);
    second.close();
    expect(parseSave(slots.getItem(SAVE_KEY))).toEqual(save);
    const third = await start();
    expect(third.getSnapshot().game).toEqual({ save, battle: null, pulls: [], reward: null });
    third.close();
  });

  it.each(['hidden', 'close'] as const)('flushes pending progress with keepalive on %s without a duplicate close write', async (event) => {
    const { start, accounts } = rig();
    const progress = await start(signedIn('ann'));
    const writes = accounts.count('store');
    progress.dispatch({ type: 'summon', count: 1, rolls: [0.9, 0] });
    const expected = structuredClone(progress.getSnapshot().game.save);
    expect(accounts.count('store')).toBe(writes);
    if (event === 'hidden') progress.save('hidden');
    else progress.close();
    await settled();
    expect(accounts.count('storeNow')).toBe(1);
    expect(parseSave(accounts.text('ann'))).toEqual(expected);
    progress.close();
    await settled();
    expect(accounts.count('storeNow')).toBe(1);
    expect(accounts.forgotten).toEqual(['ann']);
  });
});

describe('ascension, badges and resumable account encounters',()=>{
  it('restores promotion, badges and the same battle on an independent device, then checkpoints back without changing ownership',async()=>{
    const {start,accounts,clock}=rig();
    const legacy={...newSave(),coins:5000,owned:{...newSave().owned,ember:{level:5,copies:3}}};
    accounts.put('ann',JSON.stringify(legacy),'legacy');
    const first=await start(signedIn('ann'));
    first.dispatch({type:'ascend',id:'ember'});
    const walk=(progress:Progress)=>{
      const game=progress.getSnapshot().game;
      for(const point of pathTo(adventureOf(game.save).position,PLACES.find(p=>p.id==='fortress')!)){
        const current=progress.getSnapshot().game,here=current.journey??adventureOf(current.save).position;
        progress.dispatch({type:'walk',direction:point.x>here.x?'right':point.x<here.x?'left':point.y>here.y?'down':'up'});
      }
    };
    walk(first);first.dispatch({type:'encounter'});
    for(let n=0;n<41;n++)first.dispatch({type:'arena-tick'});
    first.dispatch({type:'arena-steer',direction:'up'});
    first.dispatch({type:'leave'});await settled();
    const expected=structuredClone(first.getSnapshot().game.save);
    expect(expected.owned.ember).toEqual({level:5,copies:3,stars:4});
    expect(expected.achievements).toContain('first-ascension');
    expect(expected.encounter!.arena).toMatchObject({paused:true,time:expect.closeTo(4.1),direction:null,target:null});
    // Save & leave must reach the account even though only four seconds passed since battle entry.
    expect(parseSave(accounts.text('ann'))).toEqual(expected);
    first.close();await settled();
    const otherSlots=new FakeSlots(),second=createProgress({store:accounts.store,slots:()=>otherSlots,now:()=>clock.now,mark:()=> 'second-resume-device'});
    clock.now+=60_000;second.attend(signedIn('ann'));second.start();await settled();
    expect(second.getSnapshot().game.save).toEqual(expected);
    expect(second.getSnapshot().game.arena).toBeUndefined();
    second.dispatch({type:'resume'});
    expect(second.getSnapshot().game.arena).toEqual({...expected.encounter!.arena,paused:false});
    second.dispatch({type:'arena-tick'});second.dispatch({type:'leave'});
    const returned=structuredClone(second.getSnapshot().game.save);
    expect(returned.encounter!.arena.time).toBeCloseTo(4.2);
    expect(returned.achievements).toContain('resumed');
    expect(returned.owned).toEqual(expected.owned);expect(returned.coins).toBe(4400);expect(returned.wins).toBe(0);
    second.close();await settled();
    const back=await start(signedIn('ann'));expect(back.getSnapshot().game.save).toEqual(returned);back.close();
  });
  it('keeps a battle local to the former account when switching and retries the checkpoint after offline play',async()=>{
    const {start,accounts,clock}=rig();
    const first=await start(signedIn('ann'));
    const game=first.getSnapshot().game;
    for(const point of pathTo(adventureOf(game.save).position,PLACES.find(p=>p.id==='fortress')!)){
      const current=first.getSnapshot().game,here=current.journey??adventureOf(current.save).position;
      first.dispatch({type:'walk',direction:point.x>here.x?'right':point.x<here.x?'left':point.y>here.y?'down':'up'});
    }
    first.dispatch({type:'encounter'});for(let n=0;n<15;n++)first.dispatch({type:'arena-tick'});
    accounts.down=true;first.save('hidden');await settled();
    const frozen=structuredClone(first.getSnapshot().game.save.encounter);
    first.attend(GUEST);await settled();expect(first.getSnapshot().game.save.encounter).toBeUndefined();
    first.attend(signedIn('ann'));await settled();
    expect(first.getSnapshot().playable).toBe(true);expect(first.getSnapshot().game.save.encounter).toEqual(frozen);
    first.dispatch({type:'resume'});first.dispatch({type:'arena-tick'});first.dispatch({type:'leave'});
    const newer=structuredClone(first.getSnapshot().game.save);
    accounts.down=false;clock.now+=RETRY_AFTER[0]*1000;first.save('tick');await settled();first.close();await settled();
    expect(parseSave(accounts.text('ann'))).toEqual(newer);
    const bob=await start(signedIn('bob'));expect(bob.getSnapshot().game.save.encounter).toBeUndefined();expect(bob.getSnapshot().game.save.coins).toBe(600);bob.close();
  });
  it('protects malformed cloud battle data without stripping a promotion or overwriting the cloud',async()=>{
    const {start,accounts}=rig();
    const malformed=JSON.stringify({...newSave(),version:3,adventure:{version:1,region:0,position:{x:3,y:11},met:[],opened:[],restored:[]},owned:{...newSave().owned,ember:{level:10,copies:4,stars:5}},achievements:['first-ascension'],encounter:{version:1,arena:{stage:0,hp:10}}});
    accounts.put('ann',malformed,'protect-battle');
    const progress=await start(signedIn('ann'));
    expect(progress.getSnapshot().playable).toBe(false);expect(progress.getSnapshot().status.where).toBe('unreadable');
    progress.dispatch({type:'ascend',id:'ember'});progress.dispatch({type:'abandon-encounter'});progress.save('hidden');progress.close();await settled();
    expect(accounts.text('ann')).toBe(malformed);expect(accounts.count('store')).toBe(0);
  });
  it('does not rewrite a loaded legacy journal merely to award badges while a newer cloud record is being read',async()=>{
    const {start,accounts}=rig();const legacy={...newSave(),pulls:30,coins:2350};
    accounts.put('ann',JSON.stringify(legacy),'legacy-migration');
    const progress=await start(signedIn('ann'));await settled();
    expect(progress.getSnapshot().game.save).toEqual(legacy);expect(accounts.count('store')).toBe(0);
    progress.close();await settled();expect(accounts.text('ann')).toBe(JSON.stringify(legacy));
  });
});
