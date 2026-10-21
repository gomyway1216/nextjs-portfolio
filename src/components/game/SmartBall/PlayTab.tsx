'use client';

import { Fragment, createRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { forTheMachine, keyName, useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound, type MachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { MARBLES, STAKE, WINDOWS, drawPlay, linesOf, playOf, valueOf, type Play } from './engine';
import { getStrings } from './i18n';
import { Board, ChaseLamps, type BoardParts } from './Board';
import { SMART_BALL_GAME, createTable, playId, playOfRecord, type PlayRecord, type Staked, type Table } from './medalTable';
import { PUBLISHED_SMART_BALL_ODDS } from './published';
import { PLUNGER_DRAW, createMachineClock, cuesOf, loadTrack, poseAt, restPose, shotTrack, strengthAt, weakTrack, windowOf, type Cue, type CueSound, type Pose, type Track } from './scene';
import styles from './SmartBall.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the marbles left, and a win (100). */
export const MEDAL_PLACES = 7;
export const BALL_PLACES = 2;
export const WIN_PLACES = 3;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** How long the machine stands unplayed before the rail's lamps run on their own, in ms. */
export const ATTRACT_AFTER = 12_000;
const HISTORY_LIMIT = 16;
/** How far the plunger's knob on its button travels at full strength, in px. */
const KNOB_TRAVEL = 28;
/** How long the flash over the board says a line has lit, in ms. */
const FLASH_MS = 1_600;

/** This device's storage for the machine: the play, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a play's name, from the browser's crypto: Math.random is the draw's alone. */
const nameRandom = (): number => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  } catch {
    return (Date.now() % 1000) / 1000;
  }
};

const MOTION = '(prefers-reduced-motion: reduce)';
const prefersCalm = (): boolean => window.matchMedia?.(MOTION).matches === true;
const subscribeToMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia?.(MOTION);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/** `load`: a marble rolls onto the plunger; `aim`: it waits there to be shot; `fly`: it is on its way; `weak`: it rolls back after too soft a shot. */
type Phase = 'idle' | 'load' | 'aim' | 'fly' | 'weak';

/** A play on this page: its stake, the marble on the plunger or on its way, and how it is moving now. */
interface Flight {
  staked: Staked;
  /** The marble on the plunger, or on its way from it. */
  marble: number;
  phase: Phase;
  way: Track | null;
  wayAt: number;
  /** The cues of the way still to come. */
  cues: { at: number; cue?: Cue; sound?: CueSound; then?: () => void }[];
  then: (() => void) | null;
}

/** A play that has ended, as the machine shows it. */
interface Ended {
  id: string;
  play: Play;
  /** The last play from before this page opened, or one finished from before. */
  earlier: boolean;
}

interface SessionStats {
  plays: number;
  played: number;
  won: number;
  holes: number;
  bingos: number;
}
const EMPTY_STATS: SessionStats = { plays: 0, played: 0, won: 0, holes: 0, bingos: 0 };

/** What the status line says for a moment as a marble goes: a hole lit, a line, OUT, a shot too soft. */
type Moment = { kind: 'hole'; hole: number } | { kind: 'bingo'; lines: number } | { kind: 'out' } | { kind: 'weak' } | null;

/**
 * A line of words kept whole between its phrases: in Japanese it breaks only after 「、」「。」「：」「！」「…」, a
 * zero-width space, or a space, and in English at its spaces.
 */
export function phrasesOf(text: string): string[] {
  const parts: string[] = [];
  let part = '';
  for (const character of text) {
    if (character === '​') {
      if (part) parts.push(part);
      part = '';
      continue;
    }
    part += character;
    if ('、。：！？…→ '.includes(character)) {
      parts.push(part);
      part = '';
    }
  }
  if (part) parts.push(part);
  return parts;
}
const Phrases = ({ text }: { text: string }) => (
  <>
    {phrasesOf(text).map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <wbr />}
        <span className={styles.phrase}>{part}</span>
      </Fragment>
    ))}
  </>
);

const SOUND_OF: Record<CueSound, MachineSound> = { spring: 'spring', roll: 'roll', pin: 'marble', rattle: 'rattle', hole: 'hole', drop: 'drop' };

/**
 * Brings the board, the status line and the plunger wholly on screen, under the site's toolbar, as a play starts: a
 * player who scrolled down to START sees the whole board while shooting. Moved on the next frame, after the press has
 * been drawn (a smooth scroll begun in the press itself was dropped by the browser: MedalCenter/lookUp.ts). Where they
 * are on screen already, nothing moves.
 */
function bringIntoView(area: HTMLElement | null): void {
  if (!area || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    if (!area.isConnected) return;
    const rect = area.getBoundingClientRect();
    const toolbar = parseFloat(getComputedStyle(area).scrollMarginTop) || 0;
    const room = window.innerHeight - toolbar;
    if (rect.top >= toolbar - 1 && rect.bottom <= window.innerHeight + 1) return;
    const by = rect.height <= room ? rect.top - toolbar - (room - rect.height) / 2 : rect.top - toolbar;
    window.scrollBy({ top: by, behavior: prefersCalm() ? 'auto' : 'smooth' });
  });
}

/** Whether every marble of a play has been shot: nothing is left to the player's pull. */
const allShot = (flight: Flight): boolean => flight.staked.record.shots.length >= MARBLES;

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the table under its glass, its counters, START, the plunger and Skip. What happens to the medals is
 * the table's (medalTable.ts); this draws each play the moment START is pressed, moves the marbles (scene.ts), turns
 * the plunger's pulls into shots, and shows how each play ended.
 */
export const PlayTab = ({ player = GUEST, active = true }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 1) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

  const bankState = useBank();
  const mine = bankState.loaded && player.settled && bankState.owner === player.uid;
  const here = bankState.card === 'here';
  const calm = useSyncExternalStore(subscribeToMotion, prefersCalm, () => false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [marble, setMarble] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  // The holes shown lit: each as its marble drops in, the whole board as a play ends.
  const [shownLit, setShownLit] = useState(0);
  const [moment, setMoment] = useState<Moment>(null);
  // The flash over the board as a line lights: which one it is (a new key each time), and how many lines there are.
  const [flash, setFlash] = useState<{ key: number; lines: number } | null>(null);
  const [pulled, setPulled] = useState(false);
  const [pullWindow, setPullWindow] = useState<number | null>(null);
  const [known, setKnown] = useState(false);
  const [outcome, setOutcome] = useState<Ended | null>(null);
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [resumed, setResumed] = useState(false);
  const [attract, setAttract] = useState(false);
  const [touched, setTouched] = useState(0);
  // Skip only fast-forwards: it can be pressed once no marble is left to shoot.
  const [skippable, setSkippable] = useState(false);
  // The clock a play runs on, stopped while the machine is not on show (scene.ts).
  const [clock] = useState(() => createMachineClock(() => performance.now()));

  const flightRef = useRef<Flight | null>(null);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // While START writes its play down and takes the medals: the medals moving then are this press's own, not a play to take up.
  const staking = useRef(false);
  /** When the plunger was taken hold of, by the machine's clock; null while it is not held. */
  const heldAt = useRef<number | null>(null);
  /** How far the plunger is drawn back as it is let go, 0 to 1: the marble is shot from there. */
  const drawnRef = useRef(0);
  const keyPulled = useRef(false);
  const pointerDown = useRef<number | null>(null);
  /** Sets the frame loop going again, where it has stopped because nothing on the board moved (it stops itself again then). */
  const wake = useRef<(() => void) | null>(null);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  // The parts of the board the frame loop moves, and the plunger's gauge.
  const [parts] = useState<BoardParts>(() => ({ marble: createRef<SVGGElement>(), plunger: createRef<SVGGElement>(), lamps: createRef<SVGGElement>() }));
  const gaugeRef = useRef<HTMLSpanElement | null>(null);
  const knobRef = useRef<HTMLSpanElement | null>(null);

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const winShown = phase === 'idle' ? (outcome?.play.won ?? 0) : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;
  const ballsLeft = phase === 'idle' ? 0 : MARBLES - marble;

  const canStart = mine && here && phase === 'idle';
  // Brought up to date as START is drawn (a layout effect), not after the paint: the press reads it, and a press made
  // the moment START is drawn enabled was otherwise turned away by the old value.
  const canStartRef = useRef(canStart);
  useLayoutEffect(() => {
    canStartRef.current = canStart;
  }, [canStart]);

  /** Lets go of the plunger without a shot: the page or the tab has gone from under the player's hand. */
  const letGo = useCallback(() => {
    heldAt.current = null;
    keyPulled.current = false;
    pointerDown.current = null;
    setPulled(false);
    setPullWindow(null);
  }, []);

  /** The play has ended on this page (or was found ended): settled if it was not already, and shown. */
  const finish = useCallback(
    (flight: Flight, how: 'played' | 'skipped' | 'resumed') => {
      if (flightRef.current === flight) flightRef.current = null;
      letGo();
      // A frame to take the marble off the board and the plunger back to rest.
      wake.current?.();
      setSkippable(false);
      setMoment(null);
      const { staked } = flight;
      // Known as shown before it is settled: the medals moving as it is paid wake the machine's look at the play.
      shownLast.current = staked.record.id;
      const before = staked.paid;
      // Marbles still to come as it is finished here (the page is going, or another tab is playing the medals): they
      // are shot blind, and the player is told so, since the shots that ended it were not theirs.
      const blind = staked.record.shots.length < MARBLES;
      const settled = staked.paid ? 'already' : (table.current?.settle(staked) ?? 'later');
      if (settled === 'later') {
        // Not this page's to finish now (the medals are elsewhere): it stays on record, and the page that next holds the
        // card finishes it.
        setShownLit(0);
        setPhase('idle');
        return;
      }
      if (settled === 'void' || staked.void) {
        setShownLit(0);
        setPhase('idle');
        setRoundId(null);
        return;
      }
      const ended = playOfRecord({ ...staked.record, paid: true });
      if (ended.won > 0 && (settled === 'paid' || before)) {
        payMedals();
        payWin();
      }
      setShownLit(ended.lit);
      const entry: Ended = { id: staked.record.id, play: ended, earlier: how === 'resumed' };
      setOutcome(entry);
      setHistory((list) => [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT));
      if (how !== 'resumed') {
        const holes = ended.marbles.filter((m) => m.hole !== null).length;
        setStats((s) => ({ plays: s.plays + 1, played: s.played + STAKE, won: s.won + ended.won, holes: s.holes + holes, bingos: s.bingos + (ended.lines.length > 0 ? 1 : 0) }));
      }
      if (ended.won > 0) play(ended.lines.length >= 3 ? 'big' : 'win');
      setResumed(how === 'resumed');
      if (blind) setMessage(live.current.t.finishedAway);
      setPhase('idle');
      setAnnouncement(live.current.t.outcome(ended).say);
    },
    [letGo, payMedals, payWin, play],
  );

  /** Sets the marble moving along `way`, and what to do once it gets to the end. */
  const go = useCallback(
    (flight: Flight, way: Track, then: () => void) => {
      flight.way = way;
      flight.wayAt = clock.now();
      flight.cues = cuesOf(way);
      flight.then = then;
      wake.current?.();
    },
    [clock],
  );

  /** Marble `m` is on the plunger, waiting to be shot. */
  const ready = useCallback(
    (flight: Flight, m: number) => {
      flight.marble = m;
      flight.phase = 'aim';
      flight.way = null;
      setMarble(m);
      setPhase('aim');
      setAnnouncement(live.current.t.sayReady(m));
    },
    [],
  );

  /** The next marble rolls out of the tray onto the plunger. */
  const load = useCallback(
    (flight: Flight, m: number) => {
      flight.marble = m;
      flight.phase = 'load';
      setMarble(m);
      setPhase('load');
      go(flight, loadTrack(live.current.calm), () => ready(flight, m));
    },
    [go, ready],
  );

  /** The marble on the plunger shot at strength `window`: written down first, then flown. */
  const commit = useCallback(
    (window: number) => {
      const flight = flightRef.current;
      const tab = table.current;
      if (!flight || flight.phase !== 'aim' || !tab) return;
      const m = flight.marble;
      const kept = tab.shoot(flight.staked, m, window);
      if (kept === 'unsaved') {
        setMessage(live.current.t.unsaved);
        return;
      }
      if (kept === 'away') return;
      if (kept === 'gone') {
        finish(flight, 'skipped');
        return;
      }
      const { record } = flight.staked;
      const shot = playOf(record.draw, record.shots).marbles[m];
      setSkippable(allShot(flight));
      flight.phase = 'fly';
      setPhase('fly');
      setMoment(null);
      const litAfter = playOf(record.draw, record.shots).lit;
      const linesBefore = linesOf(playOf(record.draw, record.shots.slice(0, m)).lit).length;
      const way = shotTrack(shot, record.draw.drops[m], live.current.calm, drawnRef.current);
      go(flight, way, () => {
        if (m + 1 < MARBLES) load(flight, m + 1);
        else finish(flight, 'played');
      });
      // What the page shows as the marble drops in: the hole lit, and a line made by it.
      flight.cues = flight.cues.map((cue) => {
        if (cue.cue === 'hole' && shot.hole !== null) {
          const hole = shot.hole;
          return {
            ...cue,
            then: () => {
              setShownLit(litAfter);
              const lines = linesOf(litAfter).length;
              if (lines > linesBefore) {
                setMoment({ kind: 'bingo', lines });
                setFlash((before) => ({ key: (before?.key ?? 0) + 1, lines }));
                play('bonus');
              } else setMoment({ kind: 'hole', hole });
              setAnnouncement(live.current.t.sayHole(hole, lines));
            },
          };
        }
        if (cue.cue === 'out') return { ...cue, then: () => setMoment({ kind: 'out' }) };
        return cue;
      });
    },
    [finish, go, load, play],
  );

  /** The plunger taken hold of: it draws back on its spring. */
  const pull = useCallback(() => {
    const flight = flightRef.current;
    if (!flight || flight.phase !== 'aim' || heldAt.current !== null || clock.paused()) return false;
    heldAt.current = clock.now();
    wake.current?.();
    setPulled(true);
    setPullWindow(-1);
    setMoment(null);
    play('plunger');
    return true;
  }, [clock, play]);

  /** The plunger let go: it springs forward and shoots the marble at the strength it was drawn to; too soft, and the marble rolls back. */
  const release = useCallback(() => {
    if (heldAt.current === null) return;
    const flight = flightRef.current;
    const strength = strengthAt(clock.now() - heldAt.current);
    heldAt.current = null;
    setPulled(false);
    setPullWindow(null);
    drawnRef.current = strength;
    if (!flight || flight.phase !== 'aim') return;
    const window = windowOf(strength);
    if (window < 0) {
      flight.phase = 'weak';
      setPhase('weak');
      setMoment({ kind: 'weak' });
      go(flight, weakTrack(live.current.calm), () => ready(flight, flight.marble));
      return;
    }
    commit(window);
  }, [clock, commit, go, ready]);

  /** START: the play is drawn here, in the press, written down, and the medals taken. */
  const start = () => {
    if (flightRef.current || !canStartRef.current) return;
    const drawn = drawPlay(Math.random);
    staking.current = true;
    let staked: ReturnType<Table['stake']>;
    try {
      staked = table.current?.stake(drawn) ?? { kind: 'away' };
    } finally {
      staking.current = false;
    }
    if (staked.kind !== 'staked') {
      const words = live.current.t;
      if (staked.kind === 'short') setMessage(words.notEnough);
      else if (staked.kind === 'unsaved') setMessage(words.unsaved);
      else if (staked.kind === 'unfinished') {
        setMessage(words.unfinished);
        syncNow.current?.();
      }
      return;
    }
    setMessage('');
    setResumed(false);
    setAttract(false);
    setOutcome(null);
    setShownLit(0);
    setMoment(null);
    const now = clock.now();
    const flight: Flight = { staked: staked.staked, marble: 0, phase: 'load', way: null, wayAt: now, cues: [], then: null };
    setSkippable(false);
    flightRef.current = flight;
    setRoundId(staked.staked.record.id);
    play('medal');
    setAnnouncement(live.current.t.sayStart);
    bringIntoView(boardRef.current);
    load(flight, 0);
  };

  /**
   * Skip: once the last marble has been shot, its way to its hole (or the gutter) is cut short, and the play ends as it
   * would have. Before that it does nothing: it never shoots a marble for the player.
   */
  const skip = useCallback(() => {
    const flight = flightRef.current;
    if (flight && allShot(flight)) finish(flight, 'skipped');
  }, [finish]);

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback(
    (said: boolean) => {
      const flight = flightRef.current;
      if (flight) flight.staked.void = true;
      flightRef.current = null;
      letGo();
      wake.current?.();
      table.current?.clear();
      shownLast.current = null;
      setShownLit(0);
      setPhase('idle');
      setRoundId(null);
      setOutcome(null);
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      setMoment(null);
      setResumed(false);
      medalBank().restarted(SMART_BALL_GAME);
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [letGo],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a play under way is finished at once (the marbles not shot yet shot blind), so that
  // its winnings are in before anyone else plays the medals or the page is gone.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => playId(Date.now(), nameRandom),
    });
    const finishNow = () => {
      const flight = flightRef.current;
      if (flight && !flight.staked.void) finish(flight, 'skipped');
    };
    const placed = purse.sit(SMART_BALL_GAME, { granted: () => undefined, yielding: finishNow });
    seat.current = placed;

    let syncing = false;
    let again = false;
    const sync = () => {
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      try {
        do {
          again = false;
          const tab = table.current;
          const { player: who } = live.current;
          const state = purse.getState();
          if (!tab || !placed.holding() || !state.loaded || !who.settled || state.owner !== who.uid) break;
          if (purse.restartDue(SMART_BALL_GAME)) startOver(false);
          if (flightRef.current || staking.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            const flight: Flight = { staked: { record: left, stored: true, paid: false, void: false }, marble: left.shots.length, phase: 'idle', way: null, wayAt: 0, cues: [], then: null };
            finish(flight, 'resumed');
            setKnown(true);
            break;
          }
          const record: PlayRecord | null = tab.last();
          setKnown(true);
          if (record && record.paid && shownLast.current !== record.id) {
            shownLast.current = record.id;
            const ended: Ended = { id: record.id, play: playOfRecord(record), earlier: true };
            setShownLit(ended.play.lit);
            setOutcome(ended);
            setHistory((before) => (before.some((entry) => entry.id === ended.id) ? before : [ended, ...before].slice(0, HISTORY_LIMIT)));
            // Finished by the page that went (reloaded, closed or hidden mid-play), the marbles still to come shot blind:
            // said here as that page would have, since the shots that ended it were not the player's.
            if (record.own !== undefined) {
              setResumed(true);
              setMessage(live.current.t.finishedAway);
            }
          }
        } while (again);
      } finally {
        syncing = false;
      }
    };
    syncNow.current = sync;
    const unsubscribe = purse.subscribe(sync);
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') startOver(true);
      else if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    return () => {
      unlisten();
      unsubscribe();
      placed.leave();
      if (seat.current === placed) seat.current = null;
      if (syncNow.current === sync) syncNow.current = null;
      table.current = null;
    };
  }, [finish, startOver]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // A play that has ended: whatever the medals heard of while the marbles rolled (another tab, a reset) is looked at now.
  useEffect(() => {
    if (phase === 'idle' && mine && here) syncNow.current?.();
  }, [phase, mine, here]);

  // The flash over the board goes out after a moment.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // The attract run: a machine left standing unplayed runs the rail's lamps, until the next press.
  useEffect(() => {
    if (phase !== 'idle' || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [phase, active, touched, outcome]);

  // ── The frame loop: the marble, the plunger, the rail's lamps and the gauge, moved straight on their elements ──
  // It runs only while something moves: a marble on its way, the plunger held or springing back. A machine standing
  // unplayed, a marble waiting on the plunger, or a machine whose clock is stopped (its Odds tab or its help in front)
  // asks the browser for no frames at all; whatever sets something moving wakes it (`wake`).
  const boardEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let frame = 0;
    let running = false;
    /** Woken while it ran: one more frame, to show what changed (a marble taken off the board as its play ends). */
    let again = false;
    const shown = { marble: '', plunger: NaN, window: '', gauge: -2 };
    let drawn = 0;
    let last = performance.now();
    const step = (now: number) => {
      again = false;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The machine's time: stopped while the machine is not on show. A plunger held as it was hidden is let go, unshot.
      const at = clock.now();
      if (clock.paused() && heldAt.current !== null) letGo();
      const flight = flightRef.current;
      const calmNow = live.current.calm;
      // How far the plunger is drawn: while held, as far as the sweep has got; let go, it springs back at once.
      const held = heldAt.current;
      const strength = held === null ? 0 : strengthAt(at - held);
      const want = strength;
      drawn = calmNow || want > drawn ? want : Math.max(want, drawn - dt * 14);
      if (Math.abs(drawn - shown.plunger) > 0.004 || Number.isNaN(shown.plunger)) {
        shown.plunger = drawn;
        parts.plunger.current?.setAttribute('transform', `translate(0 ${(drawn * PLUNGER_DRAW).toFixed(2)})`);
        if (knobRef.current) knobRef.current.style.transform = `translateY(${(drawn * KNOB_TRAVEL).toFixed(1)}px)`;
      }
      const strengthWindow = held === null ? null : windowOf(strength);
      const windowText = strengthWindow === null ? '' : strengthWindow < 0 ? 'weak' : String(strengthWindow);
      if (windowText !== shown.window) {
        shown.window = windowText;
        boardEl.current?.setAttribute('data-window', windowText);
        parts.lamps.current?.setAttribute('data-window', strengthWindow === null || strengthWindow < 0 ? '' : String(strengthWindow));
        setPullWindow(strengthWindow);
      }
      const gaugeLevel = strengthWindow === null ? -2 : strengthWindow;
      if (gaugeLevel !== shown.gauge) {
        shown.gauge = gaugeLevel;
        gaugeRef.current?.setAttribute('data-level', String(gaugeLevel));
      }
      // The marble.
      let pose: Pose | null = null;
      if (flight) {
        if (flight.way) {
          const t = (at - flight.wayAt) / 1000;
          pose = poseAt(flight.way, t);
          while (flight.cues.length > 0 && flight.cues[0].at <= t) {
            const cue = flight.cues.shift()!;
            if (cue.sound) play(SOUND_OF[cue.sound]);
            cue.then?.();
          }
          if (t >= flight.way.length && flight.then) {
            const then = flight.then;
            flight.then = null;
            flight.way = null;
            then();
          }
        } else if (flight.phase === 'aim') {
          // On the plunger's tip, drawn back with it.
          const rest = restPose();
          pose = { ...rest, y: rest.y + drawn * PLUNGER_DRAW };
        }
      }
      const marbleText = pose ? `${pose.x.toFixed(1)} ${pose.y.toFixed(1)} ${pose.turn.toFixed(0)} ${pose.shown.toFixed(2)} ${pose.sunk.toFixed(2)}` : '';
      if (marbleText !== shown.marble) {
        shown.marble = marbleText;
        const el = parts.marble.current;
        if (el) {
          if (!pose) el.style.opacity = '0';
          else {
            el.setAttribute('transform', `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)})`);
            el.style.opacity = pose.shown.toFixed(2);
            const inner = el.firstElementChild as SVGGElement | null;
            inner?.setAttribute('transform', `scale(${(1 - 0.12 * pose.sunk).toFixed(3)})`);
            inner?.querySelector('[data-swirl]')?.setAttribute('transform', `rotate(${pose.turn.toFixed(1)})`);
          }
        }
      }
      // On while a marble is on its way (and the clock runs), or the plunger is held or still springing back.
      if (again || (flightRef.current?.way && !clock.paused()) || heldAt.current !== null || drawn > 0) frame = window.requestAnimationFrame(step);
      else running = false;
    };
    const run = () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      last = performance.now();
      frame = window.requestAnimationFrame(step);
    };
    wake.current = run;
    run();
    return () => {
      if (wake.current === run) wake.current = null;
      running = false;
      window.cancelAnimationFrame(frame);
    };
  }, [clock, letGo, parts, play]);

  // While the medals are in another tab's game, the machine says so, a moment after.
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (bankState.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [bankState.card]);
  const cardAway = mine && (bankState.card === 'away' || (bankState.card === 'asking' && longWait));
  const outOfMedals = mine && here && phase === 'idle' && bankState.balance === 0;
  const refillDue = outOfMedals && bankState.out.length === 0;
  // Medals that cannot cover a play: START is off, and the machine says why. A few medals left are not none, so no
  // refill is given for them either: they are for another machine.
  const shortOf = mine && here && phase === 'idle' && bankState.balance > 0 && bankState.balance < STAKE;

  // While the machine is not on show (its Odds tab, or its help, is in front of it), its clock stops: the plunger's
  // sweep and the marble's way wait, and go on from the same point when it is shown again. (A plunger held as it went is
  // let go without a shot, by the frame loop.)
  useEffect(() => {
    if (active) {
      clock.resume();
      wake.current?.();
    } else clock.pause();
  }, [active, clock]);

  // On a desktop: Space or Enter starts a play; with a marble on the plunger, Space or Enter held and let go shoots it;
  // S skips the last marble's way.
  useMachineKeys(active, (key) => {
    const flight = flightRef.current;
    if (key === ' ' || key === 'Enter') {
      if (!flight) start();
      else if (flight.phase === 'aim' && pull()) keyPulled.current = true;
    } else if (key === 's') skip();
    else return false;
    return true;
  });
  useEffect(() => {
    if (!active) return;
    const up = (event: KeyboardEvent) => {
      const key = keyName(event.key);
      if ((key !== ' ' && key !== 'Enter') || !keyPulled.current) return;
      // A key let go is never a repeat; otherwise it is the machine's as its press was (a KeyboardEvent's fields are
      // getters, so they are named one by one).
      if (!forTheMachine({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, isComposing: event.isComposing, target: event.target })) return;
      keyPulled.current = false;
      event.preventDefault();
      release();
    };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  }, [active, release]);

  // ── The plunger's own presses: a finger or the mouse holds it and lets it go; Space or Enter on it does the same ──
  const onPlungerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (!pull()) return;
    pointerDown.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still lets go over the plunger, as a finger does.
    }
  };
  const onPlungerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerDown.current !== event.pointerId) return;
    pointerDown.current = null;
    release();
  };
  // A finger that slides away and is taken by the page (a scroll) lets the plunger go without a shot.
  const onPlungerCancel = () => {
    if (pointerDown.current === null) return;
    letGo();
  };
  const onPlungerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat && pull()) keyPulled.current = true;
  };
  const onPlungerKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!keyPulled.current) return;
    keyPulled.current = false;
    release();
  };

  // ── What is on the screen ──
  const odds = PUBLISHED_SMART_BALL_ODDS;
  const running = phase !== 'idle';
  // The same list while the same holes are lit: the board is drawn again only when what it lights changes.
  const shownLines = useMemo(() => linesOf(shownLit), [shownLit]);
  const statusText = (() => {
    if (running) {
      if (phase === 'load' && marble === 0) return t.status.loading;
      if (pulled) return t.status.pulling(pullWindow ?? -1);
      if (moment?.kind === 'weak') return t.status.weak;
      if (phase === 'fly') return t.status.flying;
      // What the last marble did, before the next one's prompt (or alone while the next rolls onto the plunger).
      const what = moment?.kind === 'bingo' ? t.status.bingo(moment.lines) : moment?.kind === 'hole' ? t.status.hole(moment.hole) : moment?.kind === 'out' ? t.status.out : null;
      if (phase === 'load') return what ?? t.status.ready(marble);
      return what ? t.status.then(what, t.status.ready(marble)) : t.status.ready(marble);
    }
    if (outOfMedals) return t.outOfMedals;
    if (shortOf) return t.tooFew(bankState.balance);
    if (outcome) return t.outcome(outcome.play).status;
    return known && stats.plays > 0 ? t.status.again : t.status.first;
  })();
  const litCount = (shownLit.toString(2).match(/1/g) ?? []).length;
  const where = phase === 'aim' ? t.whereReady(marble, litCount) : running ? t.whereMoving : t.whereIdle;
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const won = !running && outcome !== null && !outcome.earlier && outcome.play.won > 0;
  const result = outcome ? `lines-${Math.min(3, outcome.play.lines.length)}` : '';
  /** The badge over a play from before: one this page finished, or one simply shown again. */
  const badge = resumed ? t.resumed : outcome?.earlier && !running ? t.lastPlay : null;

  return (
    <div
      className={styles.machine}
      data-testid="smb-machine"
      data-playable={canStart ? 'true' : 'false'}
      data-card={bankState.card}
      data-phase={phase}
      data-marble={running ? marble : ''}
      data-round={roundId ?? outcome?.id ?? ''}
      data-won={outcome?.play.won ?? ''}
      data-result={running ? '' : result}
      data-lit={shownLit}
      onPointerDown={() => {
        setAttract(false);
        setTouched((n) => n + 1);
      }}
    >
      <div className={styles.cabinet}>
        <div className={styles.sign} aria-hidden="true">
          <span className={styles.signSteam} />
          <span className={styles.signMain}>{t.sign}</span>
          <span className={styles.signSub} lang={language}>
            {t.signSub}
          </span>
        </div>

        <div className={styles.playArea} ref={boardRef}>
          <div className={styles.boardBox} ref={boardEl} data-testid="smb-board" data-window="" data-attract={attract && !running ? 'true' : 'false'}>
            <Board t={t} label={t.boardLabel(where)} parts={parts} lit={shownLit} lines={shownLines} plate={Math.min(3, shownLines.length)} />
            <ChaseLamps />
            {(resumed || (outcome?.earlier && !running)) && (
              <span className={styles.resumedBadge} data-testid="smb-resumed">
                {resumed ? t.resumed : t.lastPlay}
              </span>
            )}
            <span className={styles.perPlay} aria-hidden="true">
              {t.perPlay}
            </span>
            {flash && (
              <span key={flash.key} className={styles.flash} data-testid="smb-flash" data-lines={flash.lines} aria-hidden="true">
                {t.flash(flash.lines)}
              </span>
            )}
          </div>

          {/* On a phone held sideways the badge stands beside the board, over the status line, where it covers none of the
              rail's lamps (SmartBall.module.css); its place is kept while there is none, so that nothing moves. */}
          <span className={styles.sideBadge} data-testid="smb-resumed-side" data-shown={badge ? 'true' : 'false'}>
            {badge ?? t.lastPlay}
          </span>

          <p className={styles.status} data-testid="smb-status">
            <span>
              <Phrases text={statusText} />
            </span>
          </p>

          {/* START, Skip and the plunger: always in the same place, so nothing moves as a play goes on. The plunger is at
              the right, under the lane, where it is on the table. */}
          <div className={styles.controls}>
            <button type="button" className={styles.startButton} data-testid="smb-start" aria-label={t.startAria} onClick={() => start()} disabled={!canStart || bankState.balance < STAKE}>
              <span className={styles.startWords}>{t.start}</span>
            </button>
            {/* Skip only fast-forwards: it is there from the start, so that nothing moves, and can be pressed once the last
                marble has been shot. It says why it waits. */}
            <button type="button" className={styles.skipButton} data-testid="smb-skip" onClick={skip} disabled={!skippable} aria-describedby="smb-skip-why" title={skippable ? undefined : t.skipWhy}>
              {t.skip}
            </button>
            <span id="smb-skip-why" className={styles.srOnly}>
              {t.skipWhy}
            </span>
            <button
              type="button"
              className={styles.plungerButton}
              data-testid="smb-plunger"
              data-pulled={pulled ? 'true' : 'false'}
              data-ready={phase === 'aim' ? 'true' : 'false'}
              aria-label={t.plungerAria}
              aria-disabled={phase !== 'aim'}
              onPointerDown={onPlungerDown}
              onPointerUp={onPlungerUp}
              onPointerCancel={onPlungerCancel}
              onLostPointerCapture={onPlungerCancel}
              onKeyDown={onPlungerKeyDown}
              onKeyUp={onPlungerKeyUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.gauge} ref={gaugeRef} data-level="-2" aria-hidden="true">
                {Array.from({ length: WINDOWS }, (_, w) => (
                  <span key={w} className={styles.gaugeStep} data-step={w} />
                ))}
              </span>
              <span className={styles.plungerSlot} aria-hidden="true">
                <span className={styles.plungerKnob} ref={knobRef} />
              </span>
              <span className={styles.plungerWords}>{t.plunger}</span>
            </button>
          </div>
        </div>

        {/* The medals, the marbles left and the last win, on LED counters as a medal machine shows them. The numbers are in
            type beside them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="smb-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="smb-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.balls}</span>
            <span className={styles.meterValue} data-testid="smb-balls">
              {ballsLeft}
            </span>
            <span className={styles.led} aria-hidden="true">
              <SegmentDisplay value={ballsLeft} places={BALL_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="smb-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="smb-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="smb-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="smb-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="smb-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="smb-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="smb-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="smb-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="smb-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="smb-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="smb-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="smb-history-title">
          <h2 id="smb-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="smb-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.play.won > 0 ? 'true' : 'false'} data-lines={Math.min(3, entry.play.lines.length)} title={t.historyEntryLabel(entry.play)}>
                  {t.historyEntry(entry.play)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="smb-session-title">
          <h2 id="smb-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.plays}</dt>
              <dd data-testid="smb-stat-plays">{fmt(stats.plays)}</dd>
            </div>
            <div>
              <dt>{t.played}</dt>
              <dd>{fmt(stats.played)}</dd>
            </div>
            <div>
              <dt>{t.won}</dt>
              <dd>{fmt(stats.won)}</dd>
            </div>
            <div>
              <dt>{t.net}</dt>
              <dd className={net >= 0 ? styles.pos : styles.neg}>
                {net > 0 ? '+' : ''}
                {fmt(net)}
              </dd>
            </div>
            <div>
              <dt>{t.holesLit}</dt>
              <dd>{fmt(stats.holes)}</dd>
            </div>
            <div>
              <dt>{t.bingos}</dt>
              <dd>{fmt(stats.bingos)}</dd>
            </div>
            <div>
              <dt>{t.cameBack}</dt>
              <dd>{observed === null ? '—' : pct(observed)}</dd>
            </div>
            <div>
              <dt>{t.perfectBack}</dt>
              <dd>{pct(valueOf(odds.perfect.back), 2)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="smb-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
