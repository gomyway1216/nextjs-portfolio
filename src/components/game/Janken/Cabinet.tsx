'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { REFILL } from '../MedalCenter/ledger';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { CatFace, CatPaw, HandIcon, MedalIcon, type CatMood } from './art';
import { HANDS, LAMPS, analyzeMachine, type Hand, type Outcome } from './engine';
import { getStrings } from './i18n';
import { keyAction, type KeyAction } from './keys';
import { createMachine, type Happening, type Machine, type MachineView, type RoundStorage, type Throw } from './machine';
import { canDouble } from './round';
import { createSpeaker, type JankenSound, type Speaker } from './sounds';
import styles from './Janken.module.css';

/** How many places the counter of the player's medals has, as the medal center's own counter. */
export const COUNTER_PLACES = 7;
/** How long the hands are shown before the outcome lamp lights, and how long after that the machine takes a next press, in milliseconds. */
export const REVEAL_MS = { hands: 550, result: 600, calm: 220 } as const;
/** How long the cabinet waits for the card before it says that another tab has it, in milliseconds (as the pusher does). */
const CARD_WAIT = 1500;
/** The roulette: whole turns of the ring before it slows to its lamp, and the waits between steps, quickest and slowest, in milliseconds. */
export const SPIN = { turns: 1, fastest: 26, slowest: 270, calm: 450 } as const;
/** The most medals the tray shows one by one. */
const TRAY_SHOWN = 24;

const WAITING_VIEW: MachineView = { round: null, ready: false, holding: false };

/** This device's storage for the round, or none where it cannot be reached. */
function browserStorage(): RoundStorage | null {
  try {
    const store = window.localStorage;
    return { read: (key) => store.getItem(key), write: (key, text) => store.setItem(key, text), remove: (key) => store.removeItem(key) };
  } catch {
    return null;
  }
}

/** The steps the roulette's light takes from `from` to `to`: whole turns first, then on to the lamp. */
export function spinPath(from: number, to: number, turns: number = SPIN.turns): number[] {
  const n = LAMPS.length;
  const distance = turns * n + ((to - from + n) % n);
  return Array.from({ length: distance }, (_, step) => (from + step + 1) % n);
}

/** The wait before each step of a spin of `steps` steps: quick at first, slowing to a stop (an eased curve). */
export function spinWaits(steps: number): number[] {
  return Array.from({ length: steps }, (_, step) => {
    const progress = steps <= 1 ? 1 : step / (steps - 1);
    return Math.round(SPIN.fastest + (SPIN.slowest - SPIN.fastest) * progress ** 3);
  });
}

const MOTION = '(prefers-reduced-motion: reduce)';
/** Whether the player has asked for less motion, and word when that changes. */
const prefersCalm = (): boolean => window.matchMedia(MOTION).matches;
const subscribeToMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia(MOTION);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

/**
 * Where lamp `i` stands on a ring of radius `radius` about (`centre`, `centre`). Rounded to a hundredth, so that the
 * server and the browser, whose sines can differ in the last digit, write the same page.
 */
export const lampAt = (i: number, centre = 200, radius = 180) => {
  const angle = (-90 + (360 / LAMPS.length) * i) * (Math.PI / 180);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { x: round(centre + radius * Math.cos(angle)), y: round(centre + radius * Math.sin(angle)) };
};

/** The colour a lamp's value is lit in. */
const LAMP_TONE: Readonly<Record<number, string>> = { 1: 'one', 2: 'two', 3: 'three', 5: 'five', 10: 'ten' };

export interface CabinetProps {
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active: boolean;
}

/**
 * The cabinet: the calico cat in its ring of lamps, the result lamps, the
 * counters, the buttons and the tray. What happens to the medals is the
 * machine's (`machine.ts`); this only shows it, and acts it out.
 */
export const Cabinet = ({ active }: CabinetProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const medals = useBank();
  // The machine is made in the browser only: on the server there are no medals to play with.
  const [machine] = useState<Machine | null>(() =>
    typeof window === 'undefined' ? null : createMachine({ bank: medalBank(), storage: browserStorage(), random: () => Math.random() }),
  );
  const speaker = useRef<Speaker | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const calm = useSyncExternalStore(subscribeToMotion, prefersCalm, () => false);
  const [announcement, setAnnouncement] = useState('');
  // What the cabinet is acting out: the hands of the throw just made, and the outcome lamp once it lights.
  const [acting, setActing] = useState<Throw | null>(null);
  const [shown, setShown] = useState<Throw | null>(null);
  const [lamp, setLamp] = useState<Outcome | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [tray, setTray] = useState<{ medals: number; key: number } | null>(null);
  const [said, setSaid] = useState<'lose' | { paid: number } | null>(null);
  const [longWait, setLongWait] = useState(false);
  const timers = useRef(new Set<number>());
  const spinningNow = useRef(false);
  const litNow = useRef<number | null>(null);
  const clipId = useId().replace(/:/g, '');

  const later = useCallback((ms: number, what: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      what();
    }, ms);
    timers.current.add(id);
  }, []);
  const play = useCallback((sound: JankenSound, delay = 0) => speaker.current?.play(sound, delay), []);

  // The machine takes its seat at the medal center while the cabinet stands, and its speaker is set up.
  useEffect(() => {
    if (!machine) return;
    const close = machine.open();
    speaker.current = createSpeaker();
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      spinningNow.current = false;
      close();
      speaker.current?.close();
      speaker.current = null;
    };
  }, [machine]);

  const subscribe = useCallback((listener: () => void) => (machine ? machine.subscribe(listener) : () => undefined), [machine]);
  const getView = useCallback(() => (machine ? machine.view() : WAITING_VIEW), [machine]);
  const view = useSyncExternalStore(subscribe, getView, () => WAITING_VIEW);
  const round = view.round;

  // What happens at the machine is heard, read out and acted out.
  const live = useRef({ t, calm });
  useEffect(() => {
    live.current = { t, calm };
  }, [t, calm]);
  const light = useCallback((at: number | null) => {
    litNow.current = at;
    setLit(at);
  }, []);
  /**
   * Stops whatever the cabinet is acting out: the hands being shown, the light running round. Done when the round
   * on the table is replaced (read again as the card comes back, or struck out by a reset), so that no step of an
   * old round's show is played over the new one.
   */
  const stopActing = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
    spinningNow.current = false;
    setSpinning(false);
    setActing(null);
  }, []);

  /**
   * The roulette: the light runs round the ring, once and on, slowing, and stops on the lamp drawn for the win. A
   * round found spinning (in another tab, or after the page was closed without a word) is run the same way.
   */
  const spin = useCallback(
    (target: number) => {
      if (!machine || spinningNow.current) return;
      spinningNow.current = true;
      setSpinning(true);
      const finish = () => {
        light(target);
        play('stop');
        // Only the round this light was run for is stopped by it.
        const now = machine.view().round;
        if (now?.phase === 'spinning' && now.lamp === target) machine.stopped();
        spinningNow.current = false;
        setSpinning(false);
        const after = machine.view().round;
        if (after?.phase === 'offer') setAnnouncement(live.current.t.announceStopped(LAMPS[target], after.win, canDouble(after)));
      };
      if (live.current.calm) {
        light(target);
        later(SPIN.calm, finish);
        return;
      }
      const path = spinPath(litNow.current ?? 0, target);
      const waits = spinWaits(path.length);
      let at = 0;
      path.forEach((step, i) => {
        at += waits[i];
        later(at, () => {
          light(step);
          play('tick');
        });
      });
      later(at + 180, finish);
    },
    [machine, later, light, play],
  );

  useEffect(() => {
    if (!machine) return;
    return machine.hear((happening: Happening) => {
      const { t: words, calm: still } = live.current;
      const handName = (hand: Hand) => words.hands[hand];
      switch (happening.type) {
        case 'inserted':
          setShown(null);
          setLamp(null);
          setSaid(null);
          setTray(null);
          light(null);
          play('coin');
          play('call', 0.32);
          setAnnouncement(words.announceInsert);
          return;
        case 'thrown': {
          const thrown = happening.throw;
          setActing(thrown);
          setShown(thrown);
          setLamp(null);
          play('pon');
          setAnnouncement(words.announceThrow(handName(thrown.player), handName(thrown.machine), thrown.outcome, thrown.kind));
          const hands = still ? 250 : REVEAL_MS.hands;
          const result = still ? REVEAL_MS.calm : REVEAL_MS.result;
          later(hands, () => {
            setLamp(thrown.outcome);
            play(thrown.outcome === 'win' ? 'win' : thrown.outcome === 'draw' ? 'aiko' : 'lose');
            if (thrown.outcome === 'lose') setSaid('lose');
          });
          later(hands + result, () => {
            setActing(null);
            if (thrown.outcome === 'win' && thrown.kind === 'play') spin(thrown.lamp);
          });
          if (thrown.kind === 'double' && thrown.outcome === 'win' && happening.round) {
            const next = happening.round;
            later(hands + result, () => setAnnouncement(words.announceDoubleWin(next.win, canDouble(next))));
          }
          return;
        }
        case 'paid':
          // Paid as the page was hidden, the medals are in the tray when the player comes back; nothing is heard.
          setTray({ medals: happening.medals, key: Date.now() });
          setSaid({ paid: happening.medals });
          setAnnouncement(words.announcePaid(happening.medals));
          if (happening.left) return;
          for (let i = 0; i < Math.min(12, happening.medals); i++) play('medal', 0.05 + i * 0.07);
          if (happening.medals >= 10) play('big');
          return;
        case 'returned':
          setAnnouncement(words.announceReturned(happening.medals));
          return;
        case 'resumed':
          stopActing();
          setShown(null);
          setLamp(happening.round.phase === 'calling' ? null : 'win');
          setAnnouncement(words.announceResumed);
          if (happening.round.phase === 'spinning') spin(happening.round.lamp);
          return;
        case 'restarted':
          stopActing();
          setShown(null);
          setLamp(null);
          light(null);
          setSaid(null);
          setTray(null);
          setAnnouncement(words.announceRestarted);
          return;
      }
    });
  }, [machine, later, light, play, spin, stopActing]);

  // Another tab's machine has the card: said a moment after, since the card goes away for a moment now and then.
  useEffect(() => {
    if (medals.card !== 'asking') return;
    const id = window.setTimeout(() => setLongWait(true), CARD_WAIT);
    return () => {
      window.clearTimeout(id);
      setLongWait(false);
    };
  }, [medals.card]);
  const cardAway = medals.card === 'away' || (medals.card === 'asking' && longWait);

  const phase = round?.phase ?? 'idle';
  const busy = acting !== null || spinning;
  const canInsert = view.ready && round === null && !busy && medals.balance >= 1;
  const canThrow = view.ready && phase === 'calling' && !busy;
  const canTake = view.holding && phase === 'offer' && !busy;
  const canDoubleUp = view.ready && canDouble(round) && !busy;
  const finding = !medals.loaded || medals.where === 'checking';

  const run = useCallback(
    (action: KeyAction) => {
      if (!machine) return;
      if (action.type === 'insert') {
        if (machine.view().round === null && !busy) machine.insert();
      } else if (action.type === 'hand') {
        if (!busy) machine.press(action.hand);
      } else if (action.type === 'double') {
        const before = machine.view().round;
        if (!busy && machine.double() && before) {
          play('double');
          play('call', 0.5);
          setShown(null);
          setLamp(null);
          setAnnouncement(live.current.t.announceDouble(before.win));
        }
      } else if (!busy) machine.collect();
    },
    [machine, busy, play],
  );

  // The machine's keys, while its tab is shown and nothing is open over it.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const action = keyAction(event);
      if (!action) return;
      event.preventDefault();
      if (cardAway) {
        machine?.play();
        return;
      }
      run(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, run, cardAway, machine]);

  const toggleSound = () => {
    const next = !soundOn;
    speaker.current?.set(next);
    setSoundOn(next);
    if (next) play('button');
  };

  // The cat: how it looks, and the paw it holds up.
  const mood: CatMood = acting
    ? lamp === null
      ? 'calling'
      : acting.outcome === 'win'
        ? 'won'
        : acting.outcome === 'lose'
          ? 'lost'
          : 'draw'
    : phase === 'calling'
      ? 'calling'
      : phase === 'spinning' || phase === 'offer'
        ? 'won'
        : said === 'lose'
          ? 'lost'
          : 'idle';
  const paw: Hand | 'beckon' = acting || ((phase === 'spinning' || phase === 'offer' || said === 'lose') && shown) ? (shown?.machine ?? 'gu') : phase === 'calling' ? 'gu' : 'beckon';
  const pawMotion = calm || acting ? 'still' : paw === 'beckon' ? 'beckon' : phase === 'calling' ? 'shake' : 'still';

  // What the cat says, on the message board under its face.
  const message = finding
    ? t.finding
    : acting
      ? lamp === null
        ? acting.draws > 0
          ? t.saySho
          : t.sayPon
        : acting.outcome === 'win'
          ? acting.kind === 'double'
            ? t.sayWin
            : t.saySpin
          : acting.outcome === 'lose'
            ? t.sayLose
            : t.sayDraw
      : phase === 'calling'
        ? round?.kind === 'double'
          ? t.sayDouble
          : (round?.draws ?? 0) > 0
            ? t.sayAiko
            : t.sayCall
        : phase === 'spinning'
          ? t.saySpin
          : phase === 'offer'
            ? t.sayOffer(round?.win ?? 0)
            : said === 'lose'
              ? t.sayLose
              : said && typeof said === 'object'
                ? t.sayPaid(said.paid)
                : medals.balance < 1
                  ? t.sayEmpty
                  : t.sayInsert;

  const winShown = phase === 'offer' ? (round?.win ?? 0) : phase === 'calling' && round?.kind === 'double' ? round.stake : null;
  const catState = acting || shown ? t.catStates.showing(t.hands[(acting ?? shown)!.machine]) : phase === 'calling' ? t.catStates.calling : phase === 'spinning' ? t.catStates.spinning : t.catStates.idle;
  const fmt = (n: number) => n.toLocaleString(locale);

  return (
    <div className={styles.stage}>
    <div className={styles.cabinetWrap}>
      <div className={styles.cabinet} data-testid="janken-cabinet" data-phase={phase} data-ready={view.ready} data-busy={busy} data-sound={soundOn}>
        {/* The sign over the cabinet. */}
        <div className={styles.marquee}>
          <span className={styles.bulbs} aria-hidden />
          <p className={styles.signMain} lang="ja">
            {t.sign}
          </p>
          <p className={styles.signSub} lang="en">
            {t.signSub}
          </p>
          <span className={styles.bulbs} aria-hidden />
        </div>

        {/* The face: the calico cat inside its ring of thirty lamps. */}
        <div className={styles.face}>
          <svg className={styles.faceArt} viewBox="0 0 400 400" role="img" aria-label={`${t.catLabel(catState)}. ${t.ringLabel(lit === null || spinning ? null : LAMPS[lit])}`} data-testid="janken-face" data-lit={lit ?? ''} data-mood={mood} data-paw={paw} data-attract={round === null && !busy && !finding}>
            <defs>
              <radialGradient id={`${clipId}-disc`} cx="50%" cy="42%" r="60%">
                <stop offset="0%" stopColor="#24406e" />
                <stop offset="100%" stopColor="#101a33" />
              </radialGradient>
              <clipPath id={`${clipId}-inner`}>
                <circle cx="200" cy="200" r="160" />
              </clipPath>
            </defs>
            <circle cx="200" cy="200" r="198" className={styles.ringBezel} />
            <circle cx="200" cy="200" r="160" fill={`url(#${clipId}-disc)`} />
            {LAMPS.map((value, i) => {
              const { x, y } = lampAt(i);
              const on = lit === i;
              return (
                <g key={i} className={styles.lamp} style={{ '--i': i } as CSSProperties} data-tone={LAMP_TONE[value]} data-on={on} data-stopped={on && !spinning && (phase === 'offer' || phase === 'spinning') ? 'true' : undefined}>
                  <circle cx={x} cy={y} r={value === 10 ? 17 : 14} />
                  <text x={x} y={y} dy="0.36em" textAnchor="middle">
                    {value}
                  </text>
                </g>
              );
            })}
            <g clipPath={`url(#${clipId}-inner)`}>
              <g transform="translate(52 52) scale(1.34)">
                <CatFace mood={mood} clipId={`${clipId}-head`} />
              </g>
              <g className={styles.paw} data-motion={pawMotion} key={`${paw}-${shown?.machine ?? ''}-${acting ? 'a' : ''}`}>
                <g transform="translate(234 182) scale(1.2)">
                  <CatPaw hand={paw} />
                </g>
              </g>
            </g>
          </svg>
        </div>

        {/* The message board: what the cat says. */}
        <p className={styles.board} data-testid="janken-says">
          {message}
        </p>

        {/* The two hands, and the outcome lamps between them. */}
        <div className={styles.versus}>
          <div className={styles.handWindow} data-on={shown !== null}>
            <span className={styles.handWho}>{t.you}</span>
            {shown ? <HandIcon hand={shown.player} className={styles.handWindowIcon} /> : <span className={styles.handWindowIcon} />}
            <span className={styles.handName} data-testid="janken-your-hand">
              {shown ? t.hands[shown.player] : '—'}
            </span>
          </div>
          <ul className={styles.resultLamps} aria-label={lamp ? t.lamps[lamp] : undefined}>
            {(['win', 'draw', 'lose'] as const).map((outcome) => (
              <li key={outcome} className={styles.resultLamp} data-outcome={outcome} data-on={lamp === outcome} data-testid={`janken-lamp-${outcome}`}>
                {t.lamps[outcome]}
              </li>
            ))}
          </ul>
          <div className={styles.handWindow} data-on={shown !== null}>
            <span className={styles.handWho}>{t.cat}</span>
            {shown ? <HandIcon hand={shown.machine} className={styles.handWindowIcon} /> : <span className={styles.handWindowIcon} />}
            <span className={styles.handName} data-testid="janken-cat-hand">
              {shown ? t.hands[shown.machine] : '—'}
            </span>
          </div>
        </div>

        {/* The counters: the player's medals, as on every machine at the medal center, and the medals won. */}
        <div className={styles.counters}>
          <div className={styles.counter}>
            <span className={styles.counterLabel}>{t.counterLabel}</span>
            <span className={styles.led}>
              <SegmentDisplay value={medals.loaded ? medals.balance : ''} places={COUNTER_PLACES} />
            </span>
            <span className={styles.counterText}>
              <b data-testid="janken-medals" data-loaded={medals.loaded}>
                {medals.loaded ? fmt(medals.balance) : '—'}
              </b>{' '}
              {t.unit}
            </span>
          </div>
          <div className={styles.counter}>
            <span className={styles.counterLabel}>{phase === 'calling' && round?.kind === 'double' ? t.stakeLabel : t.winLabel}</span>
            <span className={styles.ledSmall}>
              <SegmentDisplay value={winShown ?? ''} places={3} tone="amber" />
            </span>
            <span className={styles.counterText}>
              <b data-testid="janken-win">{winShown ?? 0}</b> {t.unit}
            </span>
          </div>
        </div>
        <p className={styles.notMoney} data-testid="janken-not-money">
          {t.notMoney}
        </p>

        {/* The control panel. */}
        <div className={styles.panel}>
          <div className={styles.slotRow}>
            <span className={styles.slot} aria-hidden>
              <span className={styles.slotMouth} />
            </span>
            <button type="button" className={styles.medalIn} data-testid="janken-medal-in" disabled={!canInsert} onClick={() => run({ type: 'insert' })} aria-keyshortcuts="M">
              <MedalIcon className={styles.medalInIcon} />
              {t.medalIn}
              <kbd className={styles.kbd}>M</kbd>
            </button>
          </div>
          <div className={styles.hands}>
            {HANDS.map((hand, i) => (
              <button
                key={hand}
                type="button"
                className={styles.handButton}
                data-hand={hand}
                data-testid={`janken-hand-${hand}`}
                disabled={!canThrow}
                data-ready={canThrow}
                onClick={() => run({ type: 'hand', hand })}
                aria-keyshortcuts={String(i + 1)}
              >
                <span className={styles.handFace}>
                  <HandIcon hand={hand} className={styles.handIcon} />
                </span>
                <span className={styles.handLabel}>{t.hands[hand]}</span>
                <span className={styles.handSub} aria-hidden>
                  {t.handsSub[hand]}
                </span>
                <kbd className={styles.kbd}>{i + 1}</kbd>
              </button>
            ))}
          </div>
          <div className={styles.offerRow} data-on={phase === 'offer'}>
            <button type="button" className={styles.doubleButton} data-testid="janken-double" disabled={!canDoubleUp} onClick={() => run({ type: 'double' })} aria-keyshortcuts="D">
              {t.double}
              <kbd className={styles.kbd}>D</kbd>
            </button>
            <button type="button" className={styles.collectButton} data-testid="janken-collect" disabled={!canTake} onClick={() => run({ type: 'collect' })} aria-keyshortcuts="T">
              {t.collect}
              <kbd className={styles.kbd}>T</kbd>
            </button>
          </div>
        </div>

        {/* The tray the medals won come down into. */}
        <div className={styles.tray} data-testid="janken-tray" data-medals={tray?.medals ?? 0}>
          <span className={styles.trayMouth} aria-hidden />
          <span className={styles.trayMedals} key={tray?.key ?? 0} aria-hidden>
            {tray &&
              Array.from({ length: Math.min(TRAY_SHOWN, tray.medals) }, (_, i) => (
                <span key={i} className={styles.trayMedal} style={{ animationDelay: calm ? '0s' : `${i * 0.06}s`, left: `${6 + ((i * 37) % 86)}%`, top: `${18 + ((i * 53) % 46)}%` }}>
                  <MedalIcon />
                </span>
              ))}
          </span>
          {tray && tray.medals > TRAY_SHOWN && <span className={styles.trayMore}>+{tray.medals - TRAY_SHOWN}</span>}
        </div>

        {/* The card is in another tab's machine: this one waits where it is until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="janken-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="janken-play-here" onClick={() => machine?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.below}>
        <button type="button" className={styles.soundButton} aria-pressed={soundOn} data-testid="janken-sound" onClick={toggleSound}>
          <span aria-hidden>{soundOn ? '🔊' : '🔈'}</span> {soundOn ? t.soundOn : t.soundOff}
        </button>
        {medals.loaded && medals.balance === 0 && round === null && (
          <button type="button" className={styles.refill} data-testid="janken-refill" onClick={() => machine?.refill()}>
            {t.refill(REFILL)}
          </button>
        )}
        <p className={styles.keysHint}>{t.keysHint}</p>
        <p className={styles.centerNote}>
          {t.centerNote}{' '}
          <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="janken-center-note-link">
            {t.centerNoteLink}
          </a>
        </p>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="janken-announcement">
        {announcement}
      </p>
    </div>
    <Plate />
    </div>
  );
};

/** The plate beside the cabinet, as a real one has: how to play, and what the lamps give. */
const Plate = () => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const odds = analyzeMachine();
  return (
    <aside className={styles.plate} aria-labelledby="janken-plate-title" data-testid="janken-plate">
      <h2 id="janken-plate-title" className={styles.plateTitle}>
        {t.plateTitle}
      </h2>
      <ol className={styles.plateSteps}>
        {t.plateSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h3 className={styles.plateSub}>{t.plateLamps}</h3>
      <ul className={styles.plateLamps}>
        {[...odds.values].reverse().map((v) => (
          <li key={v.medals}>
            <span className={styles.lampChip} data-tone={LAMP_TONE[v.medals]}>
              {v.medals}
            </span>
            <span>{t.plateLampCount(v.lamps)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.plateReturn}>{t.plateReturn}</p>
    </aside>
  );
};

export default Cabinet;
