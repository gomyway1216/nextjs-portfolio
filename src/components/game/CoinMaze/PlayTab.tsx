'use client';

import { Fragment, createRef, useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { lookUp, type Glance } from '../MedalCenter/lookUp';
import { forTheMachine, keyName, useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound, type MachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { GATE_PATTERNS, LIMIT_WINDOWS, OPENING, STAGES, STAKE, TIMEOUT, WINDOWS, WINDOW_MS, analyze, drawPlay, endOf, gateOf, passed, slotOf, valueOf, windowAt, type GateKind, type Play, type StageEnd } from './engine';
import { getStrings } from './i18n';
import { Maze, type MazeParts } from './Maze';
import { COIN_MAZE_GAME, createTable, playId, playOfRecord, type PlayRecord, type Staked, type Table } from './medalTable';
import { CONTACT_MS, CUPS, GATE_FOOT, GATE_X, cuesOf, cupPose, dropTrack, flickTrack, gateAngle, gateLook, pinsTrack, poseAt, restingPose, type Cue, type CueSound, type Pose, type Track } from './scene';
import styles from './CoinMaze.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), and a win (5). */
export const MEDAL_PLACES = 7;
export const WIN_PLACES = 2;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** How long the machine stands unplayed before its gates swing on their own, in ms. */
export const ATTRACT_AFTER = 12_000;
const HISTORY_LIMIT = 16;
/** A click this soon after a flick by the pointer or a key is that same press, and flicks nothing more. */
const SAME_PRESS_MS = 600;

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

type Phase = 'idle' | 'drop' | 'wait' | 'fly' | 'pins';

/** A play on this page: its stake, where the medal is, and the way it is moving now. */
interface Flight {
  staked: Staked;
  /** The gate the medal waits at, or is on its way from. */
  stage: number;
  phase: Phase;
  /** When the medal was dropped in: the gates' clock. */
  dropAt: number;
  /** When the medal came to rest in the cup it waits in: the time limit counts from it. */
  readyAt: number;
  way: Track | null;
  wayAt: number;
  /** The cues of the way still to come. */
  cues: { at: number; cue?: Cue; sound?: CueSound }[];
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
  gates: number;
  wins: number;
}
const EMPTY_STATS: SessionStats = { plays: 0, played: 0, won: 0, gates: 0, wins: 0 };

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

/** How each gate truly stands in each window of its turn, 0 (shut) to 1 (open): what its look follows. */
const levelsOf = (kind: GateKind): number[] => GATE_PATTERNS[kind].map((slot) => OPENING[slot]);
/** The gates' turns while no medal is in the case: each swinging as an even gate does, a little apart. */
const RESTING_LEVELS = levelsOf('mid');

/** The window a flick now would meet the gate the medal waits at in. */
const windowNow = (flight: Flight): number => windowAt(flight.staked.record.draw.phases[flight.stage], performance.now() - flight.dropAt + CONTACT_MS);

const SOUND_OF: Record<CueSound, MachineSound> = { spring: 'spring', roll: 'roll', clack: 'clack', pin: 'pin', pocket: 'pocket', drop: 'drop' };

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the glass case, its counters, DROP, the lever and Skip. What happens to the medals is the table's
 * (medalTable.ts); this draws each play the moment DROP is pressed, moves the medal (scene.ts), turns the lever's
 * presses into flicks, and shows how each play ended.
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
  const [stage, setStage] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [endShown, setEndShown] = useState<StageEnd | null>(null);
  const [pulled, setPulled] = useState(false);
  const [known, setKnown] = useState(false);
  const [outcome, setOutcome] = useState<Ended | null>(null);
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [resumed, setResumed] = useState(false);
  const [attract, setAttract] = useState(false);
  const [touched, setTouched] = useState(0);

  const flightRef = useRef<Flight | null>(null);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const glance = useRef<Glance | null>(null);
  // While DROP writes its play down and takes the medal: the medals moving then are this press's own, not a play to take up.
  const staking = useRef(false);
  const pulledRef = useRef(false);
  const keyPulled = useRef(false);
  const pointerDown = useRef<number | null>(null);
  const lastFlickAt = useRef(-Infinity);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  // The parts of the case the frame loop moves.
  const [parts] = useState<MazeParts>(() => ({
    medal: createRef<SVGGElement>(),
    gates: Array.from({ length: STAGES }, () => createRef<SVGGElement>()),
    strikers: Array.from({ length: STAGES }, () => createRef<SVGGElement>()),
    lamps: Array.from({ length: STAGES }, () => createRef<SVGGElement>()),
  }));
  /** Where the medal rests between plays: in the pocket or hole the last play left it, or nowhere. */
  const restRef = useRef<Pose | null>(null);

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const winShown = phase === 'idle' ? (outcome?.play.won ?? 0) : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;

  const canDrop = mine && here && phase === 'idle';
  const canDropRef = useRef(canDrop);
  useEffect(() => {
    canDropRef.current = canDrop;
  }, [canDrop]);

  /** The play has ended on this page (or was found ended): settled if it was not already, and shown. */
  const finish = useCallback(
    (flight: Flight, how: 'played' | 'skipped' | 'resumed') => {
      if (flightRef.current === flight) flightRef.current = null;
      pulledRef.current = false;
      keyPulled.current = false;
      setPulled(false);
      const { staked } = flight;
      // Known as shown before it is settled: the medals moving as it is paid wake the machine's look at the play.
      shownLast.current = staked.record.id;
      const before = staked.paid;
      const settled = staked.paid ? 'already' : (table.current?.settle(staked) ?? 'later');
      if (settled === 'later') {
        // Not this page's to finish now (the medals are elsewhere): it stays on record, and the page that next holds the
        // card finishes it.
        restRef.current = null;
        setPhase('idle');
        return;
      }
      if (settled === 'void' || staked.void) {
        restRef.current = null;
        setPhase('idle');
        setRoundId(null);
        return;
      }
      const ended = playOfRecord({ ...staked.record, paid: true });
      if (ended.won > 0 && (settled === 'paid' || before)) {
        payMedals();
        payWin();
      }
      restRef.current = restingPose(ended.outAt, ended.bin);
      const entry: Ended = { id: staked.record.id, play: ended, earlier: how === 'resumed' };
      setOutcome(entry);
      setHistory((list) => [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT));
      if (how !== 'resumed') {
        const through = ended.stages.filter((s) => passed(s.end)).length;
        setStats((s) => ({ plays: s.plays + 1, played: s.played + STAKE, won: s.won + ended.won, gates: s.gates + through, wins: s.wins + (ended.won > 0 ? 1 : 0) }));
      }
      if (ended.won > 0) play(ended.pocket === 'big' ? 'big' : 'win');
      setResumed(how === 'resumed');
      setEndShown(null);
      setPhase('idle');
      setAnnouncement(live.current.t.outcome(ended).say);
    },
    [payMedals, payWin, play],
  );

  /** Sets the medal moving along `way`, and what to do once it gets to the end. */
  const go = useCallback((flight: Flight, way: Track, then: () => void) => {
    flight.way = way;
    flight.wayAt = performance.now();
    flight.cues = cuesOf(way);
    flight.then = then;
  }, []);

  /** The medal has come to rest in cup `s`: the gate there is the player's to time. */
  const ready = useCallback((flight: Flight, s: number) => {
    flight.stage = s;
    flight.phase = 'wait';
    flight.way = null;
    flight.readyAt = performance.now();
    setStage(s);
    setPhase('wait');
    setEndShown(null);
    setAnnouncement(live.current.t.sayGate(s));
  }, []);

  /** A flick at the gate the medal waits at, in `window` (or the time running out): written down first, then flown. */
  const commit = useCallback(
    (window: number) => {
      const flight = flightRef.current;
      const tab = table.current;
      if (!flight || flight.phase !== 'wait' || !tab) return;
      const s = flight.stage;
      const kept = tab.flick(flight.staked, s, window);
      if (kept === 'unsaved') {
        setMessage(live.current.t.unsaved);
        // A medal whose time has run out cannot wait on: the play is finished as a skip finishes it.
        if (window === TIMEOUT) finish(flight, 'skipped');
        return;
      }
      if (kept === 'away') return;
      if (kept === 'gone') {
        finish(flight, 'skipped');
        return;
      }
      lastFlickAt.current = performance.now();
      const { end } = endOf(flight.staked.record.draw, s, window);
      flight.phase = 'fly';
      setPhase('fly');
      setEndShown(end);
      const calmNow = live.current.calm;
      go(flight, flickTrack(s, end, calmNow), () => {
        if (!passed(end)) {
          finish(flight, 'played');
          return;
        }
        if (s + 1 < STAGES) {
          ready(flight, s + 1);
          return;
        }
        flight.phase = 'pins';
        setPhase('pins');
        go(flight, pinsTrack(flight.staked.record.draw.pins, live.current.calm), () => finish(flight, 'played'));
      });
    },
    [finish, go, ready],
  );

  const flickNow = useCallback(() => {
    const flight = flightRef.current;
    if (!flight || flight.phase !== 'wait') return;
    commit(windowNow(flight));
  }, [commit]);

  /** The lever pulled back (held): the striker draws back on its spring. */
  const pull = useCallback(() => {
    const flight = flightRef.current;
    if (!flight || flight.phase !== 'wait' || pulledRef.current) return false;
    pulledRef.current = true;
    setPulled(true);
    play('lever');
    return true;
  }, [play]);

  /** The lever let go: the striker snaps forward, and the medal is flicked. */
  const release = useCallback(() => {
    if (!pulledRef.current) return;
    pulledRef.current = false;
    setPulled(false);
    flickNow();
  }, [flickNow]);

  /** DROP: the play is drawn here, in the press, written down, and the medal taken. */
  const drop = (from?: HTMLElement | null) => {
    if (flightRef.current || !canDropRef.current) return;
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
    restRef.current = null;
    const now = performance.now();
    const flight: Flight = { staked: staked.staked, stage: 0, phase: 'drop', dropAt: now, readyAt: now, way: null, wayAt: now, cues: [], then: null };
    flightRef.current = flight;
    setRoundId(staked.staked.record.id);
    setStage(0);
    setPhase('drop');
    setEndShown(null);
    play('medal');
    setAnnouncement(live.current.t.sayDrop);
    glance.current?.drop();
    glance.current = lookUp(boardRef.current, from ?? null);
    go(flight, dropTrack(live.current.calm), () => ready(flight, 0));
  };

  /** Skip: the play ends at once, every lever still to come flicked blind. */
  const skip = useCallback(() => {
    const flight = flightRef.current;
    if (flight) finish(flight, 'skipped');
  }, [finish]);

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback((said: boolean) => {
    const flight = flightRef.current;
    if (flight) flight.staked.void = true;
    flightRef.current = null;
    pulledRef.current = false;
    setPulled(false);
    table.current?.clear();
    shownLast.current = null;
    restRef.current = null;
    setPhase('idle');
    setRoundId(null);
    setOutcome(null);
    setHistory([]);
    setStats(EMPTY_STATS);
    setMessage('');
    setResumed(false);
    medalBank().restarted(COIN_MAZE_GAME);
    if (said) setAnnouncement(live.current.t.sayRestart);
  }, []);

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a play under way is finished at once (the levers not flicked yet flicked blind), so
  // that its winnings are in before anyone else plays the medals or the page is gone.
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
    const placed = purse.sit(COIN_MAZE_GAME, { granted: () => undefined, yielding: finishNow });
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
          if (purse.restartDue(COIN_MAZE_GAME)) startOver(false);
          if (flightRef.current || staking.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            const flight: Flight = { staked: { record: left, stored: true, paid: false, void: false }, stage: left.flicks.length, phase: 'idle', dropAt: 0, readyAt: 0, way: null, wayAt: 0, cues: [], then: null };
            finish(flight, 'resumed');
            setKnown(true);
            break;
          }
          const record: PlayRecord | null = tab.last();
          setKnown(true);
          if (record && record.paid && shownLast.current !== record.id) {
            shownLast.current = record.id;
            const ended: Ended = { id: record.id, play: playOfRecord(record), earlier: true };
            restRef.current = restingPose(ended.play.outAt, ended.play.bin);
            setOutcome(ended);
            setHistory((before) => (before.some((entry) => entry.id === ended.id) ? before : [ended, ...before].slice(0, HISTORY_LIMIT)));
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

  // A play that has ended: whatever the medals heard of while the medal rolled (another tab, a reset) is looked at now.
  useEffect(() => {
    if (phase === 'idle' && mine && here) syncNow.current?.();
  }, [phase, mine, here]);

  // A play that has ended no longer needs the view held up at the case.
  useEffect(() => {
    if (phase === 'idle') glance.current?.drop();
  }, [phase]);

  // The attract swing: a machine left standing unplayed swings its gates a little livelier, until the next press.
  useEffect(() => {
    if (phase !== 'idle' || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [phase, active, touched, outcome]);
  const attractRef = useRef(attract);
  useEffect(() => {
    attractRef.current = attract;
  }, [attract]);

  // ── The frame loop: the gates, the medal, the strikers and the time lamps, moved straight on their elements ──
  const boardEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let frame = 0;
    const shown = { angles: new Array<number>(STAGES).fill(NaN), lit: new Array<number>(STAGES).fill(-1), pull: new Array<number>(STAGES).fill(NaN), medal: '', window: '' };
    const pullNow = new Array<number>(STAGES).fill(0);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const flight = flightRef.current;
      const calmNow = live.current.calm;
      // The gates.
      for (let s = 0; s < STAGES; s++) {
        let look: number;
        if (flight) {
          const kind = gateOf(s, flight.staked.record.draw.gates[s]);
          look = gateLook(levelsOf(kind), flight.staked.record.draw.phases[s], now - flight.dropAt, WINDOW_MS, calmNow);
        } else {
          const pace = attractRef.current ? 0.6 : 1;
          look = calmNow ? 0 : gateLook(RESTING_LEVELS, s * 3, now / pace, WINDOW_MS * 2, false);
        }
        const angle = gateAngle(s, look);
        if (Math.abs(angle - shown.angles[s]) > 0.15 || Number.isNaN(shown.angles[s])) {
          shown.angles[s] = angle;
          parts.gates[s].current?.setAttribute('transform', `rotate(${angle.toFixed(2)} ${GATE_X[s]} ${GATE_FOOT(s)})`);
        }
        // The striker: drawn back while the lever is held at this gate, snapping forward as it is let go.
        const want = flight && flight.stage === s && pulledRef.current ? 1 : 0;
        pullNow[s] = calmNow ? want : want > pullNow[s] ? Math.min(want, pullNow[s] + dt * 6) : Math.max(want, pullNow[s] - dt * 30);
        if (Math.abs(pullNow[s] - shown.pull[s]) > 0.01 || Number.isNaN(shown.pull[s])) {
          shown.pull[s] = pullNow[s];
          const dx = (CUPS[s].x > 150 ? 1 : -1) * 8 * pullNow[s];
          parts.strikers[s].current?.setAttribute('transform', `translate(${dx.toFixed(2)} 0)`);
        }
        // The time lamps of the gate the medal waits at.
        let lit = 0;
        if (flight && flight.phase === 'wait' && flight.stage === s) {
          const left = LIMIT_WINDOWS * WINDOW_MS - (now - flight.readyAt);
          lit = Math.max(0, Math.min(3, Math.ceil(left / (WINDOWS * WINDOW_MS))));
        }
        if (lit !== shown.lit[s]) {
          shown.lit[s] = lit;
          parts.lamps[s].current?.setAttribute('data-lit', String(lit));
        }
      }
      // The medal.
      let pose: Pose | null = restRef.current;
      if (flight) {
        if (flight.way) {
          const t = (now - flight.wayAt) / 1000;
          pose = poseAt(flight.way, t);
          while (flight.cues.length > 0 && flight.cues[0].at <= t) {
            const cue = flight.cues.shift()!;
            if (cue.sound) play(SOUND_OF[cue.sound]);
          }
          if (t >= flight.way.length && flight.then) {
            const then = flight.then;
            flight.then = null;
            flight.way = null;
            then();
          }
        } else if (flight.phase === 'wait') pose = cupPose(flight.stage);
      }
      const medalText = pose ? `${pose.x.toFixed(1)} ${pose.y.toFixed(1)} ${pose.turn.toFixed(0)} ${pose.tip.toFixed(2)} ${pose.shown.toFixed(2)}` : '';
      if (medalText !== shown.medal) {
        shown.medal = medalText;
        const medal = parts.medal.current;
        if (medal) {
          if (!pose) medal.style.opacity = '0';
          else {
            medal.setAttribute('transform', `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)})`);
            medal.style.opacity = pose.shown.toFixed(2);
            (medal.firstElementChild as SVGGElement | null)?.setAttribute('transform', `scale(${pose.tip.toFixed(3)} 1) rotate(${pose.turn.toFixed(1)})`);
          }
        }
      }
      // The window a flick now would meet, and how the gate stands in it, for whoever reads the page (a test times its flick by it).
      const box = boardEl.current;
      if (box) {
        let windowText = '';
        if (flight && flight.phase === 'wait') {
          const w = windowNow(flight);
          windowText = `${w} ${slotOf(gateOf(flight.stage, flight.staked.record.draw.gates[flight.stage]), w)}`;
          // The medal has waited too long: it drops through its cup.
          if (now - flight.readyAt >= LIMIT_WINDOWS * WINDOW_MS) {
            pulledRef.current = false;
            setPulled(false);
            commit(TIMEOUT);
          }
        }
        if (windowText !== shown.window) {
          shown.window = windowText;
          const [w, slot] = windowText.split(' ');
          box.setAttribute('data-window', w ?? '');
          box.setAttribute('data-slot', slot ?? '');
        }
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [commit, parts, play]);

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

  // On a desktop: Space or Enter drops a medal; at a gate, Space held and let go flicks (Enter flicks at once); S skips.
  useMachineKeys(active, (key) => {
    const flight = flightRef.current;
    if (key === ' ' || key === 'Enter') {
      if (!flight) drop(null);
      else if (flight.phase === 'wait') {
        if (key === 'Enter') flickNow();
        else if (pull()) keyPulled.current = true;
      }
    } else if (key === 's') skip();
    else return false;
    return true;
  });
  useEffect(() => {
    if (!active) return;
    const up = (event: KeyboardEvent) => {
      if (keyName(event.key) !== ' ' || !keyPulled.current) return;
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

  // ── The lever's own presses: a finger or the mouse holds it back and lets it go; a key on it does the same ──
  const onLeverDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (!pull()) return;
    pointerDown.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still lets go over the lever, as a finger does.
    }
  };
  const onLeverUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerDown.current !== event.pointerId) return;
    pointerDown.current = null;
    lastFlickAt.current = performance.now();
    release();
  };
  const onLeverCancel = () => {
    if (pointerDown.current === null) return;
    pointerDown.current = null;
    pulledRef.current = false;
    setPulled(false);
  };
  // A click with no press before it (a screen reader, a keyboard's Enter, a click made by a script): a flick at once.
  const onLeverClick = () => {
    if (performance.now() - lastFlickAt.current < SAME_PRESS_MS) return;
    flickNow();
  };
  const onLeverKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) pull();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) {
        lastFlickAt.current = performance.now();
        flickNow();
      }
    }
  };
  const onLeverKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ') return;
    event.preventDefault();
    lastFlickAt.current = performance.now();
    release();
  };

  // ── What is on the screen ──
  const odds = analyze();
  const running = phase !== 'idle';
  const statusText = (() => {
    if (running) {
      if (phase === 'drop') return t.status.dropping;
      if (phase === 'pins') return t.status.pins;
      if (phase === 'fly' && endShown) return t.status.end(endShown);
      return t.status.wait(stage);
    }
    if (outcome) return t.outcome(outcome.play).status;
    if (outOfMedals) return t.outOfMedals;
    return known && stats.plays > 0 ? t.status.again : t.status.first;
  })();
  const where = phase === 'wait' ? t.whereCup(stage) : phase === 'pins' ? t.wherePins : running ? t.whereMoving : t.whereIdle;
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const won = !running && outcome !== null && !outcome.earlier && outcome.play.won > 0;
  const result = outcome ? (outcome.play.outAt !== null ? `out-${outcome.play.outAt + 1}` : (outcome.play.pocket ?? '')) : '';

  return (
    <div
      className={styles.machine}
      data-testid="cm-machine"
      data-playable={canDrop ? 'true' : 'false'}
      data-card={bankState.card}
      data-phase={phase}
      data-stage={running ? stage : ''}
      data-round={roundId ?? outcome?.id ?? ''}
      data-won={outcome?.play.won ?? ''}
      data-result={running ? '' : result}
      onPointerDown={() => {
        setAttract(false);
        setTouched((n) => n + 1);
      }}
    >
      <div className={styles.cabinet}>
        <div className={styles.sign} aria-hidden="true">
          <span className={styles.signMain}>{t.sign}</span>
          <span className={styles.signSub} lang={language}>
            {t.signSub}
          </span>
        </div>

        <div className={styles.playArea} ref={boardRef}>
          <div className={styles.caseBox} ref={boardEl} data-testid="cm-board" data-window="" data-slot="">
            <Maze t={t} label={t.boardLabel(where)} parts={parts} active={phase === 'wait' ? stage : null} hit={!running && outcome ? outcome.play.bin : null} />
            {(resumed || (outcome?.earlier && !running)) && (
              <span className={styles.resumedBadge} data-testid="cm-resumed">
                {t.resumed}
              </span>
            )}
            <span className={styles.perPlay} aria-hidden="true">
              {t.perPlay}
            </span>
          </div>

          <p className={styles.status} data-testid="cm-status">
            <span>
              <Phrases text={statusText} />
            </span>
          </p>

          {/* The medals and the last win, on LED counters as a medal machine shows them. The numbers are in type beside
              them, for a screen reader and for anything else that reads the page. */}
          <div className={styles.meters}>
            <div className={`${styles.meterCell} ${styles.meterMedals}`}>
              <span className={styles.meterLabel}>{t.medals}</span>
              <span className={styles.meterValue} data-testid="cm-medals" data-loaded={medalsShown !== null}>
                {medalsShown === null ? '—' : fmt(medalsShown)}
              </span>
              <span className={styles.led} data-testid="cm-medals-led" data-shown={meter.shown ?? ''}>
                <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
              </span>
            </div>
            <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
              <span className={styles.meterLabel}>{t.win}</span>
              <span className={styles.meterValue} data-testid="cm-win">
                {winShown}
              </span>
              <span className={styles.led} data-testid="cm-win-led" data-shown={winMeter.shown ?? 0}>
                <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
              </span>
            </div>
          </div>

          {/* DROP, the lever and Skip: always in the same place, so nothing moves as a play goes on. */}
          <div className={styles.controls}>
            <button type="button" className={styles.dropButton} data-testid="cm-drop" aria-label={t.dropAria} onClick={(event) => drop(event.currentTarget)} disabled={!canDrop || bankState.balance < STAKE}>
              <span className={styles.dropWords}>{t.drop}</span>
            </button>
            <button
              type="button"
              className={styles.lever}
              data-testid="cm-lever"
              data-pulled={pulled ? 'true' : 'false'}
              data-ready={phase === 'wait' ? 'true' : 'false'}
              aria-label={t.leverAria}
              aria-disabled={phase !== 'wait'}
              onPointerDown={onLeverDown}
              onPointerUp={onLeverUp}
              onPointerCancel={onLeverCancel}
              onLostPointerCapture={onLeverCancel}
              onClick={onLeverClick}
              onKeyDown={onLeverKeyDown}
              onKeyUp={onLeverKeyUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.leverSlot} aria-hidden="true">
                <span className={styles.leverArm}>
                  <span className={styles.leverKnob} />
                </span>
              </span>
              <span className={styles.leverWords}>{t.lever}</span>
            </button>
            <button type="button" className={styles.skipButton} data-testid="cm-skip" onClick={skip} disabled={!running}>
              {t.skip}
            </button>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="cm-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="cm-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="cm-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="cm-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="cm-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="cm-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="cm-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="cm-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="cm-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="cm-history-title">
          <h2 id="cm-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="cm-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.play.won > 0 ? 'true' : 'false'} data-pocket={entry.play.pocket ?? 'gate'}>
                  {t.historyEntry(entry.play)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="cm-session-title">
          <h2 id="cm-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.plays}</dt>
              <dd data-testid="cm-stat-plays">{fmt(stats.plays)}</dd>
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
              <dt>{t.gates}</dt>
              <dd>{fmt(stats.gates)}</dd>
            </div>
            <div>
              <dt>{t.wins}</dt>
              <dd>{fmt(stats.wins)}</dd>
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

      <p className={styles.srOnly} aria-live="polite" data-testid="cm-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
