'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUp, ArrowRight, Check, Gem, SkipForward, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { CatSprite } from './CatSprite';
import { ELEMENTS, ROLES, SUMMON_COST, characterById, type Character, type Language } from './data';
import { type Pull } from './engine';
import { createWishAudio } from './wishAudio';
import styles from './SummonShow.module.css';

type Phase = 'ready' | 'flight' | 'reveal' | 'summary';
const tint = (rarity: number) => rarity === 5 ? '#f5cf79' : rarity === 4 ? '#c9a3ff' : '#93d9f0';
const theme = (rarity: number) => ({ '--wish-color': tint(rarity) }) as CSSProperties;

/** Pull/release or a quick upward flick. Returning a drawn star cancels; tapping costs nothing. */
export const shouldLaunchStar = (distance: number, maxPull: number, elapsed: number) => distance >= 52 || (maxPull < 12 && distance <= -64 && elapsed > 0 && elapsed <= 450);

/** Result presentation only: awards and the single charge stay in the game reducer. */
export function WishReveal({ pull, cat, language }: { pull: Pull; cat: Character; language: Language }) {
  const ja = language === 'ja';
  return <div className={styles.reveal} data-rarity={cat.rarity} style={theme(cat.rarity)}>
    <div className={styles.rays} aria-hidden="true" />
    <div className={styles.revealArt}><div className={styles.halo} aria-hidden="true" /><CatSprite cat={cat} /></div>
    <div className={styles.revealCopy} aria-live="polite" aria-atomic="true">
      <p className={styles.rarityCaption}>{cat.rarity === 5 ? (ja ? '星空が、あなたを選んだ。' : 'The stars have chosen you.') : cat.rarity === 4 ? (ja ? '特別な星が、舞い降りる。' : 'An extraordinary star arrives.') : (ja ? 'ここから、一緒に。' : 'A new journey, together.')}</p>
      <p className={styles.revealStars} aria-label={`${cat.rarity}${ja ? 'つ星' : ' stars'}`}>{'★'.repeat(cat.rarity)}</p>
      <p className={styles.characterTitle}>{cat.title[language]}</p>
      <h3>{cat.name[language]}</h3>
      <p className={styles.characterRole}>{ELEMENTS[cat.element].symbol} {ELEMENTS[cat.element].name[language]}<span />{ROLES[cat.role][language]}</p>
      <p className={styles.reward}>{pull.isNew ? <><Sparkles size={15} />NEW COMPANION</> : <><Check size={15} />{ja ? `覚醒の重複 ＋${pull.coins}コイン` : `Awakening copy · +${pull.coins} coins`}</>}</p>
    </div>
  </div>;
}

export function WishSummary({ pulls, characters, language }: { pulls: readonly Pull[]; characters: readonly Character[]; language: Language }) {
  return <div className={styles.resultGrid}>{pulls.map((pull, index) => {
    const cat = characterById(pull.id, characters);
    return <div className={styles.resultCard} data-rarity={cat.rarity} key={index} style={{ ...theme(cat.rarity), '--arrival': `${index * 45}ms` } as CSSProperties}>
      <span className={styles.resultStars}>{'★'.repeat(cat.rarity)}</span><CatSprite cat={cat} />
      <strong>{cat.name[language]}</strong><small>{pull.isNew ? 'NEW!' : `+${pull.coins} ${language === 'ja' ? 'コイン' : 'coins'}`}</small>
    </div>;
  })}</div>;
}

interface Props {
  count: 1 | 10;
  pulls: readonly Pull[];
  characters: readonly Character[];
  language: Language;
  onLaunch: () => boolean;
  onClose: () => void;
  onParty: () => void;
}

export default function SummonShow({ count, pulls, characters, language, onLaunch, onClose, onParty }: Props) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [index, setIndex] = useState(0);
  const [stretch, setStretch] = useState(0);
  const [error, setError] = useState(false);
  const [sound, setSound] = useState(false);
  const launched = useRef(false);
  const pointer = useRef<{ id: number; y: number; at: number; maxPull: number; charging: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const audio = useRef<ReturnType<typeof createWishAudio> | null>(null);
  const ja = language === 'ja';
  const tx = (a: string, b: string) => ja ? a : b;
  const highest = Math.max(3, ...pulls.map((pull) => characterById(pull.id, characters).rarity));
  const current = pulls[index];
  const cat = current ? characterById(current.id, characters) : null;

  useEffect(() => () => audio.current?.dispose(), []);

  const rarity = cat?.rarity;
  useEffect(() => { if (phase === 'reveal' && rarity) audio.current?.play(`reveal-${rarity}`); if (phase === 'summary') audio.current?.stop(); }, [phase, rarity, index]);

  useEffect(() => {
    if (phase !== 'flight' || pulls.length === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setPhase('reveal'), reduced ? 150 : highest === 5 ? 2200 : 1700);
    return () => window.clearTimeout(timer);
  }, [phase, pulls.length, highest]);

  function launch() {
    if (launched.current) return;
    launched.current = true;
    if (!onLaunch()) { launched.current = false; setError(true); setStretch(0); return; }
    pointer.current = null;
    audio.current?.play('launch');
    setStretch(0); setPhase('flight');
  }

  function cancelGesture() {
    if (!pointer.current) return;
    pointer.current = null; audio.current?.stop(); setStretch(0);
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    const gesture = pointer.current;
    if (gesture?.id !== event.pointerId) return;
    pointer.current = null;
    audio.current?.stop();
    if (shouldLaunchStar(event.clientY - gesture.y, gesture.maxPull, event.timeStamp - gesture.at)) launch();
    setStretch(0);
  }

  function next() {
    if (index + 1 === pulls.length) { setPhase('summary'); return; }
    setIndex(index + 1);
  }

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className={styles.backdrop} />
    <Dialog.Content className={styles.show} data-phase={phase} data-rarity={phase === 'reveal' ? cat?.rarity : highest} style={theme(phase === 'reveal' ? cat?.rarity ?? 3 : highest)}
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}>
      <Dialog.Title className={styles.srOnly}>{tx('星がつないだ出会い', 'Written in the stars')}</Dialog.Title>
      <Dialog.Description className={styles.srOnly}>{tx('星を下に引いて離すか、上へ素早く弾いて召喚。タップだけでは発射しません。キーボードではEnterかSpace。演出はスキップできます。', 'Pull down and release, or flick the star upward. Taps do not launch. Use Enter or Space on a keyboard. Animation can be skipped.')}</Dialog.Description>
      <div className={styles.starfield} aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 7) % 100}%`, top: `${(i * 23 + 11) % 100}%`, '--twinkle': `${i % 5 * -0.7}s` } as CSSProperties} />)}</div>
      <header className={styles.topbar}><div><span>STARCAT CARAVAN</span><p>{tx('星の召喚', 'STELLAR WISH')}</p></div><div className={styles.topControls}>
        <button type="button" aria-pressed={sound} onClick={() => { const player = audio.current ??= createWishAudio(); player.enable(!sound); if (!sound && phase === 'reveal' && rarity) player.play(`reveal-${rarity}`); setSound(!sound); }}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}<span>{tx('音', 'Sound')} {sound ? 'ON' : 'OFF'}</span></button>
        {phase === 'flight' || phase === 'reveal' ? <button type="button" onClick={() => setPhase('summary')}><SkipForward size={16} /><span>{tx('演出をスキップ', 'Skip animation')}</span></button> : null}
        <Dialog.Close className={styles.close} aria-label={tx('閉じる', 'Close')}><X size={21} /></Dialog.Close>
      </div></header>

      {phase === 'ready' && <div className={styles.aim} style={{ '--stretch': `${stretch}px`, '--charge': Math.max(0, stretch) / 120 } as CSSProperties}>
        <p className={styles.eyebrow}>A LITTLE WISH, A NEW JOURNEY</p><h2>{tx('その願いを、空へ。', 'Send your wish skyward.')}</h2>
        <p className={styles.instruction}>{stretch >= 52 ? tx('そのまま指を離して、発射！', 'Let go to launch!') : tx('下に引いて離す。あるいは、上へ弾く。', 'Pull down and release. Or flick upward.')}</p>
        <div className={styles.launchpad}><div className={styles.orbit} aria-hidden="true" /><div className={styles.orbitInner} aria-hidden="true" /><div className={styles.slingshot} aria-hidden="true" />
          <button type="button" className={styles.wishStar} aria-label={tx('星を引いて弾く（Enterでも発射）', 'Pull or flick the star (Enter to launch)')} onClick={(event) => { if (event.detail === 0) launch(); }}
            onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; pointer.current = { id: event.pointerId, y: event.clientY, at: event.timeStamp, maxPull: 0, charging: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (pointer.current?.id !== event.pointerId) return; const distance = event.clientY - pointer.current.y; pointer.current.maxPull = Math.max(pointer.current.maxPull, distance); if (!pointer.current.charging && distance >= 12) { pointer.current.charging = true; audio.current?.play('charge'); } setStretch(Math.max(-45, Math.min(120, distance))); }}
            onPointerUp={release} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 3L62 36L97 50L62 64L50 97L38 64L3 50L38 36Z" fill="currentColor" /><path d="M50 20L56 43L80 50L56 57L50 80L44 57L20 50L44 43Z" fill="#fff9dc" /></svg>
          </button>
          <ArrowUp className={styles.dragArrow} size={24} aria-hidden="true" />
        </div>
        <p className={styles.tapHint}>{tx('引いた星を元に戻すとキャンセル · Enter / Spaceでも発射', 'Return a pulled star to cancel · Enter / Space also launches')}</p>
        <p className={styles.cost}><Gem size={16} />{(count * SUMMON_COST).toLocaleString(language)} {tx('星のしずく', 'Stardrops')}<span>·</span>{tx(`${count}回召喚`, `${count} ${count === 1 ? 'wish' : 'wishes'}`)}</p>
        <p className={styles.fine}>{tx('弾いたときに召喚します。', 'Your wish begins when you launch.')}</p>
        {error && <p role="alert">{tx('召喚できませんでした。所持数と保存状態を確認してください。', 'Could not wish. Check your Stardrops and save status.')}</p>}
      </div>}

      {phase === 'flight' && <div className={styles.flight} role="status"><div className={styles.skyRing} aria-hidden="true" /><div className={styles.meteor} aria-hidden="true"><i />✦</div><div className={styles.horizon} aria-hidden="true" /><p>{tx('願いが、空を越える。', 'A wish beyond the sky.')}</p></div>}

      {phase === 'reveal' && current && cat && <div className={styles.revealStage}>
        <div key={index}><WishReveal pull={current} cat={cat} language={language} /></div>
        <div className={styles.revealFooter}><span>{String(index + 1).padStart(2, '0')} <i>/ {String(pulls.length).padStart(2, '0')}</i></span><div className={styles.dots} aria-hidden="true">{pulls.map((pull, i) => <i key={i} data-current={i === index} style={i <= index ? { background: tint(characterById(pull.id, characters).rarity) } : undefined} />)}</div><button type="button" className={styles.primary} onClick={next}>{index + 1 === pulls.length ? tx('出会った仲間を見る', 'View companions') : tx('次の星を開く', 'Reveal next star')}<ArrowRight size={17} /></button></div>
      </div>}

      {phase === 'summary' && <div className={styles.summary}><p className={styles.eyebrow}>YOUR NEW CONSTELLATION</p><h2>{tx('星がつないだ、仲間たち。', 'A constellation of companions.')}</h2><p className={styles.summaryIntro}>{tx('新しい出会いも、再会も。あなたの冒険の力になる。', 'New friends and familiar faces. Every meeting makes your party stronger.')}</p><WishSummary pulls={pulls} characters={characters} language={language} /><button type="button" className={styles.primary} onClick={onParty}>{tx('仲間を編成する', 'Build your party')}<ArrowRight size={17} /></button></div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
