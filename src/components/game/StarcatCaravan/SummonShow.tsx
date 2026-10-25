'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDown, ArrowRight, Check, Gem, SkipForward, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { CatSprite } from './CatSprite';
import { ELEMENTS, ROLES, SUMMON_COST, characterById, type Character, type Language } from './data';
import { type Pull } from './engine';
import styles from './SummonShow.module.css';

type Phase = 'ready' | 'flight' | 'reveal' | 'summary';
const tint = (rarity: number) => rarity === 5 ? '#f5cf79' : rarity === 4 ? '#c9a3ff' : '#93d9f0';
const theme = (rarity: number) => ({ '--wish-color': tint(rarity) }) as CSSProperties;

/** Moving back to the origin cancels a drag; it must never turn into a tap. */
export const shouldLaunchStar = (distance: number, dragged: boolean) => distance >= 48 || (!dragged && Math.abs(distance) < 12);

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
  const pointer = useRef<{ id: number; y: number; dragged: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const ja = language === 'ja';
  const tx = (a: string, b: string) => ja ? a : b;
  const highest = Math.max(3, ...pulls.map((pull) => characterById(pull.id, characters).rarity));
  const current = pulls[index];
  const cat = current ? characterById(current.id, characters) : null;

  const chime = useCallback((rarity: number, starting = false) => {
    if (!sound) return;
    try {
      const context = audio.current ??= new AudioContext();
      void context.resume().catch(() => undefined);
      const notes = starting ? [220, 440, 880] : rarity === 5 ? [523.25, 659.25, 783.99, 1046.5] : rarity === 4 ? [440, 554.37, 659.25] : [440, 659.25];
      notes.forEach((note, i) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const time = context.currentTime + i * 0.12;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(note, time);
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(0.07, time + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(time); oscillator.stop(time + 0.75);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Silent play stays fully usable when audio is unavailable. */ }
  }, [sound]);

  useEffect(() => () => { void audio.current?.close().catch(() => undefined); }, []);

  const rarity = cat?.rarity;
  useEffect(() => { if (phase === 'reveal' && rarity) chime(rarity); }, [phase, rarity, index, chime]);

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
    chime(3, true);
    setStretch(0); setPhase('flight');
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    const gesture = pointer.current;
    if (gesture?.id !== event.pointerId) return;
    pointer.current = null;
    if (shouldLaunchStar(event.clientY - gesture.y, gesture.dragged)) launch();
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
      <Dialog.Description className={styles.srOnly}>{tx('星を下に引いて放すか、タップして召喚。キーボードではEnter。演出はスキップできます。', 'Pull the star down and release, tap, or press Enter to wish. The animation can be skipped.')}</Dialog.Description>
      <div className={styles.starfield} aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 7) % 100}%`, top: `${(i * 23 + 11) % 100}%`, '--twinkle': `${i % 5 * -0.7}s` } as CSSProperties} />)}</div>
      <header className={styles.topbar}><div><span>STARCAT CARAVAN</span><p>{tx('星の召喚', 'STELLAR WISH')}</p></div><div className={styles.topControls}>
        <button type="button" aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}<span>{tx('音', 'Sound')} {sound ? 'ON' : 'OFF'}</span></button>
        {phase === 'flight' || phase === 'reveal' ? <button type="button" onClick={() => setPhase('summary')}><SkipForward size={16} /><span>{tx('演出をスキップ', 'Skip animation')}</span></button> : null}
        <Dialog.Close className={styles.close} aria-label={tx('閉じる', 'Close')}><X size={21} /></Dialog.Close>
      </div></header>

      {phase === 'ready' && <div className={styles.aim} style={{ '--stretch': `${stretch}px`, '--charge': stretch / 120 } as CSSProperties}>
        <p className={styles.eyebrow}>A LITTLE WISH, A NEW JOURNEY</p><h2>{tx('その願いを、空へ。', 'Send your wish skyward.')}</h2>
        <p className={styles.instruction}>{tx('星を下に引いて、指を離そう。', 'Pull the star down, then let go.')}</p>
        <div className={styles.launchpad}><div className={styles.orbit} aria-hidden="true" /><div className={styles.orbitInner} aria-hidden="true" /><div className={styles.slingshot} aria-hidden="true" />
          <button type="button" className={styles.wishStar} aria-label={tx('星を弾いて召喚する', 'Launch the star and wish')} onClick={(event) => { if (event.detail === 0) launch(); }}
            onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; pointer.current = { id: event.pointerId, y: event.clientY, dragged: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (pointer.current?.id !== event.pointerId) return; const distance = event.clientY - pointer.current.y; if (Math.abs(distance) >= 12) pointer.current.dragged = true; setStretch(Math.max(0, Math.min(120, distance))); }}
            onPointerUp={release} onPointerCancel={() => { pointer.current = null; setStretch(0); }}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 3L62 36L97 50L62 64L50 97L38 64L3 50L38 36Z" fill="currentColor" /><path d="M50 20L56 43L80 50L56 57L50 80L44 57L20 50L44 43Z" fill="#fff9dc" /></svg>
          </button>
          <ArrowDown className={styles.dragArrow} size={24} aria-hidden="true" />
        </div>
        <p className={styles.tapHint}>{tx('タップ / Enter でも弾けます', 'Tap or press Enter to launch')}</p>
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
