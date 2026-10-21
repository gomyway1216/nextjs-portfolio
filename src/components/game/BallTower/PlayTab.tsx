'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound, type MachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { BETS, CHANCE_LEVEL, JACKPOT, LEVELS, drawRun, isBet, valueOf, type Bet, type Run, type Stop } from './engine';
import { getStrings } from './i18n';
import { BALL_TOWER_GAME, createTable, runId, runOfRecord, wonOfRecord, type Staked, type Table } from './medalTable';
import { PUBLISHED_BALL_TOWER_ODDS } from './published';
import { BALL_HOME, BOARD_W, FIRST_ANGLES, ballAt, createMachineClock, discAngle, lampAt, levelAt, runScene, settledAt, turning, type Cue, type Timeline } from './scene';
import { paintFrame, paintStill, spritesFor, type Frame, type Sprites } from './draw';
import styles from './BallTower.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the jackpot and a win (up to 3,000). */
export const MEDAL_PLACES = 7;
export const JACKPOT_PLACES = 4;
export const WIN_PLACES = 4;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
const HISTORY_LIMIT = 16;
/** How long the flash over the tower says a run ended well, in ms. */
const FLASH_MS = 1_600;
/** How long a jackpot's fireworks burst over the tower, in ms. */
export const FIREWORKS_MS = 3_300;
/** The bet a visit starts on. */
export const FIRST_BET: Bet = 1;

/** This device's storage for the machine: the run, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a run's name, from the browser's crypto: Math.random is the draw's alone. */
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

/** `lift`: the ball is on its way up the lift; `run`: it is coming down the discs (or at rest, waiting for the card back). */
type Phase = 'idle' | 'lift' | 'run';

/** A run on this page: its stake, its timeline, when it began by the machine's clock, the next cue to act on. */
interface Flight {
  staked: Staked;
  timeline: Timeline;
  startAt: number;
  next: number;
  /** The ball has come to rest, but the card was away: the run is paid when it is back. */
  landed: boolean;
  /** Skipped: the cues still to come are acted on without their sounds. */
  quiet: boolean;
}

/** What the tower shows: the last run's timeline, from when (by the machine's clock). */
interface Scene {
  timeline: Timeline;
  startAt: number;
  run: Run;
}

/** A run that has ended, as the machine shows it. */
interface Ended {
  id: string;
  run: Run;
  bet: Bet;
  won: number;
  /** The last run from before this page opened, or one finished from before. */
  earlier: boolean;
}

interface SessionStats {
  runs: number;
  played: number;
  won: number;
  chances: number;
  jackpots: number;
}
const EMPTY_STATS: SessionStats = { runs: 0, played: 0, won: 0, chances: 0, jackpots: 0 };

/** What the status line says while a ball is in play. */
type Moment = { kind: 'lift' } | { kind: 'disc'; level: number } | { kind: 'settled'; stop: Stop } | { kind: 'lamp'; stop: Stop } | null;

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

/** The sound a pocket makes as the ball settles in it. */
const settleSound = (stop: Stop): MachineSound => (stop.kind === 'up' ? (stop.level >= 2 ? 'reach' : 'rung') : stop.kind === 'mystery' ? 'bonus' : stop.kind === 'jackpot' ? 'fanfare' : stop.kind === 'out' ? 'clack' : 'pocket');

/**
 * Brings the tower, the status line and START wholly on screen, under the site's toolbar, as a run starts: a player who
 * scrolled down to START sees the whole tower as the ball comes down. Moved on the next frame, after the press has been
 * drawn (a smooth scroll begun in the press itself was dropped by the browser: MedalCenter/lookUp.ts). Where they are on
 * screen already, nothing moves.
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

/** The angles the discs stand at in a scene `ms` into it. */
const anglesIn = (scene: Scene | null, ms: number): number[] => (scene ? Array.from({ length: LEVELS }, (_, level) => discAngle(scene.timeline, level, ms)) : [...FIRST_ANGLES]);

/** The frame a scene shows `ms` into it (the tower at rest before any run). */
function frameOf(scene: Scene | null, ms: number): Frame {
  if (!scene) return { angles: [...FIRST_ANGLES], ball: BALL_HOME, level: -1, blink: true, lit: null, roulette: null, fireworks: null };
  const { timeline, run } = scene;
  const settled = settledAt(timeline, ms);
  const over = ms >= timeline.end;
  const glow = over ? 1 : 0.5 + 0.5 * Math.cos(ms / 90);
  const level = levelAt(timeline, ms);
  return {
    angles: anglesIn(scene, ms),
    ball: ballAt(timeline, ms),
    level,
    blink: over || Math.floor(ms / 260) % 2 === 0,
    lit: settled ? { level: settled.level, pocket: settled.pocket, glow } : null,
    roulette: lampAt(timeline, ms),
    fireworks: run.jackpot && !timeline.calm && over && ms - timeline.end < FIREWORKS_MS ? ms - timeline.end : null,
  };
}

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the tower, its jackpot counter and meters, the bet buttons, START and Skip. What happens to the medals is
 * the table's (medalTable.ts); this draws each run the moment START is pressed, plays it out on the tower as its
 * timeline says (scene.ts, painted by draw.ts), and shows how each run ended.
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
  const [level, setLevel] = useState(-1);
  const [bet, setBet] = useState<Bet>(FIRST_BET);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [moment, setMoment] = useState<Moment>(null);
  const [flash, setFlash] = useState<{ key: number; text: string; jackpot: boolean } | null>(null);
  const [known, setKnown] = useState(false);
  const [outcome, setOutcome] = useState<Ended | null>(null);
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [resumed, setResumed] = useState(false);
  // Skip only fast-forwards: it can be pressed once the ball is at the top of the tower.
  const [skippable, setSkippable] = useState(false);
  // The clock a run plays on, stopped while the machine is not on show.
  const [clock] = useState(() => createMachineClock(() => performance.now()));

  const flightRef = useRef<Flight | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const playAreaRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stillRef = useRef<HTMLCanvasElement | null>(null);
  const spritesRef = useRef<Sprites | null>(null);
  // While START writes its run down and takes the medals: the medals moving then are this press's own, not a run to take up.
  const staking = useRef(false);
  const betRef = useRef<Bet>(FIRST_BET);
  /** Sets the frame loop going again, where it has stopped because nothing on the tower moved (it stops itself again then). */
  const wake = useRef<(() => void) | null>(null);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const winShown = phase === 'idle' ? (outcome?.won ?? 0) : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;

  const canStart = mine && here && phase === 'idle';
  // Brought up to date as START is drawn (a layout effect), not after the paint: the press reads it, and a press made
  // the moment START is drawn enabled was otherwise turned away by the old value.
  const canStartRef = useRef(canStart);
  useLayoutEffect(() => {
    canStartRef.current = canStart;
  }, [canStart]);

  /** The milliseconds into the scene shown now. */
  const sceneMs = useCallback((): number => {
    const scene = sceneRef.current;
    return scene ? clock.now() - scene.startAt : 0;
  }, [clock]);

  /** Shows `run` at its end, still: the discs where they stand, the ball in its last pocket, its lamps lit. */
  const showEnd = useCallback(
    (run: Run) => {
      const angles = anglesIn(sceneRef.current, sceneMs());
      const timeline = runScene(run, angles, true);
      sceneRef.current = { timeline, startAt: Number.NEGATIVE_INFINITY, run };
      wake.current?.();
    },
    [sceneMs],
  );

  /** The run has ended on this page (or was found ended): settled if it was not already, and shown. */
  const finish = useCallback(
    (flight: Flight, how: 'played' | 'away' | 'resumed' | 'shown') => {
      const { staked } = flight;
      const before = staked.paid;
      const away = how === 'away' || how === 'resumed';
      const settled = staked.paid ? 'already' : (table.current?.settle(staked, away) ?? 'later');
      if (settled === 'later') {
        // Not this page's to finish now (the medals are elsewhere): the ball stays where it came to rest, the run on
        // record, and it is paid when the card is back (or by the page that next holds it).
        flight.landed = true;
        return;
      }
      if (flightRef.current === flight) flightRef.current = null;
      setSkippable(false);
      setMoment(null);
      // Known as shown before it is paid: the medals moving as it is paid wake the machine's look at the run.
      shownLast.current = staked.record.id;
      if (settled === 'void' || staked.void) {
        sceneRef.current = null;
        setPhase('idle');
        setLevel(-1);
        setRoundId(null);
        wake.current?.();
        return;
      }
      const run = runOfRecord(staked.record);
      const won = wonOfRecord(staked.record);
      const scene = sceneRef.current;
      if (how !== 'played') {
        // Not seen to its end here: the tower shows where the ball came to rest.
        if (scene && scene.timeline === flight.timeline) scene.startAt = Math.min(scene.startAt, clock.now() - flight.timeline.end);
        else showEnd(run);
      }
      if (won > 0 && (settled === 'paid' || before)) {
        payMedals();
        payWin();
      }
      const entry: Ended = { id: staked.record.id, run, bet: staked.record.bet, won, earlier: how === 'resumed' };
      setOutcome(entry);
      setHistory((list) => [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT));
      if (how !== 'resumed') {
        const chance = run.stops.length > CHANCE_LEVEL;
        setStats((s) => ({ runs: s.runs + 1, played: s.played + staked.record.bet, won: s.won + won, chances: s.chances + (chance ? 1 : 0), jackpots: s.jackpots + (run.jackpot ? 1 : 0) }));
      }
      if (how === 'played' || how === 'shown') {
        if (run.jackpot) {
          play('burst');
          play('big');
        } else if (won > 0) play(run.pays >= 10 ? 'big' : 'win');
      }
      if (how === 'played' && (run.jackpot || run.pays >= 10)) setFlash((was) => ({ key: (was?.key ?? 0) + 1, text: live.current.t.flash(run), jackpot: run.jackpot }));
      setResumed(how === 'resumed');
      if (away || staked.record.away) setMessage(live.current.t.finishedAway(won));
      setLevel(run.stops.length - 1);
      setPhase('idle');
      setAnnouncement(live.current.t.outcome(run, staked.record.bet).say);
      wake.current?.();
    },
    [clock, payMedals, payWin, play, showEnd],
  );

  /** A cue of the run as its moment comes: what the tower says, shows and sounds as the ball goes up, lands, settles. */
  const onCue = useCallback(
    (flight: Flight, cue: Cue) => {
      const words = live.current.t;
      const say = (sound: MachineSound) => {
        if (!flight.quiet) play(sound);
      };
      const stop = flight.timeline.stops.find((s) => s.level === cue.level);
      const bet = flight.staked.record.bet;
      switch (cue.cue) {
        case 'launch':
          say('lift');
          break;
        case 'top':
          setPhase('run');
          setSkippable(true);
          say('clack');
          if (!flight.quiet) setAnnouncement(words.sayTop);
          break;
        case 'land':
          setLevel(cue.level);
          setMoment({ kind: 'disc', level: cue.level });
          say('drop');
          break;
        case 'pocket':
          if (!stop) break;
          setMoment({ kind: 'settled', stop });
          say(settleSound(stop));
          if (!flight.quiet) setAnnouncement(words.saySettled(stop, bet));
          break;
        case 'lamp':
          if (!stop) break;
          setMoment({ kind: 'lamp', stop });
          say('rung');
          break;
        case 'end':
          finish(flight, 'played');
          break;
      }
    },
    [finish, play],
  );

  /** START: the run is drawn here, in the press, written down, and the medals taken. */
  const start = () => {
    if (flightRef.current || !canStartRef.current) return;
    const stakeOf = betRef.current;
    const drawn = drawRun(Math.random);
    staking.current = true;
    let staked: ReturnType<Table['stake']>;
    try {
      staked = table.current?.stake(stakeOf, drawn) ?? { kind: 'away' };
    } finally {
      staking.current = false;
    }
    if (staked.kind !== 'staked') {
      const words = live.current.t;
      if (staked.kind === 'short') setMessage(words.notEnough(stakeOf));
      else if (staked.kind === 'unsaved') setMessage(words.unsaved);
      else if (staked.kind === 'unfinished') {
        setMessage(words.unfinished);
        syncNow.current?.();
      }
      return;
    }
    const now = clock.now();
    const angles = anglesIn(sceneRef.current, sceneRef.current ? now - sceneRef.current.startAt : 0);
    const run = runOfRecord(staked.staked.record);
    const timeline = runScene(run, angles, live.current.calm);
    const flight: Flight = { staked: staked.staked, timeline, startAt: now, next: 0, landed: false, quiet: false };
    flightRef.current = flight;
    sceneRef.current = { timeline, startAt: now, run };
    setMessage('');
    setResumed(false);
    setOutcome(null);
    setFlash(null);
    setSkippable(false);
    setLevel(-1);
    setMoment({ kind: 'lift' });
    setPhase('lift');
    setRoundId(staked.staked.record.id);
    play('medal');
    setAnnouncement(live.current.t.sayStart(stakeOf));
    bringIntoView(playAreaRef.current);
    wake.current?.();
  };

  /** Skip: once the ball is at the top of the tower, it goes straight to the pocket it ends in. Before that it does nothing. */
  const skip = useCallback(() => {
    const flight = flightRef.current;
    if (!flight || flight.landed) return;
    const now = clock.now();
    if (now - flight.startAt < flight.timeline.skipFrom) return;
    flight.quiet = true;
    flight.startAt = Math.min(flight.startAt, now - flight.timeline.end);
    const scene = sceneRef.current;
    if (scene && scene.timeline === flight.timeline) scene.startAt = flight.startAt;
    wake.current?.();
  }, [clock]);

  const chooseBet = useCallback(
    (next: Bet) => {
      if (flightRef.current || !isBet(next)) return;
      betRef.current = next;
      setBet(next);
      setMessage('');
      play('button');
      setAnnouncement(live.current.t.sayBet(next));
    },
    [play],
  );

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback((said: boolean) => {
    const flight = flightRef.current;
    if (flight) flight.staked.void = true;
    flightRef.current = null;
    sceneRef.current = null;
    wake.current?.();
    table.current?.clear();
    shownLast.current = null;
    setPhase('idle');
    setLevel(-1);
    setRoundId(null);
    setOutcome(null);
    setHistory([]);
    setStats(EMPTY_STATS);
    setMessage('');
    setMoment(null);
    setResumed(false);
    setSkippable(false);
    medalBank().restarted(BALL_TOWER_GAME);
    if (said) setAnnouncement(live.current.t.sayRestart);
  }, []);

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes with the page (hidden, left or reloaded), a run under way is finished at once, as it
  // was drawn, so that its winnings are in before the page is gone, and the page says so when it is shown again. A
  // moment's loan of the card (the medal center's front in another tab taking the day's bonus, a floor jackpot paid in
  // there, another tab's machine starting) leaves the run as it is: the card comes straight back and the ball comes
  // down as it was, or the run waits on record, and a page of this machine that holds the card first finishes it.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => runId(Date.now(), nameRandom),
    });
    const finishNow = (why: 'moment' | 'hidden' | 'left') => {
      if (why === 'moment') return;
      const flight = flightRef.current;
      if (flight && !flight.staked.void) finish(flight, 'away');
    };
    const placed = purse.sit(BALL_TOWER_GAME, { granted: () => undefined, yielding: finishNow });
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
          if (purse.restartDue(BALL_TOWER_GAME)) startOver(false);
          if (staking.current) break;
          const flight = flightRef.current;
          if (flight) {
            // The ball came to rest while the card was away: paid now it is back.
            if (flight.landed) {
              finish(flight, 'played');
              break;
            }
            // The run under way, finished by another page of this machine while this one lent it the card (or another run
            // on record in its place): shown as finished there.
            const there = tab.last();
            if (!flight.staked.paid && there && (there.id !== flight.staked.record.id || there.paid)) finish(flight, 'shown');
            break;
          }
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            const timeline = runScene(runOfRecord(left), anglesIn(sceneRef.current, 0), true);
            finish({ staked: { record: left, stored: true, paid: false, void: false }, timeline, startAt: 0, next: timeline.cues.length, landed: false, quiet: true }, 'resumed');
            setKnown(true);
            break;
          }
          const record = tab.last();
          setKnown(true);
          if (record && record.paid && shownLast.current !== record.id) {
            shownLast.current = record.id;
            const run = runOfRecord(record);
            const ended: Ended = { id: record.id, run, bet: record.bet, won: wonOfRecord(record), earlier: true };
            if (isBet(record.bet)) {
              betRef.current = record.bet;
              setBet(record.bet);
            }
            showEnd(run);
            setLevel(run.stops.length - 1);
            setOutcome(ended);
            setHistory((before) => (before.some((entry) => entry.id === ended.id) ? before : [ended, ...before].slice(0, HISTORY_LIMIT)));
            // Finished by the page that went (reloaded, closed or hidden mid-run), or by the next page: said here.
            if (record.away) {
              setResumed(true);
              setMessage(live.current.t.finishedAway(ended.won));
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
  }, [finish, showEnd, startOver]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // A run that has ended: whatever the medals heard of while the ball came down (another tab, a reset) is looked at now.
  useEffect(() => {
    if (phase === 'idle' && mine && here) syncNow.current?.();
  }, [phase, mine, here]);

  // The flash over the tower goes out after a moment.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // ── The canvases: as many pixels as they are shown at (two to a CSS pixel at most). The still parts (the night, the
  //    glass, the lift) are painted on the lower one once a size; each frame paints only what moves, on the upper one ──
  useEffect(() => {
    const box = boardRef.current;
    const canvas = canvasRef.current;
    const still = stillRef.current;
    if (!box || !canvas || !still) return;
    const size = () => {
      const shown = canvas.getBoundingClientRect().width;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(shown * ratio));
      if (canvas.width === width && spritesRef.current) return;
      const height = Math.max(1, Math.round((width * 520) / 360));
      for (const layer of [still, canvas]) {
        layer.width = width;
        layer.height = height;
      }
      const sprites = spritesFor(width / BOARD_W);
      spritesRef.current = sprites;
      const ctx = still.getContext('2d');
      if (ctx) paintStill(ctx, sprites);
      wake.current?.();
    };
    size();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
    observer?.observe(box);
    return () => observer?.disconnect();
  }, []);

  // ── The frame loop: the discs, the ball and the lamps, painted on the canvas ──
  // It runs only while something moves: a ball in play, the discs coming to rest after a run, a jackpot's fireworks. A
  // machine standing unplayed, or one whose clock is stopped (its Odds tab or its help in front), asks the browser for
  // no frames at all; whatever sets something moving wakes it.
  useEffect(() => {
    let frame = 0;
    let running = false;
    /** Woken while it ran: one more frame, to show what changed. */
    let again = false;
    const step = () => {
      again = false;
      const paused = clock.paused();
      const flight = flightRef.current;
      if (flight && !paused && !flight.landed) {
        const ms = clock.now() - flight.startAt;
        const cues = flight.timeline.cues;
        while (flight.next < cues.length && cues[flight.next].at <= ms) {
          const cue = cues[flight.next];
          flight.next += 1;
          onCue(flight, cue);
          if (flightRef.current !== flight || flight.landed) break;
        }
      }
      const scene = sceneRef.current;
      const ms = scene ? clock.now() - scene.startAt : 0;
      const canvas = canvasRef.current;
      const sprites = spritesRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && sprites) paintFrame(ctx, sprites, frameOf(scene, ms));
      const live = flightRef.current;
      const moving = !paused && scene !== null && ((live !== null && !live.landed) || turning(scene.timeline, ms) || (scene.run.jackpot && !scene.timeline.calm && ms - scene.timeline.end < FIREWORKS_MS) || ms < scene.timeline.end);
      if (again || moving) frame = window.requestAnimationFrame(step);
      else running = false;
    };
    const run = () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      frame = window.requestAnimationFrame(step);
    };
    wake.current = run;
    run();
    return () => {
      if (wake.current === run) wake.current = null;
      running = false;
      window.cancelAnimationFrame(frame);
    };
  }, [clock, onCue]);

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
  // Medals that cannot cover the bet: START is off, and the machine says why. A few medals left are not none, so no
  // refill is given for them: a smaller bet plays them.
  const shortOf = mine && here && phase === 'idle' && bankState.balance > 0 && bankState.balance < bet;

  // While the machine is not on show (its Odds tab, or its help, is in front of it), its clock stops: the ball and the
  // discs wait, and go on from the same point when it is shown again.
  useEffect(() => {
    if (active) {
      clock.resume();
      wake.current?.();
    } else clock.pause();
  }, [active, clock]);

  // On a desktop: Space or Enter starts a run; ← and → change the bet; S skips once the ball is at the top.
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') start();
    else if (key === 's') skip();
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const at = BETS.indexOf(betRef.current);
      const next = BETS[Math.min(BETS.length - 1, Math.max(0, at + (key === 'ArrowRight' ? 1 : -1)))];
      if (next !== betRef.current) chooseBet(next);
    } else return false;
    return true;
  });

  // ── What is on the screen ──
  const odds = PUBLISHED_BALL_TOWER_ODDS;
  const running = phase !== 'idle';
  const statusText = (() => {
    if (running && moment) {
      if (moment.kind === 'lift') return t.status.lift;
      if (moment.kind === 'disc') return t.status.disc(moment.level);
      if (moment.kind === 'settled') return t.status.settled(moment.stop, bet);
      return t.status.lamp(moment.stop.pays, bet);
    }
    if (running) return t.status.lift;
    if (outOfMedals) return t.outOfMedals;
    if (shortOf) return t.tooFew(bankState.balance);
    if (outcome) return t.outcome(outcome.run, outcome.bet).status;
    return known && stats.runs > 0 ? t.status.again : t.status.first;
  })();
  const where = phase === 'lift' ? t.whereLift : running ? t.whereDisc(Math.max(0, level)) : outcome ? t.whereRest(outcome.run.stops.length - 1) : t.whereIdle;
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const won = !running && outcome !== null && !outcome.earlier && outcome.won > 0;
  const result = outcome && !running ? (outcome.run.jackpot ? 'jackpot' : outcome.won > 0 ? 'pay' : 'out') : '';
  /** The badge over a run from before: one this page finished, or one simply shown again. */
  const badge = resumed ? t.resumed : outcome?.earlier && !running ? t.lastRun : null;

  return (
    <div
      className={styles.machine}
      data-testid="bt-machine"
      data-playable={canStart ? 'true' : 'false'}
      data-card={bankState.card}
      data-phase={phase}
      data-level={level < 0 ? '' : level}
      data-bet={bet}
      data-round={roundId ?? outcome?.id ?? ''}
      data-won={outcome?.won ?? ''}
      data-result={result}
      data-skippable={skippable ? 'true' : 'false'}
    >
      <div className={styles.cabinet} data-chase={running ? 'fast' : outcome?.run.jackpot && !outcome.earlier ? 'jackpot' : 'slow'}>
        <span className={`${styles.bulbs} ${styles.bulbsLeft}`} aria-hidden="true">
          <span className={styles.bulbsOn} />
          <span className={`${styles.bulbsOn} ${styles.bulbsOdd}`} />
        </span>
        <span className={`${styles.bulbs} ${styles.bulbsRight}`} aria-hidden="true">
          <span className={styles.bulbsOn} />
          <span className={`${styles.bulbsOn} ${styles.bulbsOdd}`} />
        </span>

        {/* The marquee over the cabinet, and the jackpot counter under it: the jackpot for the bet picked. */}
        <div className={styles.marquee}>
          <span className={styles.marqueeSub} lang={language === 'ja' ? 'ja' : 'en'}>
            {t.marqueeSub}
          </span>
          <span className={styles.marqueeMain} lang="en">
            {t.marquee}
          </span>
        </div>
        <div className={styles.jackpot}>
          <span className={styles.jackpotLabel}>{t.jackpotLabel}</span>
          <span className={styles.srOnly} data-testid="bt-jackpot" data-amount={JACKPOT * bet}>
            {fmt(JACKPOT * bet)}
          </span>
          <span className={styles.led} aria-hidden="true">
            <SegmentDisplay value={JACKPOT * bet} places={JACKPOT_PLACES} tone="amber" />
          </span>
          <span className={styles.jackpotNote}>{t.jackpotNote(bet)}</span>
        </div>

        <div className={styles.playArea} ref={playAreaRef}>
          <div className={styles.boardBox} ref={boardRef} data-testid="bt-board">
            <div className={styles.canvasStack}>
              <canvas ref={stillRef} className={styles.canvas} data-testid="bt-still" aria-hidden="true" width={360} height={520} />
              <canvas ref={canvasRef} className={`${styles.canvas} ${styles.canvasTop}`} data-testid="bt-canvas" role="img" aria-label={t.boardLabel(where)} width={360} height={520} />
            </div>
            {badge && (
              <span className={styles.resumedBadge} data-testid="bt-resumed">
                {badge}
              </span>
            )}
            {flash && (
              <span key={flash.key} className={styles.flash} data-testid="bt-flash" data-jackpot={flash.jackpot ? 'true' : 'false'} aria-hidden="true">
                {flash.text}
              </span>
            )}
          </div>

          {/* On a phone held sideways the badge stands beside the tower, over the status line (BallTower.module.css); its
              place is kept while there is none, so that nothing moves. */}
          <span className={styles.sideBadge} data-testid="bt-resumed-side" data-shown={badge ? 'true' : 'false'}>
            {badge ?? t.lastRun}
          </span>

          <p className={styles.status} data-testid="bt-status">
            <span>
              <Phrases text={statusText} />
            </span>
          </p>

          {/* The seat's bet buttons: the medals a ball takes. */}
          <div className={styles.bets} role="group" aria-label={t.betsLabel}>
            <span className={styles.betsWord} aria-hidden="true">
              {t.betLabel}
            </span>
            {BETS.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.betButton}
                data-testid={`bt-bet-${value}`}
                aria-pressed={bet === value}
                aria-label={t.betAria(value)}
                disabled={running}
                onClick={() => chooseBet(value)}
              >
                {value}
              </button>
            ))}
          </div>

          {/* START and Skip: always in the same place, so nothing moves as a run goes on. */}
          <div className={styles.controls}>
            <button type="button" className={styles.startButton} data-testid="bt-start" aria-label={t.startAria(bet)} onClick={() => start()} disabled={!canStart || bankState.balance < bet}>
              <span className={styles.startWords}>{t.start}</span>
            </button>
            {/* Skip only fast-forwards: it is there from the start, so that nothing moves, and can be pressed once the ball
                is at the top of the tower. It says why it waits. */}
            <button type="button" className={styles.skipButton} data-testid="bt-skip" onClick={skip} disabled={!skippable} aria-describedby="bt-skip-why" title={skippable ? undefined : t.skipWhy}>
              {t.skip}
            </button>
            <span id="bt-skip-why" className={styles.srOnly}>
              {t.skipWhy}
            </span>
          </div>
        </div>

        {/* The medals, the bet and the last win, on LED counters as a medal machine shows them. The numbers are in type
            beside them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="bt-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="bt-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.betLabel}</span>
            <span className={styles.meterValue} data-testid="bt-bet-shown">
              {bet}
            </span>
            <span className={styles.led} aria-hidden="true">
              <SegmentDisplay value={bet} places={2} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="bt-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="bt-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="bt-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="bt-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="bt-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="bt-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="bt-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="bt-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="bt-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="bt-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="bt-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="bt-history-title">
          <h2 id="bt-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="bt-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.won > 0 ? 'true' : 'false'} data-jackpot={entry.run.jackpot ? 'true' : 'false'} title={t.historyEntryLabel(entry.run, entry.bet)}>
                  {t.historyEntry(entry.run, entry.bet)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="bt-session-title">
          <h2 id="bt-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.runs}</dt>
              <dd data-testid="bt-stat-runs">{fmt(stats.runs)}</dd>
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
              <dt>{t.chances}</dt>
              <dd>{fmt(stats.chances)}</dd>
            </div>
            <div>
              <dt>{t.jackpots}</dt>
              <dd>{fmt(stats.jackpots)}</dd>
            </div>
            <div>
              <dt>{t.cameBack}</dt>
              <dd>{observed === null ? '—' : pct(observed)}</dd>
            </div>
            <div>
              <dt>{t.everyBetBack}</dt>
              <dd>{pct(valueOf(odds.back), 2)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="bt-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
