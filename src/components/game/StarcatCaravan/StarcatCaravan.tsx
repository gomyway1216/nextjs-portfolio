'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Coins, Compass, Gem, Pause, Play, Shield, Sparkles, Users, Volume2, VolumeX, WandSparkles } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { GUEST, type AccountStore, type Player } from '../MedalPusher/account';
import { CHARACTERS, ELEMENTS, PITY_FIVE, PITY_FOUR, ROLES, STAGES, SUMMON_COST, characterById, type Character, type Language } from './data';
import { COMMAND_COST, type Battle } from './engine';
import { REACTIONS } from './elements';
import { abilityFor } from './abilities';
import { abilityCue, createBattleAudio, reactionCue } from './battleAudio';
import { useProgress } from './useProgress';
import { CatSprite, ShadowSprite } from './CatSprite';
import SummonShow from './SummonShow';
import { CompanionCollection, PartyOverview, TravelRecord } from './Companions';
import { GUIDE_URL } from './guide';
import AdventureWorld from './AdventureWorld';
import { adventureOf } from './adventure';
import styles from './StarcatCaravan.module.css';

type View = 'summon' | 'adventure' | 'collection';
const colorStyle = (cat: Character) => ({ '--cat-accent': cat.accent, '--rarity': cat.rarity === 5 ? '#f2d584' : cat.rarity === 4 ? '#c0a4e9' : '#8ac6d0' }) as CSSProperties;

function Battlefield({ battle, language, characters }: { battle: Battle; language: Language; characters: readonly Character[] }) {
  const stage = STAGES[battle.stage];
  return <div className={styles.battlefield} data-paused={battle.paused}>
    <div className={styles.baseMeters}>
      <div><span>{language === 'ja' ? 'キャラバン' : 'Caravan'} <b>{Math.ceil(battle.baseHp)} / 1,000</b></span><meter min={0} max={1000} value={battle.baseHp} aria-label={language === 'ja' ? '味方拠点HP' : 'Caravan HP'} /></div>
      <div><span>{language === 'ja' ? '影の砦' : 'Shadow fortress'} <b>{Math.ceil(battle.enemyHp)} / {stage.hp}</b></span><meter min={0} max={stage.hp} value={battle.enemyHp} aria-label={language === 'ja' ? '敵拠点HP' : 'Enemy fortress HP'} /></div>
    </div>
    <svg viewBox="0 0 1000 300" className={styles.battleScene} role="img" aria-label={language === 'ja' ? `戦場：味方${battle.units.filter((u) => u.side === 'ally').length}体、敵${battle.units.filter((u) => u.side === 'enemy').length}体` : `Battlefield: ${battle.units.filter((u) => u.side === 'ally').length} allies, ${battle.units.filter((u) => u.side === 'enemy').length} enemies`}>
      <circle cx="710" cy="55" r="31" fill="#f5e7be" opacity=".85" />
      <g fill="#e7d8aa" opacity=".65">{[80, 190, 340, 460, 570, 810, 910].map((x, i) => <circle key={x} cx={x} cy={20 + i % 3 * 24} r={i % 2 + 1} />)}</g>
      <path d="M0 179L135 105L240 151L390 90L510 158L650 103L820 169L930 101L1000 151V300H0Z" fill="#283c55" />
      <path d="M0 218Q180 138 360 211T700 199T1000 208V300H0Z" fill="#345557" />
      <path d="M0 252Q200 228 400 249T1000 250V300H0Z" fill="#4c6f63" />
      <path d="M0 270Q400 257 1000 274" stroke="#a3b488" strokeWidth="3" opacity=".5" />
      <g transform="translate(30 158)"><path d="M0 42L40 7L84 42V100H0Z" fill="#bd9b70" stroke="#483b3a" strokeWidth="3" /><path d="M-9 45L40 0L94 45" stroke="#8fbeb0" strokeWidth="13" strokeLinejoin="round" /><path d="M31 100V65Q42 52 53 65V100" fill="#40565b" /><circle cx="15" cy="108" r="12" fill="#384852" /><circle cx="70" cy="108" r="12" fill="#384852" /><path d="M37 23L41 14L45 23L54 25L46 31L47 40L41 35L34 40L35 31L28 25Z" fill="#ffdf8b" /></g>
      <g transform="translate(888 135)"><path d="M0 18H22V0H40V18H66V0H84V18H100V120H0Z" fill="#756a86" stroke="#36374f" strokeWidth="3" /><path d="M33 120V82Q50 56 67 82V120" fill="#3a3556" /><path d="M19 42H29V60H19ZM71 42H81V60H71Z" fill="#edc68d" /></g>
      {battle.units.map((unit) => <g key={unit.key} transform={`translate(${unit.x * 10 - (unit.boss ? 40 : 27)},${unit.boss ? 158 : 182 + unit.key % 3 * 8})`} opacity={unit.flash > 0 ? 0.65 : 1}>
        {(unit.shield ?? 0) > 0 && <ellipse cx="27" cy="30" rx="34" ry="43" fill="#a5d9ff19" stroke="#a5d9ff" strokeWidth="2" />}
        {(unit.frozenUntil ?? 0) > battle.time && <rect x="-4" y="-3" width={unit.boss ? 90 : 64} height={unit.boss ? 105 : 75} rx="12" fill="#c1f2ff45" stroke="#a8e2f5" />}
        <svg width={unit.boss ? 84 : 56} height={unit.boss ? 98 : 66} overflow="visible">{unit.catId ? <CatSprite cat={characterById(unit.catId, characters)} /> : <ShadowSprite boss={unit.boss} />}</svg>
        {unit.side === 'enemy' && unit.aura && (unit.auraUntil ?? 0) > battle.time && <text y="-13" x="23" textAnchor="middle" fill={ELEMENTS[unit.aura].color} fontSize="18">{ELEMENTS[unit.aura].symbol}</text>}
        <rect y="-7" width={unit.boss ? 80 : 52} height="4" rx="2" fill="#1a2638" /><rect y="-7" width={(unit.boss ? 80 : 52) * Math.max(0, unit.hp / unit.maxHp)} height="4" rx="2" fill={unit.side === 'ally' ? '#a4dfb9' : '#eab1b9'} />
      </g>)}
      {battle.skills.map((event) => <g key={event.key} transform={`translate(${event.x * 10},125)`} className={styles.reactionBurst}><circle r="30" fill="none" stroke="#d3e9ff" strokeWidth="2" /><text textAnchor="middle" fill="#f8e6b5" fontSize="15" fontWeight="bold" stroke="#142039" strokeWidth="4" paintOrder="stroke">{abilityFor(characterById(event.catId, characters)).name[language]}</text></g>)}
      {battle.reactions.map((event) => <g key={event.key} className={styles.reactionBurst} style={{ color: REACTIONS[event.kind].color }} transform={`translate(${event.x * 10},145)`}><circle r="36" fill="none" stroke="currentColor" strokeWidth="3" opacity=".6" /><text textAnchor="middle" fill="currentColor" fontSize="17" fontWeight="bold" stroke="#142039" strokeWidth="4" paintOrder="stroke">{REACTIONS[event.kind].name[language]}</text></g>)}
      {battle.cannonFlash > 0 && <path d="M82 202H930" stroke="#fff0a3" strokeWidth="14" opacity={battle.cannonFlash} />}
    </svg>
    <div className={styles.reactionLog} role="status">{battle.reactions.map((event) => <span key={event.key} style={{ color: REACTIONS[event.kind].color }}>{REACTIONS[event.kind].name[language]}</span>)}{battle.skills.map((event) => <span key={event.key}>{abilityFor(characterById(event.catId, characters)).name[language]}</span>)}</div>
    {battle.paused && battle.status === 'playing' && <div className={styles.pauseOverlay}><Pause size={26} />{language === 'ja' ? '一時停止中' : 'Paused'}</div>}
  </div>;
}

interface StarcatCaravanProps {
  characters?: readonly Character[];
  catalogOffline?: boolean;
  player?: Player;
  store?: AccountStore | null;
  signInHref?: string;
}

export default function StarcatCaravan({ player = GUEST, store = null, signInHref, characters = CHARACTERS, catalogOffline = false }: StarcatCaravanProps = {}) {
  useFeatureLifecycle('game.starcat-caravan');
  const { language } = useGameLanguage();
  const tx = (ja: string, en: string) => language === 'ja' ? ja : en;
  const { progress, snapshot } = useProgress(player, store, characters);
  const { game: state, playable: ready, recovered, status } = snapshot;
  const dispatch = progress.dispatch;
  const storageError = !status.kept;
  const [view, setView] = useState<View>('adventure');
  const [showInfo, setShowInfo] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [battleSound, setBattleSound] = useState(false);
  const battleAudio = useRef<ReturnType<typeof createBattleAudio> | null>(null);
  const lastSound = useRef(0);
  const lastCueAt = useRef(-Infinity);
  const [pendingWish, setPendingWish] = useState<1 | 10 | null>(null);
  const { save, battle, pulls, reward } = state;
  const team = save.team.filter((id) => characters.some((cat) => cat.id === id));
  const running = battle?.status === 'playing' && !battle.paused;
  const hasBattle = !!battle;
  const contentRef = useRef<HTMLElement>(null);
  const previousScreen = useRef('adventure:false');
  const secondsLeft = Math.max(0, Math.ceil(180 - (battle?.time ?? 0)));

  useEffect(() => {
    const screen = `${view}:${hasBattle}`;
    if (previousScreen.current !== screen) contentRef.current?.scrollIntoView({ block: 'start' });
    previousScreen.current = screen;
  }, [view, hasBattle]);

  // A restored journal can belong to another account; reopen its map with the newly loaded progress.
  // Read at that restore event only: a first clear must not reset the player's chosen battle speed.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSpeed(1);
    setPendingWish(null);
  }, [progress, snapshot.opened]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      for (let step = 0; step < speed; step++) dispatch({ type: 'tick' });
    }, 100);
    const visibility = () => { if (document.hidden) dispatch({ type: 'pause' }); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [running, speed, dispatch]);

  useEffect(() => () => battleAudio.current?.dispose(), []);
  useEffect(() => {
    if (!battle) { lastSound.current = 0; battleAudio.current?.stop(); return; }
    const events = [...battle.reactions.map((event) => ({ key: event.key, cue: reactionCue(event.kind) })), ...battle.skills.map((event) => ({ key: event.key, cue: abilityCue(event.ability) }))].sort((a, b) => b.key - a.key);
    const latest = events[0];
    if (battleSound && battle.status === 'playing' && !battle.paused && latest && latest.key > lastSound.current && performance.now() - lastCueAt.current >= 350) { battleAudio.current?.play(latest.cue); lastCueAt.current = performance.now(); }
    if (latest) lastSound.current = Math.max(lastSound.current, latest.key);
    if (battle.paused || battle.status !== 'playing') battleAudio.current?.stop();
  }, [battle, battleSound]);

  const draw = (count: 1 | 10) => setPendingWish(count);
  const closeWish = () => { setPendingWish(null); dispatch({ type: 'close-pulls' }); };
  const launchWish = () => {
    const current = progress.getSnapshot();
    if (pendingWish === null || !current.playable || current.game.pulls.length || current.game.save.gems < pendingWish * SUMMON_COST) return false;
    dispatch({ type: 'summon', count: pendingWish, rolls: Array.from({ length: pendingWish * 2 }, () => Math.random()) });
    return progress.getSnapshot().game.pulls.length === pendingWish;
  };
  const openInfo = () => { if (running) dispatch({ type: 'pause' }); setShowInfo(true); };
  const collected = Object.keys(save.owned).length;
  const featured = characterById('luna', characters);
  const saveLabel = storageError && status.where !== 'account' ? tx('この端末に保存できません', 'Device saving unavailable')
    : status.where === 'account' ? tx('アカウントに自動保存', 'Account autosave')
    : status.where === 'checking' ? tx('アカウントの記録を確認中', 'Checking account progress')
    : status.where === 'offline' ? tx('通信待ち · この端末に保存', 'Offline · Saved on this device')
    : status.where === 'unreadable' ? tx('アカウントの記録を読み込めません', 'Account journal unavailable')
    : tx('このブラウザに自動保存', 'Saved in this browser');

  return <main className={styles.page}>
    <div className={styles.shell}>
      <div className={styles.topline}><Link href="/games"><ArrowLeft size={15} />{tx('ゲーム一覧', 'All games')}</Link><span><i />{tx('無料で遊べるガチャRPG', 'A free collectible adventure')}</span></div>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark}><Sparkles size={26} /></span><div><p>STARCAT CARAVAN</p><h1>{tx('星ねこキャラバン', 'Starcat Caravan')}</h1></div></div>
        <div className={styles.wallet}><div title={tx('ガチャに使う星のしずく', 'Stardrops for wishes')}><Gem size={18} /><span><small>{tx('星のしずく', 'Stardrops')}</small><b data-testid="starcat-gems">{save.gems.toLocaleString(language)}</b></span></div><div title={tx('育成に使うコイン', 'Coins for training')}><Coins size={18} /><span><small>{tx('コイン', 'Coins')}</small><b data-testid="starcat-coins">{save.coins.toLocaleString(language)}</b></span></div></div>
      </header>
      <div className={styles.navigation}>
        <nav aria-label={tx('ゲームメニュー', 'Game menu')}>
          {([{ id: 'adventure', Icon: Compass, label: tx('冒険', 'Adventure') }, { id: 'summon', Icon: Sparkles, label: tx('星の召喚', 'Wish upon a star') }, { id: 'collection', Icon: Users, label: tx('仲間・編成', 'Companions') }] as const).map(({ id, Icon, label }) => <button key={id} type="button" aria-pressed={view === id} disabled={!!battle} onClick={() => setView(id)}><Icon size={17} /><span>{label}</span>{id === 'collection' && <small>{collected}/{characters.length}</small>}</button>)}
        </nav><Link href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className={styles.guideLink} aria-label={tx('冒険ガイドを別タブで開く', 'Open adventure guide in a new tab')}><Compass size={17} /><span>{tx('冒険ガイド', 'Adventure guide')}</span></Link><button className={styles.help} type="button" onClick={openInfo} aria-label={tx('遊び方', 'How to play')}><BookOpen size={17} /><span>{tx('遊び方', 'Guide')}</span></button>
      </div>

      {((!snapshot.ready && !recovered) || !player.settled || status.where === 'checking') && <p role="status" className={styles.notice}>{tx('旅の記録を読み込んでいます…', 'Opening your travel journal…')}</p>}
      {storageError && <p role="status" className={styles.notice}>{status.where === 'account' ? tx('端末への保存はできません。アカウントへの自動保存を利用しています。', 'Device storage is unavailable. Account autosave is active.') : player.uid ? tx('端末に保存できません。アカウントとの同期が完了するまで、この画面を開いたままにしてください。', 'Device saving is unavailable. Keep this page open until account sync completes.') : tx('ブラウザに保存できません。この画面では遊べますが、閉じると進行が失われます。', 'Browser saving is unavailable. You can play, but progress will be lost when you close this page.')}</p>}
      {status.where === 'offline' && <p role="status" className={styles.notice}>{ready ? tx('通信できないため、進行はこの端末に保存しています。接続が戻るとアカウントへ再送します。', 'Progress is kept on this device while offline. Account sync retries when the connection returns.') : tx('アカウントの記録に接続できません。進行を保護するため、読み込みを再試行しています。', 'Your account journal is unreachable. Retrying before opening the game to protect your progress.')}</p>}
      {status.where === 'unreadable' && <p role="status" className={styles.notice}>{tx('このバージョンではアカウントの記録を読み込めません。記録は上書きせず保護しています。ページを更新してお試しください。', 'This version cannot open your account journal. It has been protected from overwriting. Try updating this page.')}</p>}
      {snapshot.catalogMissing && <p role="status" className={styles.notice}>{tx('所持している仲間の最新情報が必要です。進行データは保護しています。接続後にページを更新してください。', 'Some owned companions need a newer catalog. Your progress is protected. Reload when connected to get their information.')}</p>}
      {catalogOffline && <p role="status" className={styles.notice}>{tx('キャラ一覧は前回取得したデータを使用しています。最新の仲間を確認するには、接続後にページを更新してください。', 'Using your previously saved companions catalog. Reload when connected to see the latest additions.')}</p>}
      {player.settled && !player.uid && signInHref && <p className={styles.notice}>{tx('ログインすると、仲間・育成・冒険の記録を別の端末でも引き継げます。', 'Sign in to carry your companions, training, and adventure to another device.')} <Link href={signInHref}>{tx('ログインして引き継ぐ', 'Sign in & keep progress')}<ArrowRight size={14} /></Link></p>}
      {recovered && <p role="status" className={styles.notice}>{tx('保存データを読み込めません。記録は上書きせず保護しています。最新のデータを読み込み直してください。', 'Your journal cannot be read with this catalog. It has been protected from overwriting. Reload to get the latest companions.')}</p>}

      {view === 'summon' && <section ref={contentRef} className={styles.content} aria-label={tx('星の召喚', 'Wish upon a star')}>
        <div className={styles.hero}>
          <Image src="/img/games/starcat-caravan/sky.webp" alt="" fill priority sizes="(max-width: 1200px) 100vw, 1160px" className={styles.heroImage} />
          <div className={styles.heroShade} />
          <div className={styles.heroCopy}><span className={styles.eyebrow}><span />{tx('常設召喚 · 星めぐりの仲間たち', 'STANDARD WISH · CELESTIAL COMPANIONS')}</span><h2>{tx('その出会いが、', 'A little wish.')}<br /><em>{tx('冒険になる。', 'A grand adventure.')}</em></h2><p>{tx('星に願って、まだ見ぬ仲間に会いにいこう。\n小さな猫たちと、空に浮かぶ島々を旅しよう。', 'Wish upon a star. Meet your next companion.\nTogether, explore the islands beyond the clouds.')}</p><button className={styles.heroLink} type="button" onClick={() => setView('collection')}>{tx('仲間たちを見る', 'Meet the companions')}<ArrowRight size={16} /></button></div>
          <div className={styles.heroPortrait}><CatSprite cat={featured} /></div><div className={styles.featured}><span>{'★'.repeat(featured.rarity)}</span><strong>{featured.name[language]}</strong><small>{featured.title[language]}</small></div>
        </div>
        <div className={styles.summonPanel}>
          <div><p className={styles.eyebrow}>{tx('星の召喚', 'MAKE A WISH')}</p><h3>{tx('あなたの旅に、新しい仲間を。', 'A new friend for your journey.')}</h3><p>{save.pulls === 0 ? tx('はじめの星のしずく 3,000 個で、30回召喚できます。', 'Your starting 3,000 Stardrops are enough for 30 wishes.') : tx(`これまでの召喚：${save.pulls}回`, `${save.pulls} wishes made so far`)}<br />{tx('10回以内に★4以上、50回以内に★5が必ず出現。', 'A ★4+ within 10 wishes. A ★5 within 50 wishes.')}</p></div>
          <div className={styles.summonActions}><button className={styles.secondary} disabled={!ready || save.gems < SUMMON_COST || pulls.length > 0 || pendingWish !== null} onClick={() => draw(1)}><span>{tx('1回召喚', 'Wish ×1')}</span><small><Gem size={14} />100</small></button><button className={styles.primary} disabled={!ready || save.gems < SUMMON_COST * 10 || pulls.length > 0 || pendingWish !== null} onClick={() => draw(10)}><span><Sparkles size={18} />{tx('10回召喚', 'Wish ×10')}</span><small><Gem size={14} />1,000</small></button></div>
        </div>
        <div className={styles.pityRow}><span>✦ {tx(`★5確定まであと${PITY_FIVE - save.pityFive}回`, `★5 guaranteed within ${PITY_FIVE - save.pityFive} wishes`)}</span><span>{tx(`★4以上確定まであと${PITY_FOUR - save.pityFour}回`, `★4+ within ${PITY_FOUR - save.pityFour} wishes`)}</span><button type="button" onClick={openInfo}>{tx('提供割合・召喚ルール', 'Rates & wish details')}<ChevronRight size={14} /></button></div>
        <div className={styles.journeyNote}><Compass size={22} /><div><strong>{tx('星のしずくは、冒険の先に。', 'Your next wish is out there.')}</strong><p>{tx('ステージを攻略して星のしずくとコインを集めよう。クリア済みの島でも報酬を獲得できます。', 'Earn Stardrops and coins in battle. Revisit cleared islands for more rewards.')}</p></div><button type="button" onClick={() => setView('adventure')}>{tx('冒険に出る', 'Explore')}<ArrowRight size={17} /></button></div>
      </section>}

      {view === 'collection' && <section ref={contentRef} className={styles.content}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>YOUR LITTLE CONSTELLATION</p><h2>{tx('仲間と、一緒なら。', 'Better, together.')}</h2><p>{tx('獲得した仲間だけを表示。好きな仲間を最大4体、属性で自由に組み合わせよう。', 'Only acquired companions appear here. Choose up to four favorites and combine their elements.')}</p></div><span>{collected} / {characters.length} {tx('発見', 'discovered')}</span></div>
        <div className={styles.teamStrip}><strong><Users size={18} />{tx('出撃チーム', 'Your party')} <small>{save.team.length}/4</small></strong><div>{[0, 1, 2, 3].map((index) => { const cat = team[index] ? characterById(team[index], characters) : null; return <div key={index} className={styles.teamSlot}>{cat ? <><CatSprite cat={cat} /><span>{cat.name[language]}</span><button aria-label={tx(`${cat.name.ja}を編成から外す`, `Remove ${cat.name.en} from party`)} disabled={!ready || save.team.length <= 1} onClick={() => dispatch({ type: 'team', id: cat.id })}>×</button></> : <span>＋</span>}</div>; })}</div><button className={styles.textButton} onClick={() => setView('adventure')}>{tx('出撃する', 'To adventure')}<ArrowRight size={16} /></button></div>
        <PartyOverview save={save} characters={characters} language={language} />
        <CompanionCollection save={save} characters={characters} language={language} ready={ready} onAction={dispatch} />
      </section>}

      {/* A new account/region remounts the world: followers, routes and dialogue never cross maps. */}
      {view === 'adventure' && <section ref={contentRef} className={styles.content}>
        {!battle ? <><AdventureWorld key={`${snapshot.opened}:${adventureOf(save).region}`} game={state} characters={characters} language={language} ready={ready} readGame={() => progress.getSnapshot().game} dispatch={dispatch} onParty={() => setView('collection')} onWish={() => setView('summon')} /><TravelRecord save={save} language={language} /></> : <div className={styles.battlePanel}>
          <div className={styles.battleHeading}><div><p className={styles.eyebrow}>ISLAND {String(battle.stage + 1).padStart(2, '0')}</p><h2>{STAGES[battle.stage].name[language]}</h2></div><div><button aria-pressed={battleSound} aria-label={tx(`戦闘音 ${battleSound ? 'ON' : 'OFF'}`, `Battle sound ${battleSound ? 'ON' : 'OFF'}`)} onClick={() => { const audio = battleAudio.current ??= createBattleAudio(); audio.enable(!battleSound); setBattleSound(!battleSound); }}>{battleSound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><span className={styles.timer}>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span><button disabled={battle.status !== 'playing'} onClick={() => setSpeed(speed === 1 ? 2 : 1)} aria-label={tx(`戦闘速度 ${speed}倍`, `Battle speed ${speed}×`)}>{speed}×</button><button disabled={battle.status !== 'playing'} aria-label={battle.paused ? tx('再開', 'Resume') : tx('一時停止', 'Pause')} onClick={() => dispatch({ type: 'pause' })}>{battle.paused ? <Play size={17} /> : <Pause size={17} />}</button></div></div>
          <Battlefield battle={battle} language={language} characters={characters} />
          {battle.status === 'playing' ? <><div className={styles.energyBar}><span><WandSparkles size={17} />{tx('出撃エネルギー', 'Deploy energy')} <b>{Math.floor(battle.energy)} / 200</b></span><div><i style={{ width: `${battle.energy / 2}%` }} /></div><small>{tx('毎秒 +14', '+14 / second')}</small></div><div className={styles.deployRow}>{team.map((id) => { const cat = characterById(id, characters); const cooldown = battle.cooldowns[id] ?? 0; return <button key={id} disabled={battle.paused || battle.energy < cat.cost || cooldown > 0 || battle.units.filter((unit) => unit.side === 'ally').length >= 16} onClick={() => dispatch({ type: 'deploy', id })} aria-label={tx(`${cat.name.ja}を出撃`, `Deploy ${cat.name.en}`)} style={colorStyle(cat)}><CatSprite cat={cat} /><span><strong>{cat.name[language]}</strong><small>{ROLES[cat.role][language]} · Lv. {save.owned[id].level}</small><b>{cooldown > 0 ? `${cooldown.toFixed(1)}s` : `✦ ${cat.cost}`}</b></span></button>; })}<button className={styles.cannon} disabled={battle.paused || battle.cannon < 100} onClick={() => dispatch({ type: 'cannon' })}><Sparkles size={25} /><strong>{tx('星の砲撃', 'Star cannon')}</strong><small>{battle.cannon < 100 ? `${Math.ceil((100 - battle.cannon) / 5)}s` : tx('発射！', 'Fire!')}</small></button></div><div className={styles.skillCommands}><span>{tx('仲間にスキルを指示', 'Command a skill')}<small>{tx('エネルギー40・各20秒待ち', '40 energy · 20s per companion')}</small></span>{team.map((id) => { const cat = characterById(id, characters); const deployed = battle.units.filter((unit) => unit.side === 'ally' && unit.catId === id).sort((a,b) => b.x-a.x)[0]; const waiting = Math.max(0, (battle.commands?.[id] ?? 0) - battle.time); const support = cat.ability === 'ward' || cat.ability === 'mend'; const inRange = deployed && battle.units.some((unit) => unit.side === 'enemy' && unit.hp > 0 && Math.abs(unit.x - deployed.x) <= deployed.range + 8); return <button key={id} disabled={battle.paused || !cat.ability || cat.ability === 'none' || !deployed || waiting > 0 || battle.energy < COMMAND_COST || (!support && !inRange)} onClick={() => dispatch({type:'skill', id})} aria-label={tx(`${cat.name.ja}のスキルを指示`, `Command ${cat.name.en}'s skill`)}><Sparkles size={15}/><strong>{cat.name[language]}</strong><small>{waiting > 0 ? `${Math.ceil(waiting)}s` : !deployed ? tx('出撃後に使用', 'Deploy first') : abilityFor(cat).name[language]}</small></button>; })}</div><div className={styles.battleTip}><p>{tx('仲間を押して出撃。移動・通常攻撃は自動。スキルを指示するタイミングと属性連携で道を開こう。役の必須枠はありません。', 'Deploy companions; movement and normal attacks are automatic. Time manual skills and combine elements for reactions. No role slots are required.')}</p><button onClick={() => dispatch({ type: 'leave' })}>{tx('撤退する', 'Retreat')}</button></div></> : <div className={styles.battleResult} role="status"><span>{battle.status === 'won' ? '✧' : '☾'}</span><p className={styles.eyebrow}>{battle.status === 'won' ? 'ISLAND RECLAIMED' : 'A MOMENT TO REST'}</p><h3>{battle.status === 'won' ? tx('星の光が、戻った！', 'The starlight returns!') : tx('次の冒険に、備えよう。', 'Your next adventure awaits.')}</h3><p>{battle.status === 'won' ? reward?.first ? save.cleared.length === STAGES.length ? tx('最後の砦を攻略！ 星の灯台へ戻って、物語を結ぼう。', 'The final fortress is reclaimed. Return to the star lantern to finish the story.') : tx('初回クリア！ 新しい島への道が開きました。', 'First clear! Your journey continues to the next island.') : tx('この島を守りました。報酬を受け取りました。', 'The island is safe. Your rewards have been saved.') : tx('育成や属性連携・共鳴を試して再挑戦しよう。星のしずくやコインは減りません。', 'Train, try element reactions or resonance, and return. You lose no Stardrops or coins.')}</p>{battle.status === 'won' && reward && <div className={styles.rewards}><span><Gem size={20} />+{reward.gems}</span><span><Coins size={20} />+{reward.coins}</span></div>}{save.cleared.length === STAGES.length && battle.status === 'won' && <p>{tx(`全${STAGES.length}島の砦を攻略！ 探索マップで、残る灯火も復元しよう。`, `All ${STAGES.length} fortresses cleared! Explore the islands to restore every lantern.`)}</p>}<button className={styles.primary} onClick={() => { dispatch({ type: 'leave' }); }}>{tx('探索の続きへ', 'Return to the trail')}<ArrowRight size={17} /></button></div>}
        </div>}
      </section>}

      <footer className={styles.footer}><span role="status" data-testid="starcat-save-status"><Shield size={13} />{saveLabel}</span><span>{tx(`課金なし · 全${characters.length}キャラ · 全${STAGES.length}ステージ`, `No purchases · ${characters.length} companions · ${STAGES.length} islands`)}</span></footer>
    </div>

    {pendingWish !== null && <SummonShow key={`${snapshot.opened}:${pendingWish}`} count={pendingWish} pulls={pulls} characters={characters} language={language} onLaunch={launchWish} onClose={closeWish} onParty={() => { closeWish(); setView('collection'); }} />}
    <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={tx('星ねこキャラバンの遊び方', 'Your guide to Starcat Caravan')}>
      <div className={styles.guide}><h3>{tx('1. 星に願って、仲間を集める', '1. Make a wish, meet a companion')}</h3><p>{tx('星のしずく100個で1回召喚。通常の提供割合は★5が3%、★4が15%、★3が82%。同じレア度のキャラは均等確率です。', 'One wish costs 100 Stardrops. Base rates: ★5 3%, ★4 15%, ★3 82%. Characters of the same rarity are equally likely.')}</p><p>{tx('★4以上が9回連続で出なければ次は★4以上が確定（★5 3%、★4 97%）。★5が49回連続で出なければ次は★5確定。★5確定が優先され、それぞれのレア度を引くと対応するカウントがリセットされます。1回召喚と10回召喚で共有し、ページを閉じても保持されます。', 'After 9 wishes without a ★4+, the next is guaranteed (★5 3%, ★4 97%). After 49 without a ★5, the next is a ★5. The ★5 guarantee takes precedence. Each counter resets when its rarity or higher appears. Counters carry across single wishes, ten wishes, and visits.')}</p><h3>{tx('2. 育てて、チームを組む', '2. Train and build your party')}</h3><p>{tx('好きな仲間を1〜4体。4役を揃える必要はありません。属性を混ぜると連携、同属性の仲間2体以上でその属性のHP+20%・攻撃/回復力+15%。防御力で被ダメージを軽減し、固有能力は自動発動。★3/4/5で基礎能力に1/1.2/1.5倍の補正。コインでLv.20まで育成。重複1体ごとにHPと攻撃・回復力が4%上昇（5回まで）し、★3/4/5で80/160/320コインも獲得できます。', 'Choose any 1–4 companions; no role slots are required. Mix elements for reactions, or select 2+ of an element for +20% HP and +15% attack/healing to that element. Defense reduces damage and unique abilities trigger automatically. ★3/4/5 multiply base stats by 1/1.2/1.5. Train to level 20 with coins. Each duplicate adds 4% HP and attack/healing power (up to 5 times), plus 80/160/320 coins for ★3/4/5.')}</p><h3>{tx('3. 歩いて探して、島々を取り戻す', '3. Explore and reclaim the islands')}</h3><p>{tx('冒険マップは矢印キー・WASD・方向ボタンで歩けます。行き先をタップしても移動できます。灯守に話し、二つの宝箱を探し、影の砦を攻略して灯台を復元しよう。仲間は先頭に選んだキャラについて歩きます。', 'Walk with arrows, WASD, the direction buttons, or tap a destination. Meet the lightkeeper, find two chests, reclaim the fortress and restore the lantern. Your selected companions follow the party leader.')}</p><p>{tx('エネルギーを使って仲間を出撃させます。同じ仲間を繰り返し出撃でき、戦場には最大16体。仲間は自動で前進・攻撃します。星の砲撃は敵全体に140ダメージ、20秒で再充填。3分以内に敵拠点を破壊すれば勝利、自拠点のHPが0になるか時間切れで敗北です。', 'Spend regenerating energy to deploy companions, including multiple copies, up to 16 allies on the field. They move and attack automatically. Star cannon hits every enemy for 140 damage and recharges in 20 seconds. Destroy the fortress within 3 minutes to win. Losing your base or running out of time ends the battle.')}</p><p>{tx('火は風・氷に、水は火に、風は水に、氷は雷に、雷は水にダメージ1.5倍。同じ敵への火＋水で追加ダメージ、火＋風で範囲攻撃、水＋風で味方全体を回復。初回クリアで大きな報酬、周回でも星のしずく80個とコインを獲得。スタミナ制限や課金はありません。', 'Fire beats Wind/Ice, Water beats Fire, Wind beats Water, Ice beats Lightning, and Lightning beats Water for 1.5× damage. Combining Fire/Water adds damage, Fire/Wind spreads damage, and Water/Wind heals living allies. First clears award bonus rewards; replays give 80 Stardrops and coins. No stamina limits or purchases.')}</p><p>{tx('仲間・育成・編成・通貨・天井・クリアに加え、探索位置・宝箱・灯守との会話・灯火の復元も保存します。ゲストはこのブラウザ、ログイン中はゲームセンターと同じアカウントに自動保存し、別の端末でも復元できます。初めてのアカウントにはゲストの進行を引き継ぎ、記録があるアカウントではその記録を開きます。戦闘の途中は保存されず、マップから再挑戦になります。', 'Your companions, training, party, currencies, guarantees, clears, exploration position, chests, lightkeeper meetings and restored lanterns are saved. Guests save in this browser; members autosave to the same account as the medal center and can resume on another device. A new account adopts guest progress; an account with an existing journal opens that journal. Battles in progress are not saved; return to the map to retry.')}</p></div>
      <p className={styles.guideMore}><Link href={GUIDE_URL} target="_blank" rel="noopener noreferrer">{tx('編成・敵・途中結果・保存の解説を別タブで読む', 'Open the full guide in a new tab')}<ArrowRight size={15} /></Link></p>
    </InfoModal>
  </main>;
}
