'use client';

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { AIM, FIELD, clampAim } from './engine';
import { getStrings } from './i18n';
import { CHEST_TOWERS_FROM, JACKPOT_START, TIER_BONUS } from './lottery';
import { ageStage, celebrate, createStage, drawField, lightGate, trackMedals, type Stage } from './render';
import { IDLE_DIGITS, Screen, stripOffset } from './ScreenPanel';
import { reelPositions, sameScreen, screenState, stopTimes, type ScreenState } from './screen';
import { START_CREDITS, advance, createSession, insert, pickChest, refill, type Session, type SessionEvent } from './session';
import { playSound, unlockAudio } from './sounds';
import { HEIGHT, VIEW, unproject, unprojectPanel } from './view';
import styles from './MedalPusher.module.css';

/** Medals a second when Auto is on. */
export const AUTO_PACE = 2;
/** How long a press has to last before it becomes a stream of medals, in seconds. */
const HOLD_DELAY = 0.2;
/** The canvas never draws more than this many pixels per CSS pixel. */
const MAX_PIXEL_RATIO = 2;
/** The longest stretch of time one frame may cover, so a stalled tab does not lurch forward. */
const MAX_FRAME = 0.1;

/** The numbers shown around the cabinet. */
interface Hud {
  credits: number;
  jackpot: number;
  stock: number;
  played: number;
  won: number;
  lost: number;
  spins: number;
  paid: number;
}

const hudOf = (session: Session): Hud => ({
  credits: session.credits,
  jackpot: session.jackpot,
  stock: session.stock,
  played: session.inserted,
  won: session.won,
  lost: session.lost,
  spins: session.spins,
  paid: session.paidOut,
});

const INITIAL_HUD: Hud = { credits: START_CREDITS, jackpot: JACKPOT_START, stock: 0, played: 0, won: 0, lost: 0, spins: 0, paid: 0 };
const IDLE_SCREEN: ScreenState = {
  mode: 'slot',
  banner: 'none',
  amount: 0,
  line: null,
  lit: -1,
  square: 0,
  die: 0,
  rolling: false,
  chests: null,
  secondsLeft: 0,
};

const sameHud = (a: Hud, b: Hud): boolean =>
  a.credits === b.credits &&
  a.jackpot === b.jackpot &&
  a.stock === b.stock &&
  a.played === b.played &&
  a.won === b.won &&
  a.lost === b.lost &&
  a.spins === b.spins &&
  a.paid === b.paid;

export const PlayTab = ({ active = true }: { active?: boolean }) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const aimId = useId();

  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [screen, setScreen] = useState<ScreenState>(IDLE_SCREEN);
  const [aim, setAim] = useState<number>(FIELD.width / 2);
  const [auto, setAuto] = useState(false);
  const [sound, setSound] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const sessionRef = useRef<Session | null>(null);
  // What the frame loop reads; it runs outside React, so it takes these from refs.
  const live = useRef({ aim, auto, sound, active, strings: t });
  const press = useRef<{ since: number; streaming: boolean } | null>(null);
  // Set when a press has streamed medals, so the click that ends it does not drop one more.
  const swallowClick = useRef(false);

  useEffect(() => {
    live.current = { aim, auto, sound, active, strings: t };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const session = createSession(Math.floor(Math.random() * 2 ** 31));
    sessionRef.current = session;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

    let stage: Stage | null = null;
    const fit = () => {
      // While its tab is hidden the canvas has no size; it is fitted again when it comes back.
      if (canvas.clientWidth === 0) return;
      const ratio = Math.max(0.5, Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1) * (canvas.clientWidth / VIEW.width));
      const width = Math.round(VIEW.width * ratio);
      if (stage && canvas.width === width) return;
      canvas.width = width;
      canvas.height = Math.round(VIEW.height * ratio);
      const previous = stage;
      stage = createStage(ratio);
      // A resize keeps what the stage has seen, so no medal is taken for one that just left.
      if (previous) {
        stage.seen = previous.seen;
        stage.exits = previous.exits;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    let shownHud = INITIAL_HUD;
    let shownScreen = IDLE_SCREEN;
    let digits = IDLE_DIGITS;
    let autoClock = 0;
    let lastSpinClock = 0;
    let last = performance.now();
    const events: SessionEvent[] = [];
    let frameId = 0;

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      // A frame's timestamp can be a touch earlier than the clock read when the loop was set up.
      const elapsed = Math.max(0, Math.min(MAX_FRAME, (now - last) / 1000));
      last = now;
      const { aim: aimNow, auto: autoNow, sound: soundOn, active: activeNow, strings } = live.current;
      if (!activeNow || !stage) return;

      // The player's medals: a held press streams them, and Auto feeds two a second.
      // A press that outlasts the medals ends there, so a refill does not start pouring them again.
      if (session.credits === 0) press.current = null;
      const held = press.current;
      if (held && !held.streaming && now / 1000 - held.since >= HOLD_DELAY) held.streaming = true;
      if (held?.streaming) insert(session, aimNow);
      if (autoNow) {
        autoClock += elapsed;
        if (autoClock >= 1 / AUTO_PACE) {
          autoClock = 0;
          insert(session, aimNow);
        }
      }

      events.length = 0;
      advance(session, elapsed, events);

      let landed = false;
      let won = 0;
      let lost = false;
      for (const event of events) {
        switch (event.type) {
          case 'landed':
            landed = true;
            break;
          case 'won':
            won += event.count;
            break;
          case 'lost':
            lost = true;
            break;
          case 'checker':
            lightGate(stage, event.gate);
            playSound(event.held ? 'gate' : 'full', soundOn);
            break;
          case 'toppled':
            celebrate(stage, 'crash');
            playSound('crash', soundOn);
            setAnnouncement(strings.sayToppled);
            break;
          case 'ball':
            playSound('ball', soundOn);
            setAnnouncement(strings.sayBall);
            break;
          case 'spinStart':
            lastSpinClock = 0;
            break;
          case 'spinEnd': {
            digits = event.result.digits;
            const { tier } = event.result;
            if (tier === 'miss') {
              playSound('reelStop', soundOn);
            } else {
              const leadsTo = TIER_BONUS[tier];
              playSound(leadsTo === 'ball' ? 'seven' : leadsTo === 'chest' ? 'big' : 'small', soundOn);
              const line = event.result.digits.join(' ');
              setAnnouncement(leadsTo === 'ball' ? strings.saySevens : leadsTo === 'chest' ? strings.sayChestStart(line) : strings.saySugorokuStart(line));
            }
            break;
          }
          case 'sugorokuStart':
            playSound('dice', soundOn);
            break;
          case 'sugorokuEnd':
            if (event.fever) celebrate(stage, 'fever');
            playSound(event.fever ? 'fever' : 'prize', soundOn);
            setAnnouncement(event.fever ? strings.sayFever(event.payout) : strings.saySugoroku(event.payout));
            break;
          case 'chestStart':
            playSound('chest', soundOn);
            break;
          case 'chestPicked':
            playSound('reelStop', soundOn);
            break;
          case 'chestEnd':
            playSound('prize', soundOn);
            setAnnouncement(strings.sayChest(event.chest + 1, event.payout, event.payout >= CHEST_TOWERS_FROM));
            break;
          case 'rouletteStart':
            break;
          case 'rouletteEnd':
            if (event.jackpot) celebrate(stage, 'jackpot');
            playSound(event.jackpot ? 'jackpot' : 'prize', soundOn);
            setAnnouncement(event.jackpot ? strings.sayJackpot(event.payout) : strings.sayPrize(event.payout));
            break;
        }
      }
      if (won > 0) playSound('win', soundOn);
      else if (lost) playSound('lost', soundOn);
      else if (landed) playSound('land', soundOn);

      trackMedals(stage, session.machine, won);
      ageStage(stage, elapsed, calm.matches);
      drawField(context, stage, session.machine, { aim: aimNow, showGuide: true, calm: calm.matches });

      // The reels act out the spin; without motion they simply change when it is over.
      const { spin } = session;
      if (spin && !spin.done && !calm.matches) {
        const positions = reelPositions(spin);
        const stops = stopTimes(spin);
        strips.current.forEach((strip, reel) => {
          if (strip) strip.style.transform = stripOffset(positions[reel]);
          if (lastSpinClock < stops[reel] && spin.elapsed >= stops[reel]) playSound('reelStop', soundOn);
        });
        if (spin.result.reach && lastSpinClock < stops[2] && spin.elapsed >= stops[2]) playSound('reach', soundOn);
        lastSpinClock = spin.elapsed;
      } else {
        const resting = spin && spin.done ? spin.result.digits : digits;
        strips.current.forEach((strip, reel) => {
          if (strip) strip.style.transform = stripOffset(resting[reel] - 1);
        });
      }

      const nextScreen = screenState(session, calm.matches);
      if (!sameScreen(nextScreen, shownScreen)) {
        const ticking = nextScreen.mode === 'roulette' && nextScreen.banner === 'none' && nextScreen.lit !== shownScreen.lit;
        const hopping = nextScreen.mode === 'sugoroku' && nextScreen.square !== shownScreen.square;
        if (ticking || hopping) playSound('tick', soundOn);
        shownScreen = nextScreen;
        setScreen(nextScreen);
      }
      const nextHud = hudOf(session);
      if (!sameHud(nextHud, shownHud)) {
        if (nextHud.credits === 0 && shownHud.credits > 0) setAnnouncement(strings.sayEmpty);
        shownHud = nextHud;
        setHud(nextHud);
      }
    };
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      sessionRef.current = null;
    };
  }, []);

  const drop = () => {
    const session = sessionRef.current;
    if (session) insert(session, live.current.aim);
  };

  const aimAtPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const px = ((event.clientX - bounds.left) / bounds.width) * VIEW.width;
    const py = ((event.clientY - bounds.top) / bounds.height) * VIEW.height;
    // On the back panel the aim is the spot under the pointer; lower down, the spot on the pusher.
    const panel = unprojectPanel(px, py);
    const point = panel && panel.height >= HEIGHT.pusher ? panel : unproject(px, py, HEIGHT.pusher);
    if (!point) return;
    const next = clampAim(point.x);
    live.current.aim = next;
    setAim(next);
  };

  const startPress = () => {
    press.current = { since: performance.now() / 1000, streaming: false };
    swallowClick.current = false;
  };
  const endPress = () => {
    if (press.current?.streaming) swallowClick.current = true;
    press.current = null;
  };
  const onDropClick = () => {
    if (swallowClick.current) swallowClick.current = false;
    else drop();
  };

  const toggleSound = () => {
    if (!sound) void unlockAudio();
    setSound(!sound);
  };

  const onRefill = () => {
    const session = sessionRef.current;
    if (session && refill(session)) setHud(hudOf(session));
  };

  const onPick = (chest: number) => {
    const session = sessionRef.current;
    if (session) pickChest(session, chest);
  };

  const registerStrip = (reel: number, element: HTMLDivElement | null) => {
    strips.current[reel] = element;
  };

  const aimPercent = Math.round(((aim - AIM.min) / (AIM.max - AIM.min)) * 100);

  return (
    <div className={styles.machine}>
      <div className={styles.cabinet} data-banner={screen.banner}>
        <div className={styles.bulbs} aria-hidden />
        <div className={styles.marquee}>
          <div className={styles.logo} aria-hidden>
            <span className={styles.logoMain}>GOLDEN FEVER</span>
            <span className={styles.logoSub}>ゴールデンフィーバー</span>
          </div>
          <div className={styles.jackpotBox}>
            <span className={styles.jackpotLabel}>{t.jackpot}</span>
            <span className={styles.jackpotValue} data-testid="pusher-jackpot">
              {fmt(hud.jackpot)}
            </span>
          </div>
        </div>

        <Screen state={screen} stock={hud.stock} strings={t} registerStrip={registerStrip} onPick={onPick} />

        <div className={styles.fieldWrap}>
          <canvas
            ref={canvasRef}
            className={styles.field}
            role="img"
            aria-label={t.fieldAria}
            data-testid="pusher-field"
            onPointerDown={(event) => {
              aimAtPointer(event);
              startPress();
            }}
            onPointerMove={(event) => {
              if (press.current) aimAtPointer(event);
            }}
            onPointerUp={endPress}
            onPointerCancel={() => {
              // The browser took the gesture for a scroll: nothing was meant to drop, and no click follows.
              press.current = null;
            }}
            onPointerLeave={endPress}
            onClick={onDropClick}
          />
        </div>

        <div className={styles.panel}>
          <div className={styles.credit}>
            <span className={styles.creditLabel}>{t.medals}</span>
            <strong className={styles.creditValue} data-testid="pusher-credits">
              {fmt(hud.credits)}
            </strong>
          </div>
          <div className={styles.aim}>
            <label htmlFor={aimId} className={styles.aimLabel}>
              {t.aim}
            </label>
            <input
              id={aimId}
              type="range"
              className={styles.aimSlider}
              min={0}
              max={100}
              step={1}
              value={aimPercent}
              aria-valuetext={t.aimValue(aimPercent)}
              data-testid="pusher-aim"
              onChange={(event) => setAim(AIM.min + (Number(event.target.value) / 100) * (AIM.max - AIM.min))}
            />
          </div>
          <button
            type="button"
            className={styles.drop}
            title={t.dropHint}
            data-testid="pusher-drop"
            disabled={hud.credits === 0}
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
            onClick={onDropClick}
          >
            {t.drop}
          </button>
          <div className={styles.toggles}>
            <button type="button" className={styles.toggle} aria-pressed={auto} title={t.autoHint} data-testid="pusher-auto" onClick={() => setAuto(!auto)}>
              {t.auto}
            </button>
            <button type="button" className={styles.toggle} aria-pressed={sound} data-testid="pusher-sound" onClick={toggleSound}>
              <span aria-hidden>{sound ? '🔊' : '🔇'}</span> {t.sound}
            </button>
          </div>
        </div>

        {hud.credits === 0 && (
          <button type="button" className={styles.refill} data-testid="pusher-refill" onClick={onRefill}>
            {t.refill(START_CREDITS)}
          </button>
        )}
        <div className={styles.bulbs} aria-hidden />
      </div>

      <section className={styles.tally} aria-label={t.tallyTitle}>
        <h2 className={styles.tallyTitle}>{t.tallyTitle}</h2>
        <dl className={styles.tallyGrid}>
          <div className={styles.tallyItem}>
            <dt>{t.tallyPlayed}</dt>
            <dd data-testid="pusher-played">{fmt(hud.played)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyWon}</dt>
            <dd data-testid="pusher-won">{fmt(hud.won)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyLost}</dt>
            <dd data-testid="pusher-lost">{fmt(hud.lost)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallySpins}</dt>
            <dd data-testid="pusher-spins">{fmt(hud.spins)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyPaid}</dt>
            <dd data-testid="pusher-paid">{fmt(hud.paid)}</dd>
          </div>
          <div className={styles.tallyItem}>
            <dt>{t.tallyReturn}</dt>
            <dd data-testid="pusher-return">{hud.played === 0 ? '—' : `${((hud.won / hud.played) * 100).toFixed(1)}%`}</dd>
          </div>
        </dl>
        <p className={styles.note}>{t.tallyNote}</p>
      </section>

      <p className={styles.srOnly} aria-live="polite" data-testid="pusher-announcement">
        {announcement}
      </p>
    </div>
  );
};
