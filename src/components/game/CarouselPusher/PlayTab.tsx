'use client';

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { floorReport } from '../MedalCenter/floor/reporter';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { forTheMachine, keyName, useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { HOLD_MAX, STEP_RATE, TIMES, atRest, busy, idle, step as stepMachine, type Machine, type MachineEvent, type Spin } from './engine';
import { getStrings } from './i18n';
import { LOTTERY, OUTCOME_IDS, type OutcomeId } from './lottery';
import { CAROUSEL_GAME, createTable, roundId, type SessionRecord, type Table } from './medalTable';
import { PUBLISHED_CAROUSEL } from './published';
import { Stage, type StageHandle } from './Stage';
import { VIEW } from './view';
import styles from './CarouselPusher.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the slot, the dish. */
export const MEDAL_PLACES = 7;
export const CREDIT_PLACES = 3;
export const STOCK_PLACES = 4;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** How often the session is written down while anything moves, and how often the tray is counted in, in ms. */
export const SAVE_EVERY = 1_000;
export const COLLECT_EVERY = 300;
/** Medals waiting their turn at the slot at most: a press beyond them is not taken. */
export const SLOT_QUEUE = 4;
const STEP_MS = 1000 / STEP_RATE;
/** Steps worked out in one frame at most: a page that fell far behind plays on from now. */
const MOST_STEPS = 8;
const HISTORY_LIMIT = 12;

/** This device's storage for the machine: the session, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a move's name, from the browser's crypto: Math.random is the presses' alone. */
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

/** A line of words kept whole between its phrases: in Japanese it breaks only after 、。：！…, a zero-width space or a space. */
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

/** An element's box; where it has none of its own (held sideways, its parts are laid out by the cabinet), the box round its parts. */
function boxOf(area: HTMLElement): { top: number; bottom: number; height: number } {
  const own = area.getBoundingClientRect();
  if (own.width > 0 || own.height > 0) return own;
  const parts = [...area.children].map((part) => part.getBoundingClientRect()).filter((box) => box.width > 0 || box.height > 0);
  if (parts.length === 0) return own;
  const top = Math.min(...parts.map((box) => box.top));
  const bottom = Math.max(...parts.map((box) => box.bottom));
  return { top, bottom, height: bottom - top };
}

/** Brings the field, the counter and DROP wholly on screen under the site's toolbar, on the next frame (MedalCenter/lookUp.ts says why the next). */
function bringIntoView(area: HTMLElement | null): void {
  if (!area || typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    if (!area.isConnected) return;
    const rect = boxOf(area);
    const toolbar = parseFloat(getComputedStyle(area).scrollMarginTop) || 0;
    const room = window.innerHeight - toolbar;
    if (rect.top >= toolbar - 1 && rect.bottom <= window.innerHeight + 1) return;
    const by = rect.height <= room ? rect.top - toolbar - (room - rect.height) / 2 : rect.top - toolbar;
    window.scrollBy({ top: by, behavior: prefersCalm() ? 'auto' : 'smooth' });
  });
}

/** The counter as shown: its digits, which places still roll, and whether its first two have stopped alike. */
interface CounterView {
  digits: [number, number, number];
  rolling: [boolean, boolean, boolean];
  reach: boolean;
  result: OutcomeId | null;
}
const REST_COUNTER: CounterView = { digits: [7, 7, 7], rolling: [false, false, false], reach: false, result: null };

/** The counter: three big LED digits, the ones still rolling flicking through the numbers (dark, with less motion). */
const Counter = ({ view, calm, label }: { view: CounterView; calm: boolean; label: string }) => {
  const [flick, setFlick] = useState(0);
  const anyRolling = view.rolling.some(Boolean);
  useEffect(() => {
    if (!anyRolling || calm) return;
    const timer = window.setInterval(() => setFlick((f) => (f + 1) % 1000), 70);
    return () => window.clearInterval(timer);
  }, [anyRolling, calm]);
  return (
    <div className={styles.counter} role="img" aria-label={label} data-testid="cp-counter" data-digits={view.rolling.some(Boolean) ? '' : view.digits.join('')} data-reach={view.reach ? 'true' : 'false'} data-result={view.result ?? ''}>
      {view.digits.map((digit, place) => (
        <span key={place} className={styles.counterPlace} data-rolling={view.rolling[place] ? 'true' : 'false'}>
          <SegmentDisplay value={view.rolling[place] ? (calm ? '' : String((flick * 7 + place * 3) % 10)) : String(digit)} places={1} />
        </span>
      ))}
    </div>
  );
};

interface Stats {
  fed: number;
  back: number;
  spins: number;
  wins: number;
  jackpots: number;
}
const EMPTY_STATS: Stats = { fed: 0, back: 0, spins: 0, wins: 0, jackpots: 0 };

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys and its clock run only then. */
  active?: boolean;
}

/**
 * The machine: the carousel and its field under glass, the counter and its hold lamps, the dish's jackpot, the slot's
 * CREDIT, DROP and RETURN. What happens to the medals is the table's (medalTable.ts); this plays the machine a step at a
 * time while anything moves, lets it turn on its own while it stands still, and draws it.
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

  const [known, setKnown] = useState(false);
  const [credit, setCredit] = useState(0);
  const [stock, setStock] = useState(0);
  const [holds, setHolds] = useState(0);
  const [onField, setOnField] = useState(0);
  const [busyNow, setBusyNow] = useState(false);
  const [throwing, setThrowing] = useState(false);
  const [counter, setCounter] = useState<CounterView>(REST_COUNTER);
  const [held, setHeld] = useState(false);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [history, setHistory] = useState<{ id: number; outcome: OutcomeId; medals: number }[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [resting, setResting] = useState(true);

  const session = useRef<SessionRecord | null>(null);
  const table = useRef<Table | null>(null);
  const seat = useRef<Seat | null>(null);
  const stage = useRef<StageHandle | null>(null);
  const reopen = useRef(true);
  const frameId = useRef<number | null>(null);
  const loop = useRef<() => void>(() => undefined);
  const lastTime = useRef(0);
  const restingRef = useRef(true);
  const dirty = useRef(false);
  const lastSave = useRef(0);
  const lastCollect = useRef(0);
  const heldRef = useRef(false);
  const keyHeld = useRef(false);
  const pointerHeld = useRef<number | null>(null);
  const pressedAt = useRef(-Infinity);
  const historyId = useRef(0);
  const thrownSound = useRef(0);
  const playAreaRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const sound = useMachineSound();
  const { play, tick: chirp } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance) : null;
  const meter = useCountUp(medalsShown, chirp);
  const { pay: payMedals } = meter;

  /** What the panel shows of the session, after anything changed it. */
  const showSession = useCallback(() => {
    const s = session.current;
    const m = s?.machine;
    setCredit(s?.credit ?? 0);
    setStock(m?.stock ?? 0);
    setHolds(m?.holds ?? 0);
    setOnField(m?.ids.length ?? 0);
    setBusyNow(m ? busy(m) : false);
    setThrowing((m?.fling ?? 0) > 0);
  }, []);

  /** Shows the machine as it stands: the field drawn, the counter at its last spin's digits. */
  const showNow = useCallback(() => {
    const m = session.current?.machine;
    showSession();
    if (m) {
      stage.current?.field(m);
      if (m.spin) setCounter({ digits: m.spin.digits, rolling: [true, true, true], reach: false, result: null });
    }
  }, [showSession]);

  // ── Saving and paying in ──
  const save = useCallback((now: number) => {
    const tab = table.current;
    const s = session.current;
    if (!tab || !s) return;
    session.current = tab.save(s);
    dirty.current = false;
    lastSave.current = now;
  }, []);

  /** The tray counted into the player's medals. */
  const collect = useCallback(
    (now: number) => {
      const tab = table.current;
      const s = session.current;
      if (!tab || !s || s.machine.tray <= 0) return;
      const medals = s.machine.tray;
      const done = tab.collect(s);
      lastCollect.current = now;
      if (!done) return;
      session.current = done;
      lastSave.current = now;
      dirty.current = false;
      payMedals();
      setStats((st) => ({ ...st, back: st.back + medals }));
      if (!live.current.calm || medals > 2) play('payout');
    },
    [payMedals, play],
  );

  /** What a step did, heard and shown. Returns whether it wants the session written now. */
  const hear = useCallback(
    (events: readonly MachineEvent[], m: Machine): boolean => {
      const words = live.current.t;
      let saveNow = false;
      for (const e of events) {
        switch (e.type) {
          case 'deck':
            play('clack');
            break;
          case 'pocket':
            play('chucker');
            setMessage(e.held ? words.pocketHeld : words.pocketWasted);
            setAnnouncement(words.sayPocket);
            setHolds(m.holds);
            saveNow = true;
            break;
          case 'spin': {
            const spin: Spin = e.spin;
            play('reel');
            setCounter({ digits: spin.digits, rolling: [true, true, true], reach: false, result: null });
            setStats((st) => ({ ...st, spins: st.spins + 1 }));
            setHolds(m.holds);
            saveNow = true;
            break;
          }
          case 'stop': {
            const spin = m.spin;
            play('tick');
            setCounter((c) => {
              const rolling = [...c.rolling] as CounterView['rolling'];
              rolling[e.place] = false;
              const reach = e.place === 1 && c.digits[0] === c.digits[1];
              return { ...c, rolling, reach: c.reach || reach };
            });
            if (e.place === 1 && spin && spin.digits[0] === spin.digits[1]) {
              play('reach');
              setAnnouncement(words.status.reach.replace(/​/g, ''));
            }
            break;
          }
          case 'paid': {
            const id = OUTCOME_IDS[e.outcome];
            setCounter((c) => ({ ...c, rolling: [false, false, false], result: id }));
            if (e.medals > 0) {
              play(id === 'triple' ? 'big' : 'win');
              historyId.current += 1;
              const entry = { id: historyId.current, outcome: id, medals: e.medals };
              setHistory((h) => [entry, ...h].slice(0, HISTORY_LIMIT));
              setStats((st) => ({ ...st, wins: st.wins + 1 }));
              if (id === 'triple') floorReport(CAROUSEL_GAME, { prize: { medals: e.medals, label: 'carousel-triple' } });
            }
            setMessage(words.outcome(id, e.medals));
            const spin = m.spin;
            setAnnouncement(words.sayResult((spin?.digits ?? [0, 0, 0]).join(' '), id, e.medals));
            saveNow = true;
            break;
          }
          case 'jackpot':
            setCounter((c) => ({ ...c, rolling: [false, false, false], result: 'jackpot' }));
            play('fanfare');
            historyId.current += 1;
            setHistory((h) => [{ id: historyId.current, outcome: 'jackpot' as OutcomeId, medals: e.medals }, ...h].slice(0, HISTORY_LIMIT));
            setStats((st) => ({ ...st, wins: st.wins + 1, jackpots: st.jackpots + 1 }));
            setMessage(words.status.jackpot(e.medals).replace(/​/g, ''));
            setAnnouncement(words.sayJackpot(e.medals));
            setThrowing(true);
            floorReport(CAROUSEL_GAME, { prize: { medals: e.medals, label: 'carousel-jackpot' } });
            saveNow = true;
            break;
          case 'thrown':
            thrownSound.current += 1;
            if (thrownSound.current % 5 === 0 && !live.current.calm) play('drop');
            break;
          case 'stock':
            setStock(e.stock);
            break;
          case 'won':
          case 'lost':
            saveNow = true;
            break;
          default:
            break;
        }
      }
      return saveNow;
    },
    [play],
  );

  // ── The frame loop: the machine stepped on to now, what it did heard, the stage drawn; it stops once all is still ──
  const canRun = (): boolean => {
    const s = session.current;
    return s !== null && table.current !== null && (seat.current?.holding() ?? false) && activeRef.current && !s.pending;
  };

  const goIdle = useCallback(
    (now: number) => {
      const m = session.current?.machine;
      if (!m) return;
      save(now);
      stage.current?.field(m);
      stage.current?.turnAlone(m.step);
      restingRef.current = true;
      setResting(true);
      showSession();
    },
    [save, showSession],
  );

  const frame = useCallback(() => {
    frameId.current = null;
    const s = session.current;
    if (!s || !canRun()) return;
    const m = s.machine;
    const now = performance.now();
    let steps = Math.floor((now - lastTime.current) / STEP_MS);
    if (steps > MOST_STEPS) {
      steps = MOST_STEPS;
      lastTime.current = now - MOST_STEPS * STEP_MS;
    }
    if (steps < 0) {
      steps = 0;
      lastTime.current = now;
    }
    const events: MachineEvent[] = [];
    const before = m.ids.length;
    let moved = false;
    for (let i = 0; i < steps; i++) {
      // DROP held: a medal whenever the slot is free.
      if (heldRef.current && m.slotAt <= m.step) feedOne();
      stepMachine(m, LOTTERY, events);
      if (m.quiet === 0) moved = true;
    }
    lastTime.current += steps * STEP_MS;
    if (steps > 0) dirty.current = true;
    const wantSave = hear(events, m);
    if (m.ids.length !== before) moved = true;
    if (m.tray > 0 && (now - lastCollect.current >= COLLECT_EVERY || !busy(m))) collect(now);
    if (session.current && (wantSave || (dirty.current && now - lastSave.current >= SAVE_EVERY))) save(now);
    const frac = Math.min(1, Math.max(0, (now - lastTime.current) / STEP_MS));
    stage.current?.frame(m, frac, moved);
    if (events.length > 0) showSession();
    const current = session.current;
    if (current && !heldRef.current && atRest(current.machine) && current.machine.tray === 0 && !current.pending) {
      goIdle(now);
      return;
    }
    frameId.current = window.requestAnimationFrame(() => loop.current());
    // `feedOne` is defined below; it reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collect, goIdle, hear, save, showSession]);
  useEffect(() => {
    loop.current = frame;
  }, [frame]);

  /** Sets the machine going: turned on as far as it turned on its own, and stepped from now. */
  const wake = useCallback(() => {
    const m = session.current?.machine;
    if (!m) return;
    if (restingRef.current) {
      const turned = stage.current?.stopTurning() ?? 0;
      idle(m, turned);
      restingRef.current = false;
      setResting(false);
      lastTime.current = performance.now();
    }
    if (frameId.current === null && canRun()) {
      lastTime.current = Math.max(lastTime.current, performance.now() - STEP_MS);
      frameId.current = window.requestAnimationFrame(() => loop.current());
    }
  }, []);

  /** Stops the machine where it is: the card has gone, or its tab is not shown. */
  const halt = useCallback(() => {
    if (frameId.current !== null) {
      window.cancelAnimationFrame(frameId.current);
      frameId.current = null;
    }
    const m = session.current?.machine;
    if (m && restingRef.current) {
      const turned = stage.current?.stopTurning() ?? 0;
      idle(m, turned);
    }
    restingRef.current = true;
    setResting(true);
  }, []);

  /** The session read again, as a page that has just taken the card finds it. */
  const open = useCallback(() => {
    const tab = table.current;
    if (!tab) return;
    halt();
    session.current = tab.session();
    reopen.current = false;
    setKnown(session.current !== null);
    showNow();
    const m = session.current?.machine;
    if (m) {
      lastTime.current = performance.now();
      if (atRest(m) && m.tray === 0) {
        stage.current?.turnAlone(m.step);
        restingRef.current = true;
        setResting(true);
      } else {
        restingRef.current = false;
        setResting(false);
        wake();
      }
    }
  }, [halt, showNow, wake]);

  /** Lets go of DROP: the page or the tab has gone from under the player's hand. */
  const letGo = useCallback(() => {
    heldRef.current = false;
    keyHeld.current = false;
    pointerHeld.current = null;
    setHeld(false);
  }, []);

  const canPlay = mine && here && known;

  /**
   * One medal from the slot into the machine; when the slot is empty, a handful of the player's medals into it first.
   * Its three random numbers are drawn here, in the press (a test chooses them by queueing the numbers).
   */
  function feedOne(): boolean {
    const tab = table.current;
    let s = session.current;
    if (!tab || !s || s.pending) return false;
    const m = s.machine;
    if (m.slotAt > m.step + SLOT_QUEUE * TIMES.gap) return false;
    if (s.credit < 1) {
      const words = live.current.t;
      const lent = tab.lend(s);
      session.current = s = lent.record;
      if (lent.outcome === 'short') {
        setMessage(words.notEnough);
        letGo();
        return false;
      }
      if (lent.outcome === 'unsaved') {
        setMessage(words.unsaved);
        letGo();
        return false;
      }
      if (lent.outcome !== 'lent') return false;
      setAnnouncement(words.sayLent(s.credit));
      lastSave.current = performance.now();
    }
    const u = Math.random();
    const v = Math.random();
    const ticket = Math.random();
    if (!tab.feed(s, u, v, ticket)) return false;
    dirty.current = true;
    play('medal');
    setStats((st) => ({ ...st, fed: st.fed + 1 }));
    setCredit(s.credit);
    return true;
  }

  /** A press of DROP: a medal now, and more while it is held. */
  const press = (holdOn: boolean): boolean => {
    if (!canPlay || !session.current) return false;
    pressedAt.current = performance.now();
    wake();
    const fed = feedOne();
    if (fed) {
      setMessage('');
      bringIntoView(playAreaRef.current);
    }
    if (holdOn && (fed || (session.current?.credit ?? 0) > 0)) {
      heldRef.current = true;
      setHeld(true);
    }
    wake();
    return fed;
  };
  const release = () => {
    if (!heldRef.current) return;
    letGo();
  };

  const giveBack = () => {
    const tab = table.current;
    const s = session.current;
    if (!tab || !s || !canPlay || s.credit <= 0) return;
    letGo();
    const medals = s.credit;
    const done = tab.giveBack(s);
    if (!done) return;
    session.current = done;
    payMedals();
    play('payout');
    setMessage(live.current.t.returned(medals));
    setAnnouncement(live.current.t.returned(medals).replace(/​/g, ''));
    showSession();
    wake();
  };

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback(
    (said: boolean) => {
      letGo();
      halt();
      table.current?.clear();
      session.current = null;
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      setCounter(REST_COUNTER);
      medalBank().restarted(CAROUSEL_GAME);
      reopen.current = true;
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [halt, letGo],
  );

  // The machine's place at the medal center: it asks for the card as it is set up, and plays the player's medals while
  // it holds it. As the card goes, the session is written down and the tray counted in.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => roundId(Date.now(), nameRandom),
    });
    const yielding = () => {
      const now = performance.now();
      heldRef.current = false;
      collect(now);
      save(now);
      halt();
      reopen.current = true;
      setHeld(false);
    };
    const placed = purse.sit(CAROUSEL_GAME, { granted: () => undefined, yielding });
    seat.current = placed;
    const sync = () => {
      const state = purse.getState();
      const { player: who } = live.current;
      if (!placed.holding() || !state.loaded || !who.settled || state.owner !== who.uid) return;
      if (purse.restartDue(CAROUSEL_GAME)) startOver(false);
      if (reopen.current || (session.current && session.current.owner !== state.owner)) {
        open();
        return;
      }
      // A session another page left half-made, squared here: never while this page is moving medals itself.
      const left = table.current?.leftover();
      if (left) {
        session.current = left;
        showNow();
      }
    };
    const unsubscribe = purse.subscribe(sync);
    const unlisten = purse.listen((event) => {
      if (event.type === 'reset') startOver(true);
      else if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    sync();
    return () => {
      unlisten();
      unsubscribe();
      placed.leave();
      if (seat.current === placed) seat.current = null;
      table.current = null;
    };
  }, [collect, halt, open, save, showNow, startOver]);

  // Signed in or out: the session is the new player's, read when the card is here for them.
  useEffect(() => {
    reopen.current = true;
  }, [player.uid]);
  useEffect(() => {
    if (mine && here && reopen.current) open();
  }, [mine, here, open]);

  // While the machine is not on show (its Odds tab, or its help, in front of it), it stops and DROP is let go; it goes
  // on from the same point when it is shown again.
  useEffect(() => {
    if (active) {
      const m = session.current?.machine;
      if (m && seat.current?.holding()) {
        if (atRest(m) && m.tray === 0) {
          stage.current?.turnAlone(m.step);
          restingRef.current = true;
          setResting(true);
        } else wake();
      }
    } else {
      save(performance.now());
      // The machine stopped as it is put out of sight: a state of the page's own, not an echo of React's.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      halt();
      letGo();
    }
  }, [active, halt, letGo, save, wake]);

  useEffect(
    () => () => {
      if (frameId.current !== null) window.cancelAnimationFrame(frameId.current);
    },
    [],
  );
  // The page going away writes the session down where it stands.
  useEffect(() => {
    const away = () => save(performance.now());
    window.addEventListener('pagehide', away);
    return () => window.removeEventListener('pagehide', away);
  }, [save]);

  // ── Keys: Space (held: more) drops; R gives back the credit ──
  useMachineKeys(active, (key) => {
    if (key === ' ') {
      if (press(true)) keyHeld.current = true;
    } else if (key === 'r') giveBack();
    else return false;
    return true;
  });
  useEffect(() => {
    if (!active) return;
    const up = (event: KeyboardEvent) => {
      if (keyName(event.key) !== ' ' || !keyHeld.current) return;
      if (!forTheMachine({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, isComposing: event.isComposing, target: event.target })) return;
      keyHeld.current = false;
      event.preventDefault();
      release();
    };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  });
  useEffect(() => {
    window.addEventListener('blur', letGo);
    return () => window.removeEventListener('blur', letGo);
  }, [letGo]);

  // ── DROP's own presses: a finger or the mouse holds it; Space or Enter on it does the same ──
  const onDropDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (!press(true)) return;
    pointerHeld.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still lets go over the button.
    }
  };
  const onDropUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerHeld.current !== event.pointerId) return;
    pointerHeld.current = null;
    release();
  };
  const onDropCancel = () => {
    if (pointerHeld.current === null) return;
    letGo();
  };
  const onDropKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat && press(true)) keyHeld.current = true;
  };
  const onDropKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!keyHeld.current) return;
    keyHeld.current = false;
    release();
  };
  /** A click that came with no press of its own (a screen reader's): one medal. */
  const onDropClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || performance.now() - pressedAt.current < 600) return;
    press(false);
  };

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

  // ── What is on the panel ──
  const best = PUBLISHED_CAROUSEL.ways.timed.return;
  const idleOut = mine && here && known && bankState.balance === 0 && credit === 0 && !busyNow;
  const refillDue = idleOut && bankState.out.length === 0;
  const rollingNow = counter.rolling.some(Boolean);
  const statusText = (() => {
    const s = t.status;
    if (throwing) return s.throwing;
    if (rollingNow && counter.reach) return s.reach;
    if (rollingNow) return s.spinning;
    if (idleOut) return t.outOfMedals;
    if (holds >= HOLD_MAX) return s.full;
    if (credit === 0) return s.empty;
    return s.ready;
  })();
  const observed = stats.fed > 0 ? stats.back / stats.fed : null;
  const stageLabel = t.stageLabel(onField, stock);

  return (
    <div
      className={styles.machine}
      data-testid="cp-machine"
      data-playable={canPlay ? 'true' : 'false'}
      data-card={bankState.card}
      data-credit={credit}
      data-holds={holds}
      data-stock={stock}
      data-held={held ? 'true' : 'false'}
      data-resting={resting ? 'true' : 'false'}
      data-throwing={throwing ? 'true' : 'false'}
      data-jackpots={stats.jackpots}
      data-wins={stats.wins}
    >
      <div className={styles.cabinet}>
        <div className={styles.sign} aria-hidden="true">
          <span className={styles.signMain}>{t.sign}</span>
          <span className={styles.signSub} lang={language}>
            {t.signSub}
          </span>
        </div>

        <div className={styles.playArea} ref={playAreaRef}>
          {/* The back panel: the counter and its hold lamps, the dish's jackpot, and what the counter pays. */}
          <div className={styles.backPanel} data-testid="cp-panel">
            <div className={styles.counterBox}>
              <Counter view={counter} calm={calm} label={t.counterLabel(rollingNow ? '…' : counter.digits.join(' '))} />
              <ol className={styles.holdLamps} aria-label={t.holdLamps(holds)} data-testid="cp-holds">
                {Array.from({ length: HOLD_MAX }, (_, i) => (
                  <li key={i} className={styles.holdLamp} data-lit={i < holds ? 'true' : 'false'} />
                ))}
              </ol>
            </div>
            <div className={styles.jackpotBox}>
              <span className={styles.jackpotLabel}>{t.stock}</span>
              <span className={styles.meterValue} data-testid="cp-stock">
                {fmt(stock)}
              </span>
              <span className={styles.jackpotLed} aria-hidden="true">
                <SegmentDisplay value={stock} places={STOCK_PLACES} tone="amber" />
              </span>
            </div>
            <ul className={styles.paytable} aria-label={t.paytableLabel}>
              {t.paytable.map((row) => (
                <li key={row.id} className={styles.payRow} data-outcome={row.id} aria-hidden="true">
                  <span className={styles.payShows}>{row.shows}</span>
                  <span className={styles.payPays}>{row.pays}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.stageBox} style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}>
            <Stage handle={stage} label={stageLabel} initial={() => session.current?.machine ?? null} calm={calm} testId="cp-stage" />
          </div>

          <p className={styles.status} data-testid="cp-status">
            <span>
              <Phrases text={statusText} />
            </span>
          </p>

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.dropButton}
              data-testid="cp-drop"
              data-held={held ? 'true' : 'false'}
              aria-label={t.dropAria}
              disabled={!canPlay || (credit === 0 && bankState.balance <= 0)}
              onPointerDown={onDropDown}
              onPointerUp={onDropUp}
              onPointerCancel={onDropCancel}
              onLostPointerCapture={onDropCancel}
              onKeyDown={onDropKeyDown}
              onKeyUp={onDropKeyUp}
              onClick={onDropClick}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.dropWords}>{t.drop}</span>
              <span className={styles.dropSmall}>{t.dropSmall}</span>
            </button>
            <button type="button" className={styles.returnButton} data-testid="cp-return" aria-label={t.giveBackAria} onClick={giveBack} disabled={!canPlay || credit <= 0}>
              {t.giveBack}
            </button>
          </div>
        </div>

        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="cp-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="cp-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.credit}</span>
            <span className={styles.meterValue} data-testid="cp-credit">
              {fmt(credit)}
            </span>
            <span className={styles.led} aria-hidden="true">
              <SegmentDisplay value={credit} places={CREDIT_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="cp-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="cp-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {idleOut && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="cp-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="cp-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="cp-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="cp-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="cp-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="cp-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="cp-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="cp-history-title">
          <h2 id="cp-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="cp-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-outcome={entry.outcome}>
                  {t.historyEntry(entry.outcome, entry.medals)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="cp-session-title">
          <h2 id="cp-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.fed}</dt>
              <dd data-testid="cp-stat-fed">{fmt(stats.fed)}</dd>
            </div>
            <div>
              <dt>{t.back}</dt>
              <dd data-testid="cp-stat-back">{fmt(stats.back)}</dd>
            </div>
            <div>
              <dt>{t.spins}</dt>
              <dd data-testid="cp-stat-spins">{fmt(stats.spins)}</dd>
            </div>
            <div>
              <dt>{t.wins}</dt>
              <dd>{fmt(stats.wins)}</dd>
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
              <dt>{t.bestBack}</dt>
              <dd>{pct(best, 1)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="cp-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
