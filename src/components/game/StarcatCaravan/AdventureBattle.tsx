'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Coins, Gem, Heart, Pause, Play, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { arenaViewBox, battleDirection, type Arena } from './arena';
import { ELEMENTS, STAGES, characterById, type Character, type Language } from './data';
import { type Action, type GameState, type Save } from './engine';
import { CHAPTERS, type Direction } from './adventure';
import { abilityFor } from './abilities';
import { REACTIONS } from './elements';
import { createBattleAudio } from './battleAudio';
import { CatSprite, ShadowSprite } from './CatSprite';
import styles from './AdventureBattle.module.css';

type Props = { arena: Arena; save: Save; characters: readonly Character[]; language: Language; ready: boolean; dispatch: (action: Exclude<Action,{type:'load'}>) => void; reward: GameState['reward'] };
export default function AdventureBattle({arena,characters,language,ready,dispatch,reward}:Props){
  const tx=(ja:string,en:string)=>language==='ja'?ja:en;
  const root=useRef<HTMLElement>(null),svg=useRef<SVGSVGElement>(null);
  const [viewport,setViewport]=useState({width:960,height:600,compact:false}),[sound,setSound]=useState(false);
  const audio=useRef<ReturnType<typeof createBattleAudio>|null>(null),lastSound=useRef(0),lastPlayed=useRef(0);
  const playing=arena.status==='playing',running=playing&&!arena.paused&&ready;
  const boss=arena.enemies.find(enemy=>enemy.boss);
  useEffect(()=>{
    root.current?.focus({preventScroll:true});
    const observer=new ResizeObserver(([entry])=>{
      if(!entry)return;
      const {width,height}=entry.target.getBoundingClientRect();
      const compact=getComputedStyle(entry.target)?.getPropertyValue('--compact-camera').trim()==='1';
      setViewport({width,height,compact});
    });
    if(svg.current)observer.observe(svg.current);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!running)return;
    const timer=window.setInterval(()=>{if(!document.hidden)dispatch({type:'arena-tick'});},100);
    const hidden=()=>{if(document.hidden)dispatch({type:'arena-pause'});};
    const blur=()=>dispatch({type:'arena-steer',direction:null});
    document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',blur);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',blur);};
  },[dispatch,running]);
  useEffect(()=>()=>audio.current?.dispose(),[]);
  useEffect(()=>{
    const latest=arena.events.at(-1);
    if(!running)audio.current?.stop();
    if(latest&&latest.key>lastSound.current){
      if(sound&&running&&performance.now()-lastPlayed.current>350){audio.current?.play(latest.kind==='burst'?'thunder':latest.kind==='skill'?'support':latest.element==='ice'?'frost':'impact');lastPlayed.current=performance.now();}
      lastSound.current=latest.key;
    }
  },[arena.events,running,sound]);
  const steer=(direction:Direction|null)=>{if(!ready)return;root.current?.focus({preventScroll:true});dispatch({type:'arena-steer',direction});};
  const togglePause=()=>{root.current?.focus({preventScroll:true});dispatch({type:'arena-pause'});};
  const keys=(event:KeyboardEvent)=>{
    if(event.target instanceof HTMLElement&&event.target.closest('button,a,input'))return;
    const direction=battleDirection(event.key);
    if(direction){event.preventDefault();if(!event.repeat)steer(direction);}
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)dispatch({type:'arena-burst'});}
  };
  const target=(event:PointerEvent<SVGSVGElement>)=>{
    if(!running||event.button!==0)return;
    const matrix=svg.current?.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    root.current?.focus({preventScroll:true});dispatch({type:'arena-aim',point:{x:point.x/10,y:point.y/10}});
  };
  const camera=arenaViewBox(arena.player,viewport.width,viewport.height,viewport.compact);
  return <section ref={root} tabIndex={0} className={styles.battle} aria-label={tx('冒険バトル。移動して赤い攻撃を避け、Spaceで星の絆', 'Adventure battle. Move out of red attacks; Space uses Star bond')} onKeyDown={keys} onKeyUp={event=>{if(battleDirection(event.key)){event.preventDefault();steer(null);}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))dispatch({type:'arena-steer',direction:null});}}>
    <header className={styles.header}><div><span>ADVENTURE BATTLE · {String(arena.stage+1).padStart(2,'0')}</span><h2>{STAGES[arena.stage].name[language]}</h2></div><div><button aria-label={tx(`戦闘音 ${sound?'ON':'OFF'}`,`Battle sound ${sound?'ON':'OFF'}`)} aria-pressed={sound} onClick={()=>{root.current?.focus({preventScroll:true});const player=audio.current??=createBattleAudio();player.enable(!sound);setSound(!sound);}}>{sound?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><button disabled={!playing||!ready} aria-label={arena.paused?tx('再開','Resume'):tx('一時停止','Pause')} onClick={togglePause}>{arena.paused?<Play size={18}/>:<Pause size={18}/>}</button><button className={styles.back} aria-label={tx('探索へ戻る','Back to the trail')} onClick={()=>dispatch({type:'leave'})}><ArrowLeft size={18}/><span>{tx('探索へ戻る','Back to the trail')}</span></button></div></header>
    <div className={styles.howTo}><span>{tx('歩いて、かわして、ここぞで一撃。','Move, dodge, and make your moment count.')}</span><p>{tx('通常攻撃は仲間が自動で行います。赤い円から離れよう。大技は「星の絆」ボタンだけ。','Your companions attack automatically. Step out of red circles. Your one big move: Star bond.')}</p></div>
    <div className={styles.field} style={{background:CHAPTERS[arena.stage].grass}}>
      <svg ref={svg} className={styles.scene} viewBox={camera} onPointerDown={target} role="img" aria-label={tx(`戦場：パーティーHP ${Math.ceil(arena.hp)}/${arena.maxHp}、敵${arena.enemies.length}体`,`Battlefield: Party HP ${Math.ceil(arena.hp)}/${arena.maxHp}, ${arena.enemies.length} enemies`)}>
        <rect width="960" height="600" fill={CHAPTERS[arena.stage].grass}/><path d="M0 160Q180 100 400 170T960 130V0H0Z" fill={CHAPTERS[arena.stage].tree} opacity=".3"/><path d="M0 490Q200 430 480 500T960 460V600H0Z" fill={CHAPTERS[arena.stage].tree} opacity=".3"/>
        <ellipse cx="490" cy="310" rx="350" ry="230" fill="#b4b18b" opacity=".35"/><path d="M30 30H930V570H30Z" fill="none" stroke="#355d54" strokeWidth="35" opacity=".3"/>
        {Array.from({length:65},(_,i)=><g key={i} transform={`translate(${40+i*83%880} ${38+i*61%520})`} opacity=".5"><path d="M0 6l-2-5m2 5 3-7" stroke="#d9d9a1"/>{i%5===0&&<circle cx="8" r="2" fill="#ecd6ac"/>}</g>)}
        {arena.target&&<g transform={`translate(${arena.target.x*10} ${arena.target.y*10})`}><circle r="12" fill="none" stroke="#f3e8b5" strokeWidth="2"/><path d="M-17 0h9M8 0h9M0-17v9M0 8v9" stroke="#f3e8b5"/></g>}
        {arena.enemies.filter(enemy=>enemy.windup>arena.time&&enemy.hp>0).map(enemy=><g key={enemy.key} transform={`translate(${enemy.aim.x*10} ${enemy.aim.y*10})`}><circle r={enemy.boss?120:80} fill="#b64d5438" stroke="#f4a29b" strokeWidth="3" strokeDasharray="7 7"/><circle r={(enemy.boss?120:80)*Math.max(0,1-(enemy.windup-arena.time)/(enemy.boss?1.5:1.2))} fill="#df6e6840"/><text y="-8" textAnchor="middle" fontSize="13" fill="#fff2ce" stroke="#674c49" strokeWidth="3" paintOrder="stroke">{tx('よけよう！','Move away!')}</text></g>)}
        {arena.enemies.map(enemy=><g key={enemy.key} transform={`translate(${enemy.x*10} ${enemy.y*10})`} className={styles.enemy}><ellipse cy="21" rx={enemy.boss?35:22} ry="8" fill="#2d414a" opacity=".3"/><svg x={enemy.boss?-45:-29} y={enemy.boss?-70:-45} width={enemy.boss?90:58} height={enemy.boss?105:68}><ShadowSprite boss={enemy.boss}/></svg><rect x="-23" y="-54" width="46" height="4" rx="2" fill="#263c42"/><rect x="-23" y="-54" width={46*Math.max(0,enemy.hp/enemy.maxHp)} height="4" rx="2" fill="#eeb2ae"/>{enemy.aura&&enemy.auraUntil>arena.time&&<text x="32" y="-35" fill={ELEMENTS[enemy.aura].color} stroke="#294347" strokeWidth="3" paintOrder="stroke" fontSize="21">{ELEMENTS[enemy.aura].symbol}</text>}{enemy.frozenUntil>arena.time&&<circle r="34" fill="#b7e5f444" stroke="#d7f2f7" strokeWidth="2"/>}</g>)}
        {[...arena.companions].reverse().map((companion,reverseIndex)=>{const index=arena.companions.length-1-reverseIndex,cat=characterById(companion.id,characters);const offsets=[{x:0,y:0},{x:-5,y:-3},{x:-5,y:3},{x:-10,y:0}];const offset=offsets[index];const x=arena.player.x+(arena.facing==='left'?-offset.x:offset.x),y=arena.player.y+offset.y;return <g key={cat.id} className={styles.companion} style={{transform:`translate(${x*10}px,${y*10}px)`}}><ellipse cy="20" rx="19" ry="6" fill="#274939" opacity=".3"/>{index===0&&arena.shield>0&&<circle r="38" fill="#9fd5f533" stroke="#bde6f9" strokeWidth="2"/>}<g className={arena.direction||arena.target?styles.walking:undefined}><svg x="-29" y="-44" width="58" height="68"><CatSprite cat={cat}/></svg></g>{index===0&&<path d="M-5-53H5L0-47Z" fill="#fff0b8"/>}</g>;})}
        {arena.events.map(effect=><g key={effect.key} transform={`translate(${effect.x*10} ${effect.y*10})`} className={effect.kind==='burst'?styles.burst:styles.effect}>
          {effect.kind==='attack'&&<><path d={`M${(arena.player.x-effect.x)*10} ${(arena.player.y-effect.y)*10}L0 0`} stroke={effect.element?ELEMENTS[effect.element].color:'#efe1a2'} strokeWidth="3" opacity=".7"/><path d="M-9 0H9M0-9V9" stroke="#fff2c6" strokeWidth="3"/></>}
          {effect.kind==='hit'&&<circle r="70" fill="#e6a18b22" stroke="#eeb3a3" strokeWidth="3"/>}
          {effect.kind==='burst'&&<><circle r="95" fill="#fff0ac33" stroke="#ffe2a1" strokeWidth="6"/><path d="M0-95L22-25L95 0L22 25L0 95L-22 25L-95 0L-22-25Z" fill="#fff0b999"/></>}
          {(effect.kind==='skill'||effect.kind==='reaction')&&<text textAnchor="middle" y="-25" fontSize="13" fill="#fff0b7" stroke="#314947" strokeWidth="4" paintOrder="stroke">{effect.reaction?REACTIONS[effect.reaction].name[language]:effect.catId?abilityFor(characterById(effect.catId,characters)).name[language]:''}</text>}
        </g>)}
      </svg>
      <div className={styles.hp}><span><Heart size={14}/>{tx('パーティーHP','PARTY HP')}<b>{Math.ceil(arena.hp)} / {arena.maxHp}</b></span><meter min={0} max={arena.maxHp} value={arena.hp} aria-label={tx('パーティーHP','Party HP')}/>{arena.shield>0&&<small>{tx('結界','Ward')} +{arena.shield}</small>}</div>
      {boss&&<div className={styles.boss}><span>{tx('影の守り手','Shadow guardian')}</span><meter min={0} max={boss.maxHp} value={boss.hp} aria-label={tx('ボスHP','Boss HP')}/></div>}
      {!boss&&playing&&<div className={styles.wave}>{tx('仲間と影を追い払おう','Drive back the shadows together')}</div>}
      {playing&&<><div className={styles.dpad}>{(['up','left','down','right'] as Direction[]).map((direction,i)=>{const Icon=[ArrowUp,ArrowLeft,ArrowDown,ArrowRight][i];return <button key={direction} data-direction={direction} aria-label={tx({up:'上へ移動',down:'下へ移動',left:'左へ移動',right:'右へ移動'}[direction],`Move ${direction}`)} disabled={!running} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);steer(direction);}} onPointerUp={()=>steer(null)} onPointerCancel={()=>steer(null)} onLostPointerCapture={()=>steer(null)} onClick={event=>{if(event.detail===0){steer(direction);steer(null);}}}><Icon size={22}/></button>;})}</div><button className={styles.skill} disabled={!running||arena.charge<100||!arena.enemies.length} onClick={()=>{root.current?.focus({preventScroll:true});dispatch({type:'arena-burst'});}} aria-label={tx('大技・星の絆','Big move: Star bond')} data-ready={arena.charge>=100}><Sparkles size={28}/><strong>{tx('星の絆','Star bond')}</strong><span>{!arena.enemies.length?tx('敵が来たら使える','Ready when enemies arrive'):arena.charge>=100?tx('大技！ · Space','Big move! · Space'):`${Math.floor(arena.charge)}%`}</span><i style={{width:`${arena.charge}%`}}/></button></>}
      {arena.paused&&playing&&<div className={styles.overlay}><Pause size={28}/><h3>{tx('ひとやすみ','A little breather')}</h3><button onClick={togglePause}>{tx('つづける','Continue')}<Play size={17}/></button></div>}
      {!playing&&<div className={styles.overlay} role="status"><Sparkles size={32}/><span>{arena.status==='won'?'A LITTLE VICTORY':'YOUR NEXT TRY'}</span><h3>{arena.status==='won'?tx('みんなで、乗り越えた！','We did it, together!'):tx('もう一度、仲間と。','Another try, together.')}</h3><p>{arena.status==='won'?tx('探索へ戻って、灯火の物語を進めよう。','Return to the trail and continue the lantern’s story.'):tx('赤い円から歩いて離れてみよう。育成・所持品はそのまま、何度でも挑戦できるよ。','Try stepping out of red circles. Your training and treasure are safe; you can try again.')}</p>{arena.status==='won'&&reward&&<div className={styles.rewards}><span><Gem size={18}/>+{reward.gems}</span><span><Coins size={18}/>+{reward.coins}</span></div>}<button onClick={()=>dispatch({type:'leave'})}>{tx('探索の続きへ','Back to the adventure')}<ArrowRight size={18}/></button></div>}
    </div>
    <p className={styles.tip}>{tx('移動：矢印 / WASD / 方向ボタン / 地面をタップ　大技：星の絆 / Space。仲間のHPはパーティー全体で共有します。','Move: arrows / WASD / direction buttons / tap the ground. Big move: Star bond / Space. Your companions share the party HP pool.')}</p>
  </section>;
}
