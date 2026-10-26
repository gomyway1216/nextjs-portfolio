import { Award, Check, Play, RotateCcw, Star } from 'lucide-react';
import { BADGES, earnedBadges } from './achievements';
import { STAGES, type Character, type Language } from './data';
import type { Action, Save } from './engine';
import styles from './Progression.module.css';

export function AchievementBadges({save,language}:{save:Save;language:Language}) {
  const earned=earnedBadges(save),ja=language==='ja';
  return <details className={styles.badges}><summary><Award size={20}/><strong>{ja?'実績バッジ':'Achievement badges'}</strong><span>{BADGES.filter(b=>earned.includes(b.id)).length} / {BADGES.length}</span></summary>
    <p>{ja?'これまでの旅からも自動認定。獲得したバッジは旅の記録に残り、ログイン中はアカウントに保存します。':'Your earlier journey counts too. Earned badges stay in your journal and sync to your account when signed in.'}</p>
    <div className={styles.grid}>{BADGES.map(b=>{const unlocked=earned.includes(b.id);return <article key={b.id} data-earned={unlocked} aria-label={`${b.name[language]} · ${unlocked?(ja?'獲得済み':'Earned'):(ja?'未達成':'Locked')}`}><span className={styles.medal}>{unlocked?<Star size={23} fill="currentColor"/>:<Award size={23}/>}</span><div><h4>{b.name[language]}</h4><p>{b.detail[language]}</p><small>{unlocked?<><Check size={12}/>{ja?'獲得済み':'Earned'}</>:`${Math.min(b.progress(save),b.goal)} / ${b.goal}`}</small></div></article>;})}</div>
  </details>;
}

export function ResumeEncounter({save,characters,language,ready,dispatch}:{save:Save;characters:readonly Character[];language:Language;ready:boolean;dispatch:(action:Exclude<Action,{type:'load'}>)=>void}) {
  const a=save.encounter?.arena;if(!a)return null;
  const ja=language==='ja',seconds=Math.floor(a.time);
  return <section className={styles.resume} aria-label={ja?'中断中の戦闘':'Saved battle'}>
    <div><span>{ja?'旅のつづきから':'YOUR JOURNEY CONTINUES'}</span><h3>{STAGES[a.stage].name[language]}</h3><p data-testid="encounter-summary">{ja?'経過':'Elapsed'} {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} · HP {a.hp}/{a.maxHp} · {ja?'星の絆':'Star bond'} {Math.floor(a.charge)}% · {ja?'敵':'Enemies'} {a.enemies.length}</p><p>{a.companions.map(c=>characters.find(cat=>cat.id===c.id)?.name[language]??c.id).join(' / ')}</p></div>
    <div className={styles.actions}><button disabled={!ready} onClick={()=>dispatch({type:'resume'})}><Play size={16}/>{ja?'戦闘を再開':'Resume battle'}</button><button disabled={!ready} onClick={()=>dispatch({type:'restart-encounter'})}><RotateCcw size={15}/>{ja?'今の編成で最初から':'Restart with current party'}</button><button disabled={!ready} onClick={()=>dispatch({type:'abandon-encounter'})}>{ja?'中断記録を終了':'End this attempt'}</button></div>
    <small>{ja?'再開は中断時の編成・能力から。最初から挑んだり記録を終了しても、通貨・育成・勝敗は減りません。':'Resume with the party and stats from that battle. Restarting or ending this attempt keeps currencies, training and win/loss records.'}</small>
  </section>;
}
