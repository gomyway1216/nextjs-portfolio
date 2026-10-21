'use client';

import { Fragment, createRef, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
import { BANDS, CORKS, FALLEN, PER_TIER, SET_UP, SHELF, STAKE, TARGETS, TIERS, drawPlay, playOf, tierOf, valueOf, type CorkPlay, type KindId, type Outcome, type Play } from './engine';
import { getStrings } from './i18n';
import { SHOOTING_GALLERY_GAME, createTable, playId, playOfRecord, type PlayRecord, type Staked, type Table } from './medalTable';
import { PUBLISHED_SHOOTING_GALLERY_ODDS } from './published';
import {
  CALM_LOAD_MS,
  CORK_BOX,
  GUN_BOX,
  LOAD_MS,
  PUFF_BOX,
  SIGHT_BOX,
  TIER_PLACES,
  createMachineClock,
  figureHome,
  figureLayer,
  gunAngle,
  loadPose,
  muzzleAt,
  restPose,
  shotScene,
  sightAt,
  type FigurePose,
  type ShotScene,
  type ShotSound,
} from './scene';
import { Stage, type StageParts } from './Stage';
import styles from './ShootingGallery.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the corks left, and a win (up to 41). */
export const MEDAL_PLACES = 7;
export const CORK_PLACES = 1;
export const WIN_PLACES = 2;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
const HISTORY_LIMIT = 16;
/** How long the flash over the stall says a figure is off the shelf, in ms. */
const FLASH_MS = 1_400;
/** The figure the sight is first put on: the middle of the bottom tier. */
export const FIRST_PICK = (TIERS - 1) * PER_TIER + 1;
/** How far the gun kicks back as it fires, in the stall's units. */
const KICK = 7;

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

/** `load`: the lever is pulled and a cork pushed in; `aim`: the sight sways, waiting for FIRE; `fly`: the cork is on its way, and the figure answers. */
type Phase = 'idle' | 'load' | 'aim' | 'fly';

/** A play on this page: its stake, the cork in the gun or in flight, and how it is moving now. */
interface Flight {
  staked: Staked;
  /** The cork in the gun, or in flight from it. */
  cork: number;
  phase: Phase;
  /** When the loading of the cork began, by the machine's clock. */
  loadAt: number;
  /** The shot in flight: what it did, how it plays out, from when, and what of it is still to come. */
  shot: CorkPlay | null;
  scene: ShotScene | null;
  sceneAt: number;
  muzzle: { x: number; y: number };
  cues: ShotScene['cues'];
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
  knocked: number;
  cats: number;
}
const EMPTY_STATS: SessionStats = { plays: 0, played: 0, won: 0, knocked: 0, cats: 0 };

/** What the status line says for a moment after a cork: what it did to which figure. */
type Moment = { outcome: Outcome; kind: KindId } | null;

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

const SOUND_OF: Record<ShotSound, MachineSound> = { cork: 'cork', thud: 'thud', topple: 'topple', whiff: 'whiff' };

/**
 * Brings the stall, the status line and FIRE wholly on screen, under the site's toolbar, as a play starts: a player
 * who scrolled down to START sees the shelves and the gun while firing. Moved on the next frame, after the press has
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

/** Whether every cork of a play has been fired: nothing is left to the player's aim. */
const allFired = (flight: Flight): boolean => flight.staked.record.shots.length >= CORKS;

/** The figure still up nearest `from` (by tier first, then across), where `from` itself has fallen. */
function nearestUp(positions: readonly number[], from: number): number {
  if (positions[from] !== FALLEN) return from;
  let best = from;
  let bestScore = Infinity;
  for (let t = 0; t < TARGETS; t++) {
    if (positions[t] === FALLEN) continue;
    const score = Math.abs(tierOf(t) - tierOf(from)) * 10 + Math.abs((t % PER_TIER) - (from % PER_TIER));
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** The next figure still up from `from`, `step` along the shelf in reading order (left and right), or a tier up or down (`tier`). */
function stepPick(positions: readonly number[], from: number, step: 'left' | 'right' | 'up' | 'down'): number {
  const up = positions.flatMap((p, t) => (p === FALLEN ? [] : [t]));
  if (up.length === 0) return from;
  if (step === 'left' || step === 'right') {
    const at = up.indexOf(from);
    if (at < 0) return up[0];
    return up[(at + (step === 'right' ? 1 : up.length - 1)) % up.length];
  }
  const tier = tierOf(from) + (step === 'down' ? 1 : -1);
  if (tier < 0 || tier >= TIERS) return from;
  const there = up.filter((t) => tierOf(t) === tier);
  if (there.length === 0) return from;
  const across = from % PER_TIER;
  return there.reduce((best, t) => (Math.abs((t % PER_TIER) - across) < Math.abs((best % PER_TIER) - across) ? t : best), there[0]);
}

/** Each figure's layer, clipped as it falls behind its shelf, and the part of it that moves. */
interface FigureLayers {
  clips: (HTMLDivElement | null)[];
  movers: (HTMLDivElement | null)[];
}

/** A figure's pose, put on its layer: the inner layer moved, the outer clipped once it is behind its shelf. */
function applyPose(layers: FigureLayers, target: number, pose: FigurePose): void {
  const mover = layers.movers[target];
  const clip = layers.clips[target];
  if (!mover || !clip) return;
  const box = figureLayer(target);
  const home = figureHome(target);
  const x = pose.pivot === 'foot' ? home.x : pose.pivot === 'left' ? home.x - home.w / 2 : home.x + home.w / 2;
  mover.style.transformOrigin = `${(((x - box.x) / box.w) * 100).toFixed(2)}% ${(((home.y - box.y) / box.h) * 100).toFixed(2)}%`;
  mover.style.transform = `translate(${((pose.dx / box.w) * 100).toFixed(3)}%, ${((pose.dy / box.h) * 100).toFixed(3)}%) rotate(${pose.turn.toFixed(2)}deg) scale(${pose.scale.toFixed(4)}, ${(pose.scale * pose.squash).toFixed(4)})`;
  mover.style.opacity = pose.shown.toFixed(3);
  const back = TIER_PLACES[tierOf(target)].back;
  clip.style.clipPath = pose.behind ? `inset(0 0 ${(((box.y + box.h - back) / box.h) * 100).toFixed(2)}% 0)` : '';
}

/** A small layer moved to `x`, `y` in the stall (its middle there), at `scale` and `turn`. */
const placeAt = (box: { w: number; h: number }, x: number, y: number, scale = 1, turn = 0): string =>
  `translate(${(((x - box.w / 2) / box.w) * 100).toFixed(3)}%, ${(((y - box.h / 2) / box.h) * 100).toFixed(3)}%) scale(${scale.toFixed(3)}) rotate(${turn.toFixed(1)}deg)`;

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the stall, its counters, START, FIRE and Skip. What happens to the medals is the table's
 * (medalTable.ts); this draws each play the moment START is pressed, sways the sight over the figure picked, turns a
 * press of FIRE into a shot at the band the sight is on, plays out what the draw says the cork does (scene.ts), and
 * shows how each play ended.
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
  const [cork, setCork] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  // Where the figures stand as the stall shows them: each as its cork's answer ends, the whole shelf as a play ends.
  const [shown, setShown] = useState<number[]>(() => [...SET_UP]);
  const [picked, setPicked] = useState(FIRST_PICK);
  const [moment, setMoment] = useState<Moment>(null);
  // The flash over the stall as a figure falls: which (a new key each time), and what kind.
  const [flash, setFlash] = useState<{ key: number; kind: KindId } | null>(null);
  const [known, setKnown] = useState(false);
  const [outcome, setOutcome] = useState<Ended | null>(null);
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [resumed, setResumed] = useState(false);
  // Skip only fast-forwards: it can be pressed once no cork is left to fire.
  const [skippable, setSkippable] = useState(false);
  // The clock a play runs on, stopped while the machine is not on show (scene.ts).
  const [clock] = useState(() => createMachineClock(() => performance.now()));

  const flightRef = useRef<Flight | null>(null);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const playAreaRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gaugeRef = useRef<HTMLSpanElement | null>(null);
  // While START writes its play down and takes the medals: the medals moving then are this press's own, not a play to take up.
  const staking = useRef(false);
  /** The figure the sight is on, and where the figures stand on the stall: read by the frame loop and the presses at once. */
  const pickedRef = useRef(FIRST_PICK);
  const shownRef = useRef<number[]>([...SET_UP]);
  /** The band the sight was drawn on at the last frame (-1: no sight), and where: FIRE shoots there. */
  const bandRef = useRef(-1);
  const sightRef = useRef({ x: 0, y: 0 });
  /** The gun's angle as drawn. */
  const angleRef = useRef<number | null>(null);
  /** Whether the last press of FIRE fired by its pointer: the click that follows it is that same press. */
  const firedByPointer = useRef(false);
  /** Sets the frame loop going again, where it has stopped because nothing on the stall moved (it stops itself again then). */
  const wake = useRef<(() => void) | null>(null);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  const figures = useRef<FigureLayers>({ clips: new Array<HTMLDivElement | null>(TARGETS).fill(null), movers: new Array<HTMLDivElement | null>(TARGETS).fill(null) });
  const [parts] = useState<StageParts>(() => ({
    gun: createRef<HTMLDivElement>(),
    lever: createRef<SVGGElement>(),
    loaded: createRef<SVGGElement>(),
    sight: createRef<HTMLDivElement>(),
    sightLabel: createRef<HTMLSpanElement>(),
    cork: createRef<HTMLDivElement>(),
    puff: createRef<HTMLDivElement>(),
    figure: (target, part, el) => {
      figures.current[part === 'clip' ? 'clips' : 'movers'][target] = el;
    },
  }));

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const winShown = phase === 'idle' ? (outcome?.play.won ?? 0) : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;
  const corksLeft = phase === 'idle' ? 0 : CORKS - cork - (phase === 'fly' ? 1 : 0);
  const down = shown.filter((p) => p === FALLEN).length;

  const canStart = mine && here && phase === 'idle';
  // Brought up to date as START is drawn (a layout effect), not after the paint: the press reads it, and a press made
  // the moment START is drawn enabled was otherwise turned away by the old value.
  const canStartRef = useRef(canStart);
  useLayoutEffect(() => {
    canStartRef.current = canStart;
  }, [canStart]);

  // The figures stand where the stall shows them: put on their layers as it changes, before the paint.
  useLayoutEffect(() => {
    shownRef.current = shown;
    const flight = flightRef.current;
    for (let target = 0; target < TARGETS; target++) {
      // The figure a cork is answering is the frame loop's to move until its answer ends.
      if (flight?.phase === 'fly' && flight.shot?.target === target) continue;
      applyPose(figures.current, target, restPose(shown[target]));
    }
  }, [shown, parts]);

  /** Puts the sight on figure `target`: at once for the frame loop and the presses, and on the stall. */
  const pick = useCallback((target: number) => {
    if (target < 0 || target >= TARGETS || shownRef.current[target] === FALLEN) return;
    pickedRef.current = target;
    setPicked(target);
    wake.current?.();
  }, []);

  /** Where the figures stand now: the sight moves off a figure that has fallen. */
  const showShelf = useCallback((positions: number[]) => {
    shownRef.current = positions;
    setShown(positions);
    const next = nearestUp(positions, pickedRef.current);
    if (next !== pickedRef.current) {
      pickedRef.current = next;
      setPicked(next);
    }
  }, []);

  /** The play has ended on this page (or was found ended): settled if it was not already, and shown. */
  const finish = useCallback(
    (flight: Flight, how: 'played' | 'skipped' | 'resumed') => {
      if (flightRef.current === flight) flightRef.current = null;
      // A frame to take the cork off the stall and the gun back to rest.
      wake.current?.();
      setSkippable(false);
      setMoment(null);
      const { staked } = flight;
      // Known as shown before it is settled: the medals moving as it is paid wake the machine's look at the play.
      shownLast.current = staked.record.id;
      const before = staked.paid;
      // Corks still to come as it is finished here (the page is going, or another tab is playing the medals): they are
      // fired blind, and the player is told so, since the shots that ended it were not theirs.
      const blind = staked.record.shots.length < CORKS;
      const settled = staked.paid ? 'already' : (table.current?.settle(staked) ?? 'later');
      if (settled === 'later') {
        // Not this page's to finish now (the medals are elsewhere): it stays on record, and the page that next holds the
        // card finishes it.
        showShelf([...SET_UP]);
        setPhase('idle');
        return;
      }
      if (settled === 'void' || staked.void) {
        showShelf([...SET_UP]);
        setPhase('idle');
        setRoundId(null);
        return;
      }
      const ended = playOfRecord({ ...staked.record, paid: true });
      if (ended.won > 0 && (settled === 'paid' || before)) {
        payMedals();
        payWin();
      }
      showShelf(ended.positions);
      const entry: Ended = { id: staked.record.id, play: ended, earlier: how === 'resumed' };
      setOutcome(entry);
      setHistory((list) => [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT));
      const cat = ended.fallen.some((target) => SHELF[target] === 'cat');
      if (how !== 'resumed') setStats((s) => ({ plays: s.plays + 1, played: s.played + STAKE, won: s.won + ended.won, knocked: s.knocked + ended.fallen.length, cats: s.cats + (cat ? 1 : 0) }));
      if (ended.won > 0) play(cat ? 'big' : 'win');
      setResumed(how === 'resumed');
      if (blind) setMessage(live.current.t.finishedAway);
      setPhase('idle');
      setAnnouncement(live.current.t.outcome(ended).say);
    },
    [payMedals, payWin, play, showShelf],
  );

  /** Cork `c` is loaded: the lever pulled back, the cork pushed into the muzzle. The frame loop says when it is in. */
  const load = useCallback(
    (flight: Flight, c: number) => {
      flight.cork = c;
      flight.phase = 'load';
      flight.loadAt = clock.now();
      flight.shot = null;
      flight.scene = null;
      setCork(c);
      setPhase('load');
      play('cock');
      wake.current?.();
    },
    [clock, play],
  );

  /** The cork is in: the sight sways over the figure picked, waiting for FIRE. */
  const ready = useCallback((flight: Flight) => {
    flight.phase = 'aim';
    setPhase('aim');
    setAnnouncement(live.current.t.sayReady(flight.cork));
  }, []);

  /** FIRE: the cork in the gun, at the figure picked and the band the sight is on now; written down first, then flown. */
  const fire = useCallback((): boolean => {
    const flight = flightRef.current;
    const tab = table.current;
    if (!flight || flight.phase !== 'aim' || !tab || clock.paused()) return false;
    const band = bandRef.current;
    if (band < 0 || band >= BANDS) return false;
    const c = flight.cork;
    const target = pickedRef.current;
    const kept = tab.shoot(flight.staked, c, [target, band]);
    if (kept === 'unsaved') {
      setMessage(live.current.t.unsaved);
      return false;
    }
    if (kept === 'away') return false;
    if (kept === 'gone') {
      finish(flight, 'skipped');
      return false;
    }
    const { record } = flight.staked;
    const after = playOf(record.draw, record.shots);
    const shot = after.corks[c];
    const muzzle = muzzleAt(angleRef.current ?? 0);
    const scene = shotScene(shot, muzzle, { ...sightRef.current }, live.current.calm);
    flight.phase = 'fly';
    flight.shot = shot;
    flight.scene = scene;
    flight.sceneAt = clock.now();
    flight.muzzle = muzzle;
    flight.cues = [...scene.cues];
    setSkippable(allFired(flight));
    setPhase('fly');
    setMoment(null);
    wake.current?.();
    return true;
  }, [clock, finish]);

  /** A cue of the shot in flight, as its moment comes: what the stall shows and says as the cork gets there, as the figure falls, and as it settles. */
  const onCue = useCallback(
    (flight: Flight, cue: ShotScene['cues'][number]) => {
      if (cue.sound) play(SOUND_OF[cue.sound]);
      const shot = flight.shot;
      if (!shot || !cue.cue) return;
      const kind = SHELF[shot.target];
      if (cue.cue === 'hit') {
        setMoment({ outcome: shot.outcome, kind });
        setAnnouncement(live.current.t.sayMoment(shot.outcome, kind));
      } else if (cue.cue === 'down') {
        setFlash((before) => ({ key: (before?.key ?? 0) + 1, kind }));
      } else if (cue.cue === 'still') {
        const { record } = flight.staked;
        showShelf(playOf(record.draw, record.shots.slice(0, shot.cork + 1)).positions);
        if (flightRef.current !== flight) return;
        if (shot.cork + 1 < CORKS) load(flight, shot.cork + 1);
        else finish(flight, 'played');
      }
    },
    [finish, load, play, showShelf],
  );

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
    setOutcome(null);
    setMoment(null);
    // The keeper stands every figure up again for the new play.
    showShelf([...SET_UP]);
    const flight: Flight = { staked: staked.staked, cork: 0, phase: 'load', loadAt: clock.now(), shot: null, scene: null, sceneAt: 0, muzzle: muzzleAt(0), cues: [] };
    setSkippable(false);
    flightRef.current = flight;
    setRoundId(staked.staked.record.id);
    play('medal');
    setAnnouncement(live.current.t.sayStart);
    bringIntoView(playAreaRef.current);
    load(flight, 0);
  };

  /**
   * Skip: once the last cork has been fired, its flight and the figure's answer are cut short, and the play ends as it
   * would have. Before that it does nothing: it never fires a cork for the player.
   */
  const skip = useCallback(() => {
    const flight = flightRef.current;
    if (flight && allFired(flight)) finish(flight, 'skipped');
  }, [finish]);

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback(
    (said: boolean) => {
      const flight = flightRef.current;
      if (flight) flight.staked.void = true;
      flightRef.current = null;
      wake.current?.();
      table.current?.clear();
      shownLast.current = null;
      showShelf([...SET_UP]);
      setPhase('idle');
      setRoundId(null);
      setOutcome(null);
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      setMoment(null);
      setResumed(false);
      medalBank().restarted(SHOOTING_GALLERY_GAME);
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [showShelf],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a play under way is finished at once (the corks not fired yet fired blind), so that
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
    const placed = purse.sit(SHOOTING_GALLERY_GAME, { granted: () => undefined, yielding: finishNow });
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
          if (purse.restartDue(SHOOTING_GALLERY_GAME)) startOver(false);
          if (flightRef.current || staking.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            const flight: Flight = { staked: { record: left, stored: true, paid: false, void: false }, cork: left.shots.length, phase: 'idle', loadAt: 0, shot: null, scene: null, sceneAt: 0, muzzle: muzzleAt(0), cues: [] };
            finish(flight, 'resumed');
            setKnown(true);
            break;
          }
          const record: PlayRecord | null = tab.last();
          setKnown(true);
          if (record && record.paid && shownLast.current !== record.id) {
            shownLast.current = record.id;
            const ended: Ended = { id: record.id, play: playOfRecord(record), earlier: true };
            showShelf(ended.play.positions);
            setOutcome(ended);
            setHistory((before) => (before.some((entry) => entry.id === ended.id) ? before : [ended, ...before].slice(0, HISTORY_LIMIT)));
            // Finished by the page that went (reloaded, closed or hidden mid-play), the corks still to come fired blind:
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
  }, [finish, showShelf, startOver]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // A play that has ended: whatever the medals heard of while the corks flew (another tab, a reset) is looked at now.
  useEffect(() => {
    if (phase === 'idle' && mine && here) syncNow.current?.();
  }, [phase, mine, here]);

  // The flash over the stall goes out after a moment.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // ── The frame loop: the sight, the gun, the cork and the figure answering it, moved straight on their layers ──
  // It runs only while something moves: a cork being loaded, the sight swaying, a cork on its way and the figure's
  // answer, or the gun turning to a figure just picked. A machine standing unplayed, or one whose clock is stopped (its
  // Odds tab or its help in front), asks the browser for no frames at all; whatever sets something moving wakes it.
  useEffect(() => {
    let frame = 0;
    let running = false;
    /** Woken while it ran: one more frame, to show what changed. */
    let again = false;
    const shown = { sight: '', band: -2, label: '', side: '', gun: '', lever: '', loaded: '', cork: '', puff: '' };
    let last = performance.now();
    const step = (now: number) => {
      again = false;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const at = clock.now();
      const paused = clock.paused();
      const calmNow = live.current.calm;
      let flight = flightRef.current;
      // A cork loaded: the sight comes up.
      if (flight && flight.phase === 'load' && !paused && at - flight.loadAt >= (calmNow ? CALM_LOAD_MS : LOAD_MS)) ready(flight);
      // A shot playing out: its moments as they come, in order.
      if (flight && flight.phase === 'fly' && flight.scene && !paused) {
        const ms = at - flight.sceneAt;
        while (flight && flight.cues.length > 0 && flight.cues[0].at <= ms) {
          const cue = flight.cues.shift()!;
          onCue(flight, cue);
          if (flightRef.current !== flight) break;
        }
        flight = flightRef.current;
      }
      const target = pickedRef.current;
      const positions = shownRef.current;
      // The sight: over the figure picked, swaying, while a cork waits in the gun.
      let sightText = '';
      let band = -1;
      if (flight && flight.phase === 'aim') {
        const sight = sightAt(target, Math.max(0, positions[target]), at);
        sightRef.current = { x: sight.x, y: sight.y };
        band = sight.band;
        sightText = placeAt(SIGHT_BOX, sight.x, sight.y);
      }
      bandRef.current = band;
      if (sightText !== shown.sight) {
        shown.sight = sightText;
        const el = parts.sight.current;
        if (el) {
          el.style.opacity = sightText ? '1' : '0';
          if (sightText) el.style.transform = sightText;
        }
      }
      if (band !== shown.band) {
        shown.band = band;
        stageRef.current?.setAttribute('data-band', band < 0 ? '' : String(band));
        gaugeRef.current?.setAttribute('data-level', String(band));
        const label = band < 0 ? '' : live.current.t.bandLabel(band);
        if (parts.sightLabel.current && label !== shown.label) {
          shown.label = label;
          parts.sightLabel.current.textContent = label;
        }
      }
      // The sight's words go to whichever side of it has room.
      const side = TIER_PLACES[tierOf(target)].xs[target % PER_TIER] > 200 ? 'left' : 'right';
      if (side !== shown.side && parts.sightLabel.current) {
        shown.side = side;
        parts.sightLabel.current.setAttribute('data-side', side);
      }
      // The gun: turned to the figure picked, and held still while its cork flies. Once it points there it stands still:
      // only the sight sways, so a frame of aiming moves one layer.
      const home = figureHome(target);
      const want = gunAngle({ x: home.x, y: home.y - home.h / 2 });
      let angle = angleRef.current ?? want;
      if (flight?.phase !== 'fly') angle = calmNow || Math.abs(want - angle) < 0.05 ? want : angle + (want - angle) * (1 - Math.exp(-dt / 0.07));
      angleRef.current = angle;
      const settled = angle === want;
      const scene = flight?.phase === 'fly' ? flight.scene : null;
      const ms = scene && flight ? at - flight.sceneAt : 0;
      const kick = scene ? scene.kick(ms) * KICK : 0;
      const gunText = `rotate(${angle.toFixed(2)}deg) translateY(${((kick / GUN_BOX.h) * 100).toFixed(2)}%)`;
      if (gunText !== shown.gun && parts.gun.current) {
        shown.gun = gunText;
        parts.gun.current.style.transform = gunText;
      }
      // The lever and the cork in the muzzle, as the cork is loaded.
      const load = flight?.phase === 'load' ? loadPose(at - flight.loadAt, calmNow) : flight?.phase === 'aim' ? { lever: 0, cork: 1 } : { lever: 0, cork: 0 };
      const leverText = `rotate(${(-38 * load.lever).toFixed(1)} 193.5 377.5)`;
      if (leverText !== shown.lever) {
        shown.lever = leverText;
        parts.lever.current?.setAttribute('transform', leverText);
      }
      const loadedText = `${load.cork.toFixed(2)}`;
      if (loadedText !== shown.loaded && parts.loaded.current) {
        shown.loaded = loadedText;
        parts.loaded.current.style.opacity = load.cork > 0 ? '1' : '0';
        parts.loaded.current.setAttribute('transform', `translate(0 ${(-6 * (1 - load.cork)).toFixed(2)})`);
      }
      // The cork in flight, the puff at the muzzle, and the figure answering.
      const corkPose = scene ? scene.cork(ms) : null;
      const corkText = corkPose ? placeAt(CORK_BOX, corkPose.x, corkPose.y, corkPose.scale, corkPose.turn) + `|${corkPose.shown.toFixed(2)}` : '';
      if (corkText !== shown.cork && parts.cork.current) {
        shown.cork = corkText;
        parts.cork.current.style.opacity = corkPose ? corkPose.shown.toFixed(2) : '0';
        if (corkPose) parts.cork.current.style.transform = corkText.split('|')[0];
      }
      const puff = scene && flight ? scene.puff(ms) : null;
      const puffText = puff && flight ? placeAt(PUFF_BOX, flight.muzzle.x, flight.muzzle.y - 4, puff.scale) + `|${puff.shown.toFixed(2)}` : '';
      if (puffText !== shown.puff && parts.puff.current) {
        shown.puff = puffText;
        parts.puff.current.style.opacity = puff ? puff.shown.toFixed(2) : '0';
        if (puff) parts.puff.current.style.transform = puffText.split('|')[0];
      }
      if (scene && flight?.shot) applyPose(figures.current, flight.shot.target, scene.figure(ms));
      // On while a cork loads or flies, or the sight sways (and the clock runs), or the gun is still turning.
      const moving = !paused && flight !== null && (flight.phase === 'load' || flight.phase === 'aim' || flight.phase === 'fly');
      if (again || moving || !settled) frame = window.requestAnimationFrame(step);
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
  }, [clock, onCue, parts, ready]);

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

  // While the machine is not on show (its Odds tab, or its help, is in front of it), its clock stops: the sight's sway
  // and a cork's flight wait, and go on from the same point when it is shown again.
  useEffect(() => {
    if (active) {
      clock.resume();
      wake.current?.();
    } else clock.pause();
  }, [active, clock]);

  // On a desktop: Space or Enter starts a play, and with a cork in the gun fires it; the arrows move the sight from
  // figure to figure; S skips the last cork's flight.
  useMachineKeys(active, (key) => {
    const flight = flightRef.current;
    if (key === ' ' || key === 'Enter') {
      if (!flight) start();
      else if (flight.phase === 'aim') fire();
    } else if (key === 's') skip();
    else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      const way = key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : key === 'ArrowUp' ? 'up' : 'down';
      pick(stepPick(shownRef.current, pickedRef.current, way));
    } else return false;
    return true;
  });

  // ── FIRE's own presses: the trigger goes as the finger or the mouse comes down; a click with no press before it (a
  //    key on the button, a screen reader) fires too ──
  const onFireDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    firedByPointer.current = true;
    fire();
  };
  const onFireClick = () => {
    if (firedByPointer.current) {
      firedByPointer.current = false;
      return;
    }
    fire();
  };
  const onFireKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    // A key held down repeats: the trigger is pulled once.
    if ((event.key === ' ' || event.key === 'Enter') && event.repeat) event.preventDefault();
  };

  // ── What is on the screen ──
  const odds = PUBLISHED_SHOOTING_GALLERY_ODDS;
  const running = phase !== 'idle';
  const kindPicked = SHELF[picked];
  const statusText = (() => {
    if (running) {
      if (phase === 'load' && cork === 0) return t.status.loading;
      if (phase === 'fly') return moment ? t.status.moment(moment.outcome, moment.kind) : t.status.flying;
      const what = moment ? t.status.moment(moment.outcome, moment.kind) : null;
      if (phase === 'load') return what ?? t.status.ready(cork, kindPicked);
      return what ? t.status.then(what, t.status.ready(cork, kindPicked)) : t.status.ready(cork, kindPicked);
    }
    if (outOfMedals) return t.outOfMedals;
    if (shortOf) return t.tooFew(bankState.balance);
    if (outcome) return t.outcome(outcome.play).status;
    return known && stats.plays > 0 ? t.status.again : t.status.first;
  })();
  const where = phase === 'aim' ? t.whereAim(cork, kindPicked) : running ? t.whereMoving : t.whereIdle;
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const won = !running && outcome !== null && !outcome.earlier && outcome.play.won > 0;
  const catDown = (play: Play) => play.fallen.some((target) => SHELF[target] === 'cat');
  const result = outcome ? (catDown(outcome.play) ? 'cat' : `down-${outcome.play.fallen.length}`) : '';
  /** The badge over a play from before: one this page finished, or one simply shown again. */
  const badge = resumed ? t.resumed : outcome?.earlier && !running ? t.lastPlay : null;

  return (
    <div
      className={styles.machine}
      data-testid="sht-machine"
      data-playable={canStart ? 'true' : 'false'}
      data-card={bankState.card}
      data-phase={phase}
      data-cork={running ? cork : ''}
      data-round={roundId ?? outcome?.id ?? ''}
      data-won={outcome?.play.won ?? ''}
      data-result={running ? '' : result}
      data-down={down}
      data-picked={picked}
    >
      <div className={styles.cabinet}>
        <div className={styles.playArea} ref={playAreaRef}>
          <div className={styles.stageBox} ref={stageRef} data-testid="sht-stage" data-band="">
            <Stage t={t} label={t.stageLabel(where)} parts={parts} positions={shown} picked={picked} corksLeft={phase === 'idle' ? 0 : CORKS - cork - 1} down={down} onPick={pick} picking />
            {(resumed || (outcome?.earlier && !running)) && (
              <span className={styles.resumedBadge} data-testid="sht-resumed">
                {resumed ? t.resumed : t.lastPlay}
              </span>
            )}
            {flash && (
              <span key={flash.key} className={styles.flash} data-testid="sht-flash" data-kind={flash.kind} aria-hidden="true">
                {t.flash(flash.kind)}
              </span>
            )}
          </div>

          {/* On a phone held sideways the badge stands beside the stall, over the status line (ShootingGallery.module.css);
              its place is kept while there is none, so that nothing moves. */}
          <span className={styles.sideBadge} data-testid="sht-resumed-side" data-shown={badge ? 'true' : 'false'}>
            {badge ?? t.lastPlay}
          </span>

          <p className={styles.status} data-testid="sht-status">
            <span>
              <Phrases text={statusText} />
            </span>
          </p>

          {/* START, Skip and FIRE: always in the same place, so nothing moves as a play goes on. */}
          <div className={styles.controls}>
            <button type="button" className={styles.startButton} data-testid="sht-start" aria-label={t.startAria} onClick={() => start()} disabled={!canStart || bankState.balance < STAKE}>
              <span className={styles.startWords}>{t.start}</span>
            </button>
            {/* Skip only fast-forwards: it is there from the start, so that nothing moves, and can be pressed once the last
                cork has been fired. It says why it waits. */}
            <button type="button" className={styles.skipButton} data-testid="sht-skip" onClick={skip} disabled={!skippable} aria-describedby="sht-skip-why" title={skippable ? undefined : t.skipWhy}>
              {t.skip}
            </button>
            <span id="sht-skip-why" className={styles.srOnly}>
              {t.skipWhy}
            </span>
            <button
              type="button"
              className={styles.fireButton}
              data-testid="sht-fire"
              data-ready={phase === 'aim' ? 'true' : 'false'}
              aria-label={t.fireAria}
              aria-disabled={phase !== 'aim'}
              onPointerDown={onFireDown}
              onClick={onFireClick}
              onKeyDown={onFireKeyDown}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.gauge} ref={gaugeRef} data-level="-1" aria-hidden="true">
                {Array.from({ length: BANDS }, (_, b) => (
                  <span key={b} className={styles.gaugeStep} data-step={b} />
                ))}
              </span>
              <span className={styles.fireWords}>{t.fire}</span>
            </button>
          </div>
        </div>

        {/* The medals, the corks left and the last win, on LED counters as a medal machine shows them. The numbers are in
            type beside them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="sht-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="sht-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.corks}</span>
            <span className={styles.meterValue} data-testid="sht-corks">
              {corksLeft}
            </span>
            <span className={styles.led} aria-hidden="true">
              <SegmentDisplay value={corksLeft} places={CORK_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="sht-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="sht-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="sht-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="sht-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="sht-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="sht-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="sht-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="sht-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="sht-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="sht-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="sht-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="sht-history-title">
          <h2 id="sht-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="sht-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.play.won > 0 ? 'true' : 'false'} data-cat={catDown(entry.play) ? 'true' : 'false'} title={t.historyEntryLabel(entry.play)}>
                  {t.historyEntry(entry.play)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="sht-session-title">
          <h2 id="sht-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.plays}</dt>
              <dd data-testid="sht-stat-plays">{fmt(stats.plays)}</dd>
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
              <dt>{t.knocked}</dt>
              <dd>{fmt(stats.knocked)}</dd>
            </div>
            <div>
              <dt>{t.cats}</dt>
              <dd>{fmt(stats.cats)}</dd>
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

      <p className={styles.srOnly} aria-live="polite" data-testid="sht-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
