'use client';

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { AIM, FIELD, clampAim } from './engine';
import { getStrings } from './i18n';
import { JACKPOT_START, ROULETTE, SPIN_PAYS, TIER_DIGITS, TOWERS_FROM, type Tier } from './lottery';
import { ageStage, createStage, drawField, lightGate, trackMedals, type Stage } from './render';
import { REEL_DIGITS, inReach, reelPositions, roulettePocket, stopTimes } from './screen';
import { MAX_STOCK, PAID_AS_TOWER, START_CREDITS, advance, createSession, insert, refill, type Session, type SessionEvent } from './session';
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
/** The digits the reels show before the first spin. */
const IDLE_DIGITS: [number, number, number] = [3, 5, 8];

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

type Banner = 'none' | 'reach' | 'win' | 'tower' | 'ball' | 'prize' | 'towers' | 'jackpot';

/** What the screen is doing. */
interface Show {
  roulette: boolean;
  /** The pocket the roulette's light is on, or −1. */
  lit: number;
  banner: Banner;
  amount: number;
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
const IDLE_SHOW: Show = { roulette: false, lit: -1, banner: 'none', amount: 0 };

/** What the screen should show for the session as it stands. `calm` leaves out the motion. */
function showOf(session: Session, calm: boolean): Show {
  const { roulette, spin } = session;
  if (roulette) {
    if (roulette.payout >= 0) {
      const jackpot = ROULETTE[roulette.pocket] === 'jackpot';
      const banner = jackpot ? 'jackpot' : roulette.payout >= TOWERS_FROM ? 'towers' : 'prize';
      return { roulette: true, lit: roulette.pocket, banner, amount: roulette.payout };
    }
    return { roulette: true, lit: calm ? -1 : roulettePocket(roulette), banner: 'none', amount: 0 };
  }
  if (spin) {
    const { tier } = spin.result;
    if (spin.done && tier !== 'miss') {
      if (tier === 'seven') return { roulette: false, lit: -1, banner: 'ball', amount: 0 };
      return { roulette: false, lit: -1, banner: PAID_AS_TOWER[tier] ? 'tower' : 'win', amount: SPIN_PAYS[tier] };
    }
    if (!calm && inReach(spin)) return { roulette: false, lit: -1, banner: 'reach', amount: 0 };
  }
  return IDLE_SHOW;
}

const sameHud = (a: Hud, b: Hud): boolean =>
  a.credits === b.credits &&
  a.jackpot === b.jackpot &&
  a.stock === b.stock &&
  a.played === b.played &&
  a.won === b.won &&
  a.lost === b.lost &&
  a.spins === b.spins &&
  a.paid === b.paid;

const sameShow = (a: Show, b: Show): boolean => a.roulette === b.roulette && a.lit === b.lit && a.banner === b.banner && a.amount === b.amount;

/** Which prize a digit belongs to, for its colour on the reel. */
const tierOfDigit = (digit: number): Exclude<Tier, 'miss'> => (digit === 7 ? 'seven' : TIER_DIGITS.big.includes(digit) ? 'big' : 'small');

/** Where each of the twelve pockets sits on the screen's 5 × 3 grid, going round clockwise from the top left. */
const pocketCell = (index: number): { row: number; column: number } => {
  if (index <= 4) return { row: 1, column: index + 1 };
  if (index === 5) return { row: 2, column: 5 };
  if (index <= 10) return { row: 3, column: 11 - index };
  return { row: 2, column: 1 };
};

const stripOffset = (position: number): string => `translateY(${(-position * 100) / (REEL_DIGITS.length + 1)}%)`;

export const PlayTab = ({ active = true }: { active?: boolean }) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const aimId = useId();

  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [show, setShow] = useState<Show>(IDLE_SHOW);
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
    let shownShow = IDLE_SHOW;
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
      let won = false;
      let lost = false;
      for (const event of events) {
        switch (event.type) {
          case 'landed':
            landed = true;
            break;
          case 'won':
            won = true;
            break;
          case 'lost':
            lost = true;
            break;
          case 'checker':
            lightGate(stage, event.gate);
            playSound(event.held ? 'gate' : 'full', soundOn);
            break;
          case 'spinStart':
            lastSpinClock = 0;
            break;
          case 'spinEnd':
            digits = event.result.digits;
            if (event.result.tier === 'seven') {
              playSound('seven', soundOn);
              setAnnouncement(strings.saySevens);
            } else if (event.payout > 0) {
              const tower = PAID_AS_TOWER[event.result.tier];
              playSound(tower ? 'big' : 'small', soundOn);
              setAnnouncement((tower ? strings.sayTower : strings.sayLine)(event.result.digits.join(' '), event.payout));
            } else {
              playSound('reelStop', soundOn);
            }
            break;
          case 'toppled':
            playSound('crash', soundOn);
            setAnnouncement(strings.sayToppled);
            break;
          case 'ball':
            playSound('ball', soundOn);
            setAnnouncement(strings.sayBall);
            break;
          case 'rouletteStart':
            break;
          case 'rouletteEnd':
            playSound(event.jackpot ? 'jackpot' : 'prize', soundOn);
            setAnnouncement(event.jackpot ? strings.sayJackpot(event.payout) : strings.sayPrize(event.payout));
            break;
        }
      }
      if (won) playSound('win', soundOn);
      else if (lost) playSound('lost', soundOn);
      else if (landed) playSound('land', soundOn);

      trackMedals(stage, session.machine);
      ageStage(stage, elapsed);
      drawField(context, stage, session.machine, { aim: aimNow, showGuide: true });

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

      const nextShow = showOf(session, calm.matches);
      if (!sameShow(nextShow, shownShow)) {
        if (nextShow.roulette && nextShow.banner === 'none' && nextShow.lit !== shownShow.lit) playSound('tick', soundOn);
        shownShow = nextShow;
        setShow(nextShow);
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

  const aimPercent = Math.round(((aim - AIM.min) / (AIM.max - AIM.min)) * 100);
  const bannerText: Record<Banner, string | null> = {
    none: null,
    reach: t.reach,
    win: t.spinWin(show.amount),
    prize: t.spinWin(show.amount),
    tower: t.towerWin(show.amount),
    towers: t.towerWin(show.amount),
    ball: t.ballWin,
    jackpot: t.jackpotWon(show.amount),
  };
  const banner = bannerText[show.banner];

  return (
    <div className={styles.machine}>
      <div className={styles.cabinet} data-banner={show.banner}>
        <div className={styles.marquee}>
          <span className={styles.logo} aria-hidden>
            MEDAL PUSHER
          </span>
          <div className={styles.jackpotBox}>
            <span className={styles.jackpotLabel}>{t.jackpot}</span>
            <span className={styles.jackpotValue} data-testid="pusher-jackpot">
              {fmt(hud.jackpot)}
            </span>
          </div>
        </div>

        <div className={styles.screen} role="group" aria-label={t.screenAria}>
          <div className={styles.stock} role="img" aria-label={t.stockAria(hud.stock, MAX_STOCK)} data-testid="pusher-stock" data-held={hud.stock}>
            <span className={styles.stockLabel} aria-hidden>
              {t.stock}
            </span>
            {Array.from({ length: MAX_STOCK }, (_, index) => (
              <span key={index} className={styles.lamp} data-lit={index < hud.stock} aria-hidden />
            ))}
          </div>

          <div className={styles.reels} aria-hidden data-hidden={show.roulette}>
            {IDLE_DIGITS.map((idle, reel) => (
              <div key={reel} className={styles.reel}>
                <div
                  className={styles.strip}
                  ref={(element) => {
                    strips.current[reel] = element;
                  }}
                  style={{ transform: stripOffset(idle - 1) }}
                >
                  {[...REEL_DIGITS, REEL_DIGITS[0]].map((digit, index) => (
                    <span key={index} className={styles.digit} data-tier={tierOfDigit(digit)}>
                      {digit}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {show.roulette && (
            <div className={styles.roulette} aria-hidden>
              {ROULETTE.map((pocket, index) => {
                const cell = pocketCell(index);
                return (
                  <span
                    key={index}
                    className={styles.pocket}
                    style={{ gridRow: cell.row, gridColumn: cell.column }}
                    data-jackpot={pocket === 'jackpot'}
                    data-lit={show.lit === index}
                  >
                    {pocket === 'jackpot' ? t.pocketJackpot : pocket}
                  </span>
                );
              })}
              <span className={styles.rouletteCentre}>{show.banner === 'none' ? t.chance : banner}</span>
            </div>
          )}

          <div className={styles.caption} aria-hidden data-testid="pusher-caption">
            {banner && !show.roulette ? (
              <span className={styles.banner} data-banner={show.banner}>
                {banner}
              </span>
            ) : (
              <span className={styles.legend}>
                <span data-tier="seven">{t.legendSeven}</span>
                <span data-tier="big">{t.legendOdd(SPIN_PAYS.big)}</span>
                <span data-tier="small">{t.legendEven(SPIN_PAYS.small)}</span>
              </span>
            )}
          </div>
        </div>

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
            <button
              type="button"
              className={styles.toggle}
              aria-pressed={auto}
              title={t.autoHint}
              data-testid="pusher-auto"
              onClick={() => setAuto(!auto)}
            >
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
