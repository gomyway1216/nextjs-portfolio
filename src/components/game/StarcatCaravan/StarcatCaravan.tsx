'use client';

import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Coins, Compass, Gem, Heart, LockKeyhole, Pause, Play, Shield, Sparkles, Swords, Users, WandSparkles } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { CHARACTERS, ELEMENTS, MAX_LEVEL, PITY_FIVE, PITY_FOUR, ROLES, SAVE_KEY, STAGES, SUMMON_COST, characterById, type Character, type Language } from './data';
import { catStats, gameReducer, initialGame, parseSave, upgradeCost, type Battle } from './engine';
import { CatSprite, ShadowSprite } from './CatSprite';
import styles from './StarcatCaravan.module.css';

type View = 'summon' | 'adventure' | 'collection';
const colorStyle = (cat: Character) => ({ '--cat-accent': cat.accent, '--rarity': cat.rarity === 5 ? '#f2d584' : cat.rarity === 4 ? '#c0a4e9' : '#8ac6d0' }) as CSSProperties;

function Battlefield({ battle, language }: { battle: Battle; language: Language }) {
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
        <svg width={unit.boss ? 84 : 56} height={unit.boss ? 98 : 66} overflow="visible">{unit.catId ? <CatSprite cat={characterById(unit.catId)} /> : <ShadowSprite boss={unit.boss} />}</svg>
        <rect y="-7" width={unit.boss ? 80 : 52} height="4" rx="2" fill="#1a2638" /><rect y="-7" width={(unit.boss ? 80 : 52) * Math.max(0, unit.hp / unit.maxHp)} height="4" rx="2" fill={unit.side === 'ally' ? '#a4dfb9' : '#eab1b9'} />
      </g>)}
      {battle.cannonFlash > 0 && <path d="M82 202H930" stroke="#fff0a3" strokeWidth="14" opacity={battle.cannonFlash} />}
    </svg>
    {battle.paused && battle.status === 'playing' && <div className={styles.pauseOverlay}><Pause size={26} />{language === 'ja' ? '一時停止中' : 'Paused'}</div>}
  </div>;
}

export default function StarcatCaravan() {
  useFeatureLifecycle('game.starcat-caravan');
  const { language } = useGameLanguage();
  const tx = (ja: string, en: string) => language === 'ja' ? ja : en;
  const [state, dispatch] = useReducer(gameReducer, undefined, initialGame);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [view, setView] = useState<View>('summon');
  const [stageIndex, setStageIndex] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [speed, setSpeed] = useState(1);
  const { save, battle, pulls, reward } = state;
  const stage = STAGES[stageIndex];
  const running = battle?.status === 'playing' && !battle.paused;
  const hasBattle = !!battle;
  const contentRef = useRef<HTMLElement>(null);
  const previousScreen = useRef('summon:false');
  const secondsLeft = Math.max(0, Math.ceil(180 - (battle?.time ?? 0)));

  useEffect(() => {
    const screen = `${view}:${hasBattle}`;
    if (previousScreen.current !== screen) contentRef.current?.scrollIntoView({ block: 'start' });
    previousScreen.current = screen;
  }, [view, hasBattle]);

  /* Browser storage is an external system: read after hydration, then report persistence errors.
     Keeping the first server/client render identical prevents overwriting a saved game on mount. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const loaded = parseSave(raw);
      if (loaded) { dispatch({ type: 'load', save: loaded }); setStageIndex(Math.min(loaded.cleared.length, STAGES.length - 1)); }
      else if (raw) setRecovered(true);
    } catch { setStorageError(true); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [save, ready]);
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
  }, [running, speed]);

  const draw = (count: 1 | 10) => dispatch({ type: 'summon', count, rolls: Array.from({ length: count * 2 }, () => Math.random()) });
  const openInfo = () => { if (running) dispatch({ type: 'pause' }); setShowInfo(true); };
  const collected = Object.keys(save.owned).length;

  return <main className={styles.page}>
    <div className={styles.shell}>
      <div className={styles.topline}><Link href="/games"><ArrowLeft size={15} />{tx('ゲーム一覧', 'All games')}</Link><span><i />{tx('無料で遊べるガチャRPG', 'A free collectible adventure')}</span></div>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark}><Sparkles size={26} /></span><div><p>STARCAT CARAVAN</p><h1>{tx('星ねこキャラバン', 'Starcat Caravan')}</h1></div></div>
        <div className={styles.wallet}><div title={tx('ガチャに使う星石', 'Star gems for wishes')}><Gem size={18} /><span><small>{tx('星石', 'Star gems')}</small><b data-testid="starcat-gems">{save.gems.toLocaleString(language)}</b></span></div><div title={tx('育成に使うコイン', 'Coins for training')}><Coins size={18} /><span><small>{tx('コイン', 'Coins')}</small><b data-testid="starcat-coins">{save.coins.toLocaleString(language)}</b></span></div></div>
      </header>
      <div className={styles.navigation}>
        <nav aria-label={tx('ゲームメニュー', 'Game menu')}>
          {([{ id: 'adventure', Icon: Compass, label: tx('冒険', 'Adventure') }, { id: 'summon', Icon: Sparkles, label: tx('星の召喚', 'Wish upon a star') }, { id: 'collection', Icon: Users, label: tx('仲間・編成', 'Companions') }] as const).map(({ id, Icon, label }) => <button key={id} type="button" aria-pressed={view === id} disabled={!!battle} onClick={() => setView(id)}><Icon size={17} /><span>{label}</span>{id === 'collection' && <small>{collected}/{CHARACTERS.length}</small>}</button>)}
        </nav><button className={styles.help} type="button" onClick={openInfo} aria-label={tx('遊び方', 'How to play')}><BookOpen size={17} /><span>{tx('遊び方', 'Guide')}</span></button>
      </div>

      {!ready && <p role="status" className={styles.notice}>{tx('旅の記録を読み込んでいます…', 'Opening your travel journal…')}</p>}
      {storageError && <p role="status" className={styles.notice}>{tx('ブラウザに保存できません。この画面では遊べますが、閉じると進行が失われます。', 'Browser saving is unavailable. You can play, but progress will be lost when you close this page.')}</p>}
      {recovered && <p role="status" className={styles.notice}>{tx('保存データを読み込めなかったため、新しい冒険を始めました。', 'The saved journal could not be read. A new adventure has started.')}</p>}

      {view === 'summon' && <section ref={contentRef} className={styles.content} aria-label={tx('星の召喚', 'Wish upon a star')}>
        <div className={styles.hero}>
          <Image src="/img/games/starcat-caravan/sky.webp" alt="" fill priority sizes="(max-width: 1200px) 100vw, 1160px" className={styles.heroImage} />
          <div className={styles.heroShade} />
          <div className={styles.heroCopy}><span className={styles.eyebrow}><span />{tx('常設召喚 · 星めぐりの仲間たち', 'STANDARD WISH · CELESTIAL COMPANIONS')}</span><h2>{tx('その出会いが、', 'A little wish.')}<br /><em>{tx('冒険になる。', 'A grand adventure.')}</em></h2><p>{tx('星に願って、まだ見ぬ仲間に会いにいこう。\n小さな猫たちと、空に浮かぶ島々を旅しよう。', 'Wish upon a star. Meet your next companion.\nTogether, explore the islands beyond the clouds.')}</p><button className={styles.heroLink} type="button" onClick={() => setView('collection')}>{tx('仲間たちを見る', 'Meet the companions')}<ArrowRight size={16} /></button></div>
          <div className={styles.featured}><span>★★★★★</span><strong>{tx('ルナ', 'Luna')}</strong><small>{tx('星を紡ぐ魔女', 'Weaver of stars')}</small></div>
        </div>
        <div className={styles.summonPanel}>
          <div><p className={styles.eyebrow}>{tx('星の召喚', 'MAKE A WISH')}</p><h3>{tx('あなたの旅に、新しい仲間を。', 'A new friend for your journey.')}</h3><p>{save.pulls === 0 ? tx('はじめの星石 3,000 個で、30回召喚できます。', 'Your starting 3,000 star gems are enough for 30 wishes.') : tx(`これまでの召喚：${save.pulls}回`, `${save.pulls} wishes made so far`)}<br />{tx('10回以内に★4以上、50回以内に★5が必ず出現。', 'A ★4+ within 10 wishes. A ★5 within 50 wishes.')}</p></div>
          <div className={styles.summonActions}><button className={styles.secondary} disabled={!ready || save.gems < SUMMON_COST || pulls.length > 0} onClick={() => draw(1)}><span>{tx('1回召喚', 'Wish ×1')}</span><small><Gem size={14} />100</small></button><button className={styles.primary} disabled={!ready || save.gems < SUMMON_COST * 10 || pulls.length > 0} onClick={() => draw(10)}><span><Sparkles size={18} />{tx('10回召喚', 'Wish ×10')}</span><small><Gem size={14} />1,000</small></button></div>
        </div>
        <div className={styles.pityRow}><span>✦ {tx(`★5確定まであと${PITY_FIVE - save.pityFive}回`, `★5 guaranteed within ${PITY_FIVE - save.pityFive} wishes`)}</span><span>{tx(`★4以上確定まであと${PITY_FOUR - save.pityFour}回`, `★4+ within ${PITY_FOUR - save.pityFour} wishes`)}</span><button type="button" onClick={openInfo}>{tx('提供割合・召喚ルール', 'Rates & wish details')}<ChevronRight size={14} /></button></div>
        <div className={styles.journeyNote}><Compass size={22} /><div><strong>{tx('星石は、冒険の先に。', 'Your next wish is out there.')}</strong><p>{tx('ステージを攻略して星石とコインを集めよう。クリア済みの島でも報酬を獲得できます。', 'Earn gems and coins in battle. Revisit cleared islands for more rewards.')}</p></div><button type="button" onClick={() => setView('adventure')}>{tx('冒険に出る', 'Explore')}<ArrowRight size={17} /></button></div>
      </section>}

      {view === 'collection' && <section ref={contentRef} className={styles.content}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>YOUR LITTLE CONSTELLATION</p><h2>{tx('仲間と、一緒なら。', 'Better, together.')}</h2><p>{tx('最大4体を編成。役割と属性の組み合わせが、冒険のカギ。', 'Choose up to four companions. Mix roles and elements to find your team.')}</p></div><span>{collected} / {CHARACTERS.length} {tx('発見', 'discovered')}</span></div>
        <div className={styles.teamStrip}><strong><Users size={18} />{tx('出撃チーム', 'Your party')} <small>{save.team.length}/4</small></strong><div>{[0, 1, 2, 3].map((index) => { const cat = save.team[index] ? characterById(save.team[index]) : null; return <div key={index} className={styles.teamSlot}>{cat ? <><CatSprite cat={cat} /><span>{cat.name[language]}</span><button aria-label={tx(`${cat.name.ja}を編成から外す`, `Remove ${cat.name.en} from party`)} disabled={save.team.length <= 1} onClick={() => dispatch({ type: 'team', id: cat.id })}>×</button></> : <span>＋</span>}</div>; })}</div><button className={styles.textButton} onClick={() => setView('adventure')}>{tx('出撃する', 'To adventure')}<ArrowRight size={16} /></button></div>
        <div className={styles.collectionGrid}>{[...CHARACTERS].sort((a, b) => b.rarity - a.rarity).map((cat) => {
          const owned = save.owned[cat.id];
          const selected = save.team.includes(cat.id);
          const stats = owned ? catStats(cat.id, owned) : null;
          return <article key={cat.id} className={`${styles.catCard} ${!owned ? styles.unowned : ''}`} style={colorStyle(cat)} data-testid={`cat-${cat.id}`}>
            <div className={styles.cardTop}><span className={styles.stars}>{'★'.repeat(cat.rarity)}</span><span style={{ color: ELEMENTS[cat.element].color }}>{ELEMENTS[cat.element].symbol} {ELEMENTS[cat.element].name[language]}</span></div>
            <div className={styles.portrait}><CatSprite cat={cat} />{!owned && <span className={styles.undiscovered}><LockKeyhole size={13} />{tx('未発見', 'Undiscovered')}</span>}{selected && <span className={styles.inParty}><Check size={12} />{tx('編成中', 'In party')}</span>}</div>
            <p className={styles.catTitle}>{cat.title[language]}</p><div className={styles.catName}><h3>{cat.name[language]}</h3><span>{owned ? `Lv. ${owned.level}` : '—'}</span></div><p className={styles.role}>{ROLES[cat.role][language]} · {tx('出撃', 'Deploy')} {cat.cost}</p>
            {owned && stats ? <><div className={styles.catStats}><span><Heart size={13} />{stats.hp}</span><span><Swords size={13} />{stats.attack}</span><span title={tx('重複1体につき能力+4%、最大+20%', '+4% stats per duplicate, up to +20%')}>✦ {Math.min(owned.copies - 1, 5)}/5</span></div><div className={styles.cardActions}><button aria-pressed={selected} disabled={!ready || (!selected && save.team.length >= 4) || (selected && save.team.length <= 1)} onClick={() => dispatch({ type: 'team', id: cat.id })}>{selected ? tx('外す', 'Remove') : tx('編成する', 'Add to party')}</button><button disabled={!ready || owned.level >= MAX_LEVEL || save.coins < upgradeCost(owned.level)} onClick={() => dispatch({ type: 'upgrade', id: cat.id })}>{owned.level >= MAX_LEVEL ? 'MAX' : <>{tx('育成', 'Train')} <Coins size={12} />{upgradeCost(owned.level)}</>}</button></div></> : <p className={styles.lockedNote}>{tx('星の召喚で仲間にしよう', 'Meet them through a wish')}</p>}
          </article>;
        })}</div>
      </section>}

      {view === 'adventure' && <section ref={contentRef} className={styles.content}>
        {!battle ? <><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THE FLOATING ISLES · CHAPTER 01</p><h2>{tx('星をたどる旅。', 'Follow the stars.')}</h2><p>{tx('猫たちを出撃させて、影の砦を攻略しよう。', 'Send out your companions and reclaim the shadow fortresses.')}</p></div><span>{save.cleared.length} / {STAGES.length} {tx('クリア', 'cleared')}</span></div>
          <div className={styles.adventureLayout}><div className={styles.map}><div className={styles.mapSky} /><div className={styles.mapPath} /><div className={styles.stageNodes}>{STAGES.map((item, index) => { const unlocked = index === 0 || save.cleared.includes(index - 1); return <button key={index} aria-pressed={stageIndex === index} disabled={!unlocked || !ready} onClick={() => setStageIndex(index)}><span className={styles.island}>{!unlocked ? <LockKeyhole size={24} /> : save.cleared.includes(index) ? <Check size={28} /> : <span>{String(index + 1).padStart(2, '0')}</span>}</span><strong>{item.name[language]}</strong><small>{save.cleared.includes(index) ? tx('クリア済み', 'Cleared') : unlocked ? tx('冒険へ', 'Ready to explore') : tx('前の島をクリア', 'Clear the previous island')}</small></button>; })}</div></div>
            <aside className={styles.stagePanel}><p className={styles.eyebrow}>ISLAND {String(stageIndex + 1).padStart(2, '0')}</p><h3>{stage.name[language]}</h3><p>{stage.subtitle[language]}</p><div className={styles.stageDetails}><span>{tx('敵の属性', 'Enemy element')}<b style={{ color: ELEMENTS[stage.element].color }}>{ELEMENTS[stage.element].symbol} {ELEMENTS[stage.element].name[language]}</b></span><span>{tx('敵拠点HP', 'Fortress HP')}<b>{stage.hp.toLocaleString(language)}</b></span><span>{tx('制限時間', 'Time limit')}<b>3:00</b></span></div><p className={styles.eyebrow}>{save.cleared.includes(stageIndex) ? tx('周回報酬', 'REPLAY REWARDS') : tx('初回クリア報酬', 'FIRST CLEAR REWARDS')}</p><div className={styles.rewards}><span><Gem size={17} />{save.cleared.includes(stageIndex) ? 80 : stage.gems}</span><span><Coins size={17} />{save.cleared.includes(stageIndex) ? 120 + stageIndex * 30 : stage.coins}</span></div><div className={styles.miniTeam}>{save.team.map((id) => <CatSprite key={id} cat={characterById(id)} />)}<button aria-label={tx('編成を変更', 'Edit party')} onClick={() => setView('collection')}><Users size={17} /></button></div><button className={styles.primary} disabled={!ready} onClick={() => dispatch({ type: 'start', stage: stageIndex })}><Swords size={18} />{tx('出撃する', 'Start adventure')}<ArrowRight size={17} /></button><small className={styles.noStamina}>{tx('スタミナ消費なし · 何度でも挑戦', 'No stamina cost · Try as often as you like')}</small></aside>
          </div><p className={styles.elementGuide}>{tx('属性相性：火 → 風 → 水 → 火。得意な相手へのダメージは1.5倍。', 'Element advantage: Fire → Wind → Water → Fire. Deal 1.5× damage to the next element.')}</p>
        </> : <div className={styles.battlePanel}>
          <div className={styles.battleHeading}><div><p className={styles.eyebrow}>ISLAND {String(battle.stage + 1).padStart(2, '0')}</p><h2>{STAGES[battle.stage].name[language]}</h2></div><div><span className={styles.timer}>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span><button disabled={battle.status !== 'playing'} onClick={() => setSpeed(speed === 1 ? 2 : 1)} aria-label={tx(`戦闘速度 ${speed}倍`, `Battle speed ${speed}×`)}>{speed}×</button><button disabled={battle.status !== 'playing'} aria-label={battle.paused ? tx('再開', 'Resume') : tx('一時停止', 'Pause')} onClick={() => dispatch({ type: 'pause' })}>{battle.paused ? <Play size={17} /> : <Pause size={17} />}</button></div></div>
          <Battlefield battle={battle} language={language} />
          {battle.status === 'playing' ? <><div className={styles.energyBar}><span><WandSparkles size={17} />{tx('出撃エネルギー', 'Deploy energy')} <b>{Math.floor(battle.energy)} / 200</b></span><div><i style={{ width: `${battle.energy / 2}%` }} /></div><small>{tx('毎秒 +14', '+14 / second')}</small></div><div className={styles.deployRow}>{save.team.map((id) => { const cat = characterById(id); const cooldown = battle.cooldowns[id] ?? 0; return <button key={id} disabled={battle.paused || battle.energy < cat.cost || cooldown > 0 || battle.units.filter((unit) => unit.side === 'ally').length >= 16} onClick={() => dispatch({ type: 'deploy', id })} aria-label={tx(`${cat.name.ja}を出撃`, `Deploy ${cat.name.en}`)} style={colorStyle(cat)}><CatSprite cat={cat} /><span><strong>{cat.name[language]}</strong><small>{ROLES[cat.role][language]} · Lv. {save.owned[id].level}</small><b>{cooldown > 0 ? `${cooldown.toFixed(1)}s` : `✦ ${cat.cost}`}</b></span></button>; })}<button className={styles.cannon} disabled={battle.paused || battle.cannon < 100} onClick={() => dispatch({ type: 'cannon' })}><Sparkles size={25} /><strong>{tx('星の砲撃', 'Star cannon')}</strong><small>{battle.cannon < 100 ? `${Math.ceil((100 - battle.cannon) / 5)}s` : tx('発射！', 'Fire!')}</small></button></div><div className={styles.battleTip}><p>{tx('仲間をタップして出撃。自動で前進・攻撃します。盾役で守り、遠距離と回復役で支えよう。', 'Tap a companion to deploy. They move and fight automatically. Protect your rangers and healers with a guardian.')}</p><button onClick={() => dispatch({ type: 'leave' })}>{tx('撤退する', 'Retreat')}</button></div></> : <div className={styles.battleResult} role="status"><span>{battle.status === 'won' ? '✧' : '☾'}</span><p className={styles.eyebrow}>{battle.status === 'won' ? 'ISLAND RECLAIMED' : 'A MOMENT TO REST'}</p><h3>{battle.status === 'won' ? tx('星の光が、戻った！', 'The starlight returns!') : tx('次の冒険に、備えよう。', 'Your next adventure awaits.')}</h3><p>{battle.status === 'won' ? reward?.first ? save.cleared.length === STAGES.length ? tx('最後の砦を攻略！ すべての島に光が戻りました。', 'The final fortress is reclaimed. Starlight shines over every island.') : tx('初回クリア！ 新しい島への道が開きました。', 'First clear! Your journey continues to the next island.') : tx('この島を守りました。報酬を受け取りました。', 'The island is safe. Your rewards have been saved.') : tx('仲間を育成したり、盾役・回復役を編成して再挑戦しよう。星石やコインは減りません。', 'Train your companions or bring a guardian and healer, then try again. You lose no gems or coins.')}</p>{battle.status === 'won' && reward && <div className={styles.rewards}><span><Gem size={20} />+{reward.gems}</span><span><Coins size={20} />+{reward.coins}</span></div>}{save.cleared.length === STAGES.length && battle.status === 'won' && <p>{tx('全6島クリア！ 星ねこたちとの旅は、これからも続きます。', 'All six islands cleared! Keep collecting and growing your constellation.')}</p>}<button className={styles.primary} onClick={() => { dispatch({ type: 'leave' }); setStageIndex(Math.min(save.cleared.length, STAGES.length - 1)); }}>{tx('冒険マップへ', 'Back to the islands')}<ArrowRight size={17} /></button></div>}
        </div>}
      </section>}

      <footer className={styles.footer}><span><Shield size={13} />{storageError ? tx('保存できません', 'Saving unavailable') : tx('このブラウザに自動保存', 'Saved in this browser')}</span><span>{tx('課金なし · 全12キャラ · 全6ステージ', 'No purchases · 12 companions · 6 islands')}</span></footer>
    </div>

    <InfoModal isOpen={pulls.length > 0} onClose={() => dispatch({ type: 'close-pulls' })} title={tx('星がつないだ出会い', 'Written in the stars')}>
      <p className={styles.modalIntro}>{tx('新しい旅の仲間たち。重複した仲間は覚醒し、コインも獲得します。', 'Your companions have arrived. Duplicates grant awakening progress and coins.')}</p><div className={styles.pullGrid}>{pulls.map((pull, index) => { const cat = characterById(pull.id); return <div key={index} className={styles.pullCard} style={{ ...colorStyle(cat), '--reveal-delay': `${index * 80}ms` } as CSSProperties}><span className={styles.stars}>{'★'.repeat(cat.rarity)}</span><CatSprite cat={cat} /><strong>{cat.name[language]}</strong><small>{pull.isNew ? 'NEW!' : `+${pull.coins} ${tx('コイン', 'coins')}`}</small></div>; })}</div><button className={styles.modalContinue} onClick={() => { dispatch({ type: 'close-pulls' }); setView('collection'); }}>{tx('仲間を編成する', 'Build your party')}<ArrowRight size={17} /></button>
    </InfoModal>
    <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={tx('星ねこキャラバンの遊び方', 'Your guide to Starcat Caravan')}>
      <div className={styles.guide}><h3>{tx('1. 星に願って、仲間を集める', '1. Make a wish, meet a companion')}</h3><p>{tx('星石100個で1回召喚。通常の提供割合は★5が3%、★4が15%、★3が82%。同じレア度のキャラは均等確率です。', 'One wish costs 100 star gems. Base rates: ★5 3%, ★4 15%, ★3 82%. Characters of the same rarity are equally likely.')}</p><p>{tx('★4以上が9回連続で出なければ次は★4以上が確定（★5 3%、★4 97%）。★5が49回連続で出なければ次は★5確定。★5確定が優先され、それぞれのレア度を引くと対応するカウントがリセットされます。1回召喚と10回召喚で共有し、ページを閉じても保持されます。', 'After 9 wishes without a ★4+, the next is guaranteed (★5 3%, ★4 97%). After 49 without a ★5, the next is a ★5. The ★5 guarantee takes precedence. Each counter resets when its rarity or higher appears. Counters carry across single wishes, ten wishes, and visits.')}</p><h3>{tx('2. 育てて、チームを組む', '2. Train and build your party')}</h3><p>{tx('編成は1〜4体。盾役・近接・遠距離・回復の役割があります。コインでLv.20まで育成。重複1体ごとにHPと攻撃・回復力が4%上昇（5回まで）し、★3/4/5で80/160/320コインも獲得できます。', 'Build a party of 1–4 guardians, fighters, rangers, and healers. Train to level 20 with coins. Each duplicate adds 4% HP and attack/healing power (up to 5 times), plus 80/160/320 coins for ★3/4/5.')}</p><h3>{tx('3. 出撃して、島々を取り戻す', '3. Reclaim the floating islands')}</h3><p>{tx('エネルギーを使って仲間を出撃させます。同じ仲間を繰り返し出撃でき、戦場には最大16体。仲間は自動で前進・攻撃します。星の砲撃は敵全体に140ダメージ、20秒で再充填。3分以内に敵拠点を破壊すれば勝利、自拠点のHPが0になるか時間切れで敗北です。', 'Spend regenerating energy to deploy companions, including multiple copies, up to 16 allies on the field. They move and attack automatically. Star cannon hits every enemy for 140 damage and recharges in 20 seconds. Destroy the fortress within 3 minutes to win. Losing your base or running out of time ends the battle.')}</p><p>{tx('火は風に、風は水に、水は火にダメージ1.5倍。初回クリアで大きな報酬、周回でも星石80個とコインを獲得。スタミナ制限や課金はありません。', 'Fire beats Wind, Wind beats Water, and Water beats Fire for 1.5× damage. First clears award bonus rewards; replays give 80 gems and coins. No stamina limits or purchases.')}</p><p>{tx('進行はこのブラウザに保存されます。戦闘の途中経過は保存されず、再読込でマップから再挑戦になります。ブラウザのサイトデータを削除すると進行も消えます。', 'Progress is saved in this browser. Battles in progress are not saved; reload to retry from the map. Clearing browser site data also clears your progress.')}</p></div>
    </InfoModal>
  </main>;
}
