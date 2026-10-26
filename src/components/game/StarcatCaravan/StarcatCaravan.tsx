'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Coins, Compass, Gem, Shield, Sparkles, Users } from 'lucide-react';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { GUEST, type AccountStore, type Player } from '../MedalPusher/account';
import { CHARACTERS, PITY_FIVE, PITY_FOUR, STAGES, SUMMON_COST, characterById, type Character } from './data';
import { useProgress } from './useProgress';
import { CatSprite } from './CatSprite';
import SummonShow from './SummonShow';
import { CompanionCollection, PartyOverview, TravelRecord } from './Companions';
import { GUIDE_URL } from './guide';
import { AchievementBadges, ResumeEncounter } from './Progression';
import AdventureWorld from './AdventureWorld';
import AdventureBattle from './AdventureBattle';
import { adventureOf } from './adventure';
import styles from './StarcatCaravan.module.css';

type View = 'summon' | 'adventure' | 'collection';

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
  const [pendingWish, setPendingWish] = useState<1 | 10 | null>(null);
  const { save, arena, pulls, reward } = state;
  const team = save.team.filter((id) => characters.some((cat) => cat.id === id));
  const running = arena?.status === 'playing' && !arena.paused;
  const hasBattle = !!arena;
  const contentRef = useRef<HTMLElement>(null);
  const previousScreen = useRef('adventure:false');

  useEffect(() => {
    const screen = `${view}:${hasBattle}`;
    if (previousScreen.current !== screen) contentRef.current?.scrollIntoView({ block: 'start' });
    previousScreen.current = screen;
  }, [view, hasBattle]);

  // A restored journal can belong to another account; close its pending wish presentation.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPendingWish(null);
  }, [progress, snapshot.opened]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const draw = (count: 1 | 10) => setPendingWish(count);
  const closeWish = () => { setPendingWish(null); dispatch({ type: 'close-pulls' }); };
  const launchWish = () => {
    const current = progress.getSnapshot();
    if (pendingWish === null || !current.playable || current.game.pulls.length || current.game.save.gems < pendingWish * SUMMON_COST) return false;
    dispatch({ type: 'summon', count: pendingWish, rolls: Array.from({ length: pendingWish * 2 }, () => Math.random()) });
    return progress.getSnapshot().game.pulls.length === pendingWish;
  };
  const openInfo = () => { if (running) dispatch({ type: 'arena-pause' }); setShowInfo(true); };
  const collected = Object.keys(save.owned).length;
  const featured = characterById('luna', characters);
  const saveLabel = storageError && status.where !== 'account' ? tx('この端末に保存できません', 'Device saving unavailable')
    : status.where === 'account' ? tx('アカウントに自動保存', 'Account autosave')
    : status.where === 'checking' ? tx('アカウントの記録を確認中', 'Checking account progress')
    : status.where === 'offline' ? tx('通信待ち · この端末に保存', 'Offline · Saved on this device')
    : status.where === 'unreadable' ? tx('アカウントの記録を読み込めません', 'Account journal unavailable')
    : tx('このブラウザに自動保存', 'Saved in this browser');

  const guestInvitation = player.settled && !player.uid && signInHref && !arena ? <p className={styles.notice}>{tx('ログインすると、仲間・育成・冒険の記録を別の端末でも引き継げます。', 'Sign in to carry your companions, training, and adventure to another device.')} <Link href={signInHref}>{tx('ログインして引き継ぐ', 'Sign in & keep progress')}<ArrowRight size={14} /></Link></p> : null;

  return <main className={styles.page} data-view={view} data-battle={hasBattle || undefined}>
    <div className={styles.shell}>
      <div className={styles.topline}><Link href="/games"><ArrowLeft size={15} />{tx('ゲーム一覧', 'All games')}</Link><span><i />{tx('無料で遊べるガチャRPG', 'A free collectible adventure')}</span></div>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark}><Sparkles size={26} /></span><div><p>STARCAT CARAVAN</p><h1>{tx('星ねこキャラバン', 'Starcat Caravan')}</h1></div></div>
        <div className={styles.wallet}><div title={tx('ガチャに使う星のしずく', 'Stardrops for wishes')}><Gem size={18} /><span><small>{tx('星のしずく', 'Stardrops')}</small><b data-testid="starcat-gems">{save.gems.toLocaleString(language)}</b></span></div><div title={tx('育成に使うコイン', 'Coins for training')}><Coins size={18} /><span><small>{tx('コイン', 'Coins')}</small><b data-testid="starcat-coins">{save.coins.toLocaleString(language)}</b></span></div></div>
      </header>
      <div className={styles.navigation}>
        <nav aria-label={tx('ゲームメニュー', 'Game menu')}>
          {([{ id: 'adventure', Icon: Compass, label: tx('冒険', 'Adventure') }, { id: 'summon', Icon: Sparkles, label: tx('星の召喚', 'Wish upon a star') }, { id: 'collection', Icon: Users, label: tx('仲間・編成', 'Companions') }] as const).map(({ id, Icon, label }) => <button key={id} type="button" aria-pressed={view === id} disabled={!!arena} onClick={() => setView(id)}><Icon size={17} /><span>{label}</span>{id === 'collection' && <small>{collected}/{characters.length}</small>}</button>)}
        </nav><Link href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className={styles.guideLink} aria-label={tx('冒険ガイドを別タブで開く', 'Open adventure guide in a new tab')}><Compass size={17} /><span>{tx('冒険ガイド', 'Adventure guide')}</span></Link><button className={styles.help} type="button" onClick={openInfo} aria-label={tx('遊び方', 'How to play')}><BookOpen size={17} /><span>{tx('遊び方', 'Guide')}</span></button>
      </div>

      {((!snapshot.ready && !recovered) || !player.settled || status.where === 'checking') && <p role="status" className={styles.notice}>{tx('旅の記録を読み込んでいます…', 'Opening your travel journal…')}</p>}
      {storageError && <p role="status" className={styles.notice}>{status.where === 'account' ? tx('端末への保存はできません。アカウントへの自動保存を利用しています。', 'Device storage is unavailable. Account autosave is active.') : player.uid ? tx('端末に保存できません。アカウントとの同期が完了するまで、この画面を開いたままにしてください。', 'Device saving is unavailable. Keep this page open until account sync completes.') : tx('ブラウザに保存できません。この画面では遊べますが、閉じると進行が失われます。', 'Browser saving is unavailable. You can play, but progress will be lost when you close this page.')}</p>}
      {status.where === 'offline' && <p role="status" className={styles.notice}>{ready ? tx('通信できないため、進行はこの端末に保存しています。接続が戻るとアカウントへ再送します。', 'Progress is kept on this device while offline. Account sync retries when the connection returns.') : tx('アカウントの記録に接続できません。進行を保護するため、読み込みを再試行しています。', 'Your account journal is unreachable. Retrying before opening the game to protect your progress.')}</p>}
      {status.where === 'unreadable' && <p role="status" className={styles.notice}>{tx('このバージョンではアカウントの記録を読み込めません。記録は上書きせず保護しています。ページを更新してお試しください。', 'This version cannot open your account journal. It has been protected from overwriting. Try updating this page.')}</p>}
      {snapshot.catalogMissing && <p role="status" className={styles.notice}>{tx('所持している仲間の最新情報が必要です。進行データは保護しています。接続後にページを更新してください。', 'Some owned companions need a newer catalog. Your progress is protected. Reload when connected to get their information.')}</p>}
      {catalogOffline && <p role="status" className={styles.notice}>{tx('キャラ一覧は前回取得したデータを使用しています。最新の仲間を確認するには、接続後にページを更新してください。', 'Using your previously saved companions catalog. Reload when connected to see the latest additions.')}</p>}
      {view !== 'adventure' && guestInvitation}
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
        <div className={styles.teamStrip}><strong><Users size={18} />{tx('冒険パーティー', 'Your party')} <small>{save.team.length}/4</small></strong><div>{[0, 1, 2, 3].map((index) => { const cat = team[index] ? characterById(team[index], characters) : null; return <div key={index} className={styles.teamSlot}>{cat ? <><CatSprite cat={cat} /><span>{cat.name[language]}</span><button aria-label={tx(`${cat.name.ja}を編成から外す`, `Remove ${cat.name.en} from party`)} disabled={!ready || save.team.length <= 1} onClick={() => dispatch({ type: 'team', id: cat.id })}>×</button></> : <span>＋</span>}</div>; })}</div><button className={styles.textButton} onClick={() => setView('adventure')}>{tx('冒険へ', 'To adventure')}<ArrowRight size={16} /></button></div>
        <PartyOverview save={save} characters={characters} language={language} />
        <AchievementBadges save={save} language={language} />
        <CompanionCollection save={save} characters={characters} language={language} ready={ready} onAction={dispatch} />
      </section>}

      {/* A new account/region remounts the world: followers, routes and dialogue never cross maps. */}
      {view === 'adventure' && <section ref={contentRef} className={styles.content}>
        {!arena ? <><ResumeEncounter save={save} characters={characters} language={language} ready={ready} dispatch={dispatch}/><AdventureWorld key={`${snapshot.opened}:${adventureOf(save).region}`} game={state} characters={characters} language={language} ready={ready} readGame={() => progress.getSnapshot().game} dispatch={dispatch} onParty={() => setView('collection')} onWish={() => setView('summon')} />{guestInvitation}<TravelRecord save={save} language={language} /><AchievementBadges save={save} language={language}/></> : <AdventureBattle arena={arena} save={save} characters={characters} language={language} ready={ready} dispatch={dispatch} reward={reward} />}
      </section>}

      <footer className={styles.footer}><span role="status" data-testid="starcat-save-status"><Shield size={13} />{saveLabel}</span><span>{tx(`課金なし · 全${characters.length}キャラ · 全${STAGES.length}ステージ`, `No purchases · ${characters.length} companions · ${STAGES.length} islands`)}</span></footer>
    </div>

    {pendingWish !== null && <SummonShow key={`${snapshot.opened}:${pendingWish}`} count={pendingWish} pulls={pulls} characters={characters} language={language} onLaunch={launchWish} onClose={closeWish} onParty={() => { closeWish(); setView('collection'); }} />}
    <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={tx('星ねこキャラバンの遊び方', 'Your guide to Starcat Caravan')}>
      <div className={styles.guide}><h3>{tx('1. 星に願って、仲間を集める', '1. Make a wish, meet a companion')}</h3><p>{tx('星のしずく100個で1回召喚。通常の提供割合は★5が3%、★4が15%、★3が82%。同じレア度のキャラは均等確率です。', 'One wish costs 100 Stardrops. Base rates: ★5 3%, ★4 15%, ★3 82%. Characters of the same rarity are equally likely.')}</p><p>{tx('★4以上が9回連続で出なければ次は★4以上が確定（★5 3%、★4 97%）。★5が49回連続で出なければ次は★5確定。★5確定が優先され、それぞれのレア度を引くと対応するカウントがリセットされます。1回召喚と10回召喚で共有し、ページを閉じても保持されます。', 'After 9 wishes without a ★4+, the next is guaranteed (★5 3%, ★4 97%). After 49 without a ★5, the next is a ★5. The ★5 guarantee takes precedence. Each counter resets when its rarity or higher appears. Counters carry across single wishes, ten wishes, and visits.')}</p><h3>{tx('2. 育てて、チームを組む', '2. Train and build your party')}</h3><p>{tx('好きな仲間を1〜4体。4役を揃える必要はありません。属性を混ぜると連携、同属性の仲間2体以上でその属性のHP+20%・攻撃/回復力+15%。防御力で被ダメージを軽減し、固有能力は自動発動。★3/4/5で基礎能力に1/1.2/1.5倍の補正。コインでLv.20まで育成。重複1体ごとにHPと攻撃・回復力が4%上昇（5回まで）し、★3/4/5で80/160/320コインも獲得できます。', 'Choose any 1–4 companions; no role slots are required. Mix elements for reactions, or select 2+ of an element for +20% HP and +15% attack/healing to that element. Defense reduces damage and unique abilities trigger automatically. ★3/4/5 multiply base stats by 1/1.2/1.5. Train to level 20 with coins. Each duplicate adds 4% HP and attack/healing power (up to 5 times), plus 80/160/320 coins for ★3/4/5.')}</p><h3>{tx('3. 歩いて探して、島々を取り戻す', '3. Explore and reclaim the islands')}</h3><p>{tx('冒険マップは矢印キー・WASD・方向ボタンで歩けます。行き先をタップしても移動できます。灯守に話し、二つの宝箱を探し、影の砦を攻略して灯台を復元しよう。仲間は先頭に選んだキャラについて歩きます。', 'Walk with arrows, WASD, the direction buttons, or tap a destination. Meet the lightkeeper, find two chests, reclaim the fortress and restore the lantern. Your selected companions follow the party leader.')}</p><p>{tx('戦闘では編成した仲間が最初から一緒に戦います。移動と通常攻撃の連打は不要。矢印・WASD・方向ボタン・地面のタップで歩き、赤い予告範囲から離れよう。通常攻撃と固有能力は自動です。大技は星の絆ボタンかSpace。敵全体へ一撃を放ち、パーティーHPを10%回復します。約13秒でゲージが戻ります。すべての敵と最後のボスを倒すと勝利、パーティーHPが0か3分経過で再挑戦です。', 'Your selected companions enter battle together. Move with arrows, WASD, direction buttons or a ground tap. Step out of red attack warnings. Normal attacks and unique abilities are automatic. Press Star bond or Space for a powerful hit to all enemies and 10% party healing. Its gauge refills in about 13 seconds. Defeat all enemies and the final boss to win; zero party HP or three minutes means another try.')}</p><p>{tx('仲間・育成・編成・通貨・天井・クリアに加え、探索位置・宝箱・灯守との会話・灯火の復元も保存します。ゲストはこのブラウザ、ログイン中はゲームセンターと同じアカウントに自動保存し、別の端末でも復元できます。初めてのアカウントにはゲストの進行を引き継ぎ、記録があるアカウントではその記録を開きます。★昇格・実績バッジと戦闘途中の状態も保存します。戦闘は約5秒ごとと中断時に記録し、再開カードから続けられます。★3→4はLv.5・600コイン、★4→5はLv.10・1,200コイン。レベルや重複数は維持されます。', 'Your companions, training, party, currencies, guarantees, clears, exploration position, chests, lightkeeper meetings and restored lanterns are saved. Guests save in this browser; members autosave to the same account as the medal center and can resume on another device. A new account adopts guest progress; an account with an existing journal opens that journal. Ascended stars, achievement badges and unfinished battles are saved too. Battles checkpoint about every five seconds and when suspended; continue from the resume card. Ascend ★3→4 at Lv.5 for 600 coins and ★4→5 at Lv.10 for 1,200 coins, keeping levels and copies.')}</p></div>
      <p className={styles.guideMore}><Link href={GUIDE_URL} target="_blank" rel="noopener noreferrer">{tx('編成・敵・途中結果・保存の解説を別タブで読む', 'Open the full guide in a new tab')}<ArrowRight size={15} /></Link></p>
    </InfoModal>
  </main>;
}
