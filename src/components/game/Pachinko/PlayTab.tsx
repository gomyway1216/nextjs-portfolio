'use client';

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
import { valueOf } from './analysis';
import { Board } from './Board';
import { drawMoving, drawStill, type BoardLook } from './draw';
import {
  BALLS_PER_MEDAL,
  DEFAULT_STRENGTH,
  FIRST_RIGHT,
  HOLDS,
  LEND_MEDALS,
  SLOT_MS,
  STRENGTHS,
  attackerOpen,
  busy,
  drawBall,
  helping,
  hitKindOf,
  type HitKind,
  type Machine,
  type Mode,
  type Pocket,
  type SpinKind,
  type Tick,
} from './engine';
import { getStrings } from './i18n';
import { PACHINKO_GAME, QUEUE, createTable, roundId, sameSkip, skippable, type SessionRecord, type Slot, type Table } from './medalTable';
import { PUBLISHED_PACHINKO_ODDS } from './published';
import { BOARD_H, BOARD_W, FLIGHT_MS, ballAt, createMachineClock, reelFaces, wayOf, type Point, type Way } from './scene';
import selectStyles from '../common/select.module.css';
import styles from './Pachinko.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), and the balls. */
export const MEDAL_PLACES = 7;
export const BALL_PLACES = 6;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
const HISTORY_LIMIT = 12;
/** Where the handle's strength is kept on this device between visits. */
export const STRENGTH_KEY = 'pachinko-handle-v1';

/** This device's storage for the machine: the session, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a round's name, from the browser's crypto: Math.random is the draw's alone. */
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

/** What the machine is shown doing: the rules' state a ball's flight behind (scene.ts `FLIGHT_MS`). */
export interface Shown {
  mode: Mode;
  left: number;
  h1: number;
  h2: number;
  /** The spin running, as far as it is shown: its kind and phase, and the lanterns it shows. */
  spin: { kind: SpinKind; phase: number; mode: Mode } | null;
  faces: [number, number, number];
  /** Whether the faces are those of a hit just stopped. */
  won: HitKind | null;
  bonus: { stage: 'fanfare' | 'open' | 'interval' | 'ending'; round: number; rounds: number; count: number } | null;
  rush: number;
}
const REST_FACES: [number, number, number] = [7, 3, 5];
const shownOf = (m: Machine, faces: [number, number, number], won: HitKind | null): Shown => ({
  mode: m.mode,
  left: m.left,
  h1: m.q1.length,
  h2: m.q2.length,
  spin: m.spin ? { kind: m.spin.kind, phase: m.spin.phase, mode: m.spin.mode } : null,
  faces,
  won: m.spin ? null : won,
  bonus: m.bonus ? { stage: m.bonus.stage, round: m.bonus.round, rounds: m.bonus.kind.rounds, count: m.bonus.count } : null,
  rush: m.rush?.hits ?? 0,
});
const EMPTY_SHOWN: Shown = { mode: 'normal', left: 0, h1: 0, h2: 0, spin: null, faces: REST_FACES, won: null, bonus: null, rush: 0 };

/** A ball on its way, and what is shown as it comes to its pocket. */
interface Flying {
  way: Way;
  /** The machine's moment it was fired, in ms. */
  at: number;
}
/** What the page shows a slot's flight after it: the machine as it stood, and what happened. */
interface Due {
  at: number;
  machine: Machine;
  ticks: Tick[];
  ball: Slot['ball'];
}

interface SessionStats {
  lent: number;
  counted: number;
  fired: number;
  paid: number;
  spins: number;
  hits: number;
}
const EMPTY_STATS: SessionStats = { lent: 0, counted: 0, fired: 0, paid: 0, spins: 0, hits: 0 };

const POCKET_SOUND: Readonly<Record<Pocket, MachineSound | null>> = { heso: 'chucker', side: 'pocket', denchu: 'tulip', attacker: 'catch', out: null };

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

/**
 * An element's box; where it has none of its own (held sideways, the play area gives way to its parts, which the
 * cabinet lays out in two columns: Pachinko.module.css), the box round its parts.
 */
function boxOf(area: HTMLElement): { top: number; bottom: number; height: number } {
  const own = area.getBoundingClientRect();
  if (own.width > 0 || own.height > 0) return own;
  const parts = [...area.children].map((part) => part.getBoundingClientRect()).filter((box) => box.width > 0 || box.height > 0);
  if (parts.length === 0) return own;
  const top = Math.min(...parts.map((box) => box.top));
  const bottom = Math.max(...parts.map((box) => box.bottom));
  return { top, bottom, height: bottom - top };
}

/**
 * Brings the board, the status line and the handle wholly on screen under the site's toolbar, on the next frame (a
 * smooth scroll begun in the press itself was dropped by the browser: MedalCenter/lookUp.ts). Where they are on screen
 * already, nothing moves.
 */
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

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys and its clock run only then. */
  active?: boolean;
}

/**
 * The machine: the board under its glass, its screen and hold lamps, the handle, LEND, COUNT and Skip. What happens to
 * the medals is the table's (medalTable.ts); this fires a ball every slot while the handle is held, shows the machine a
 * ball's flight behind the rules, and draws the board.
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

  const [shown, setShown] = useState<Shown>(EMPTY_SHOWN);
  const [tray, setTray] = useState(0);
  const [known, setKnown] = useState(false);
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [held, setHeld] = useState(false);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [history, setHistory] = useState<{ id: number; kind: HitKind }[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [canSkip, setCanSkip] = useState(false);
  const [credit, setCredit] = useState(false);
  const [clock] = useState(() => createMachineClock(() => performance.now()));

  const session = useRef<SessionRecord | null>(null);
  const table = useRef<Table | null>(null);
  const seat = useRef<Seat | null>(null);
  const reopen = useRef(true);
  /** Whether the session is to be read again as it stands, a hit and all, as the card comes back from a moment's loan. */
  const reread = useRef(false);
  const nextSlot = useRef<number | null>(null);
  const flying = useRef<Flying[]>([]);
  const due = useRef<Due[]>([]);
  const inFlight = useRef(0);
  const facesRef = useRef<[number, number, number]>(REST_FACES);
  const wonRef = useRef<HitKind | null>(null);
  const heldRef = useRef(false);
  const keyHeld = useRef(false);
  const pointerHeld = useRef<number | null>(null);
  const strengthRef = useRef(DEFAULT_STRENGTH);
  const frameId = useRef<number | null>(null);
  /** The frame loop as it stands now (`frame`), called by each frame it asks for. */
  const loop = useRef<() => void>(() => undefined);
  const ballCount = useRef(0);
  const historyId = useRef(0);
  const tulipAt = useRef(-Infinity);
  const windmill = useRef(0);
  const lastPaint = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const still = useRef<{ canvas: HTMLCanvasElement; width: number } | null>(null);
  const playAreaRef = useRef<HTMLDivElement | null>(null);
  const shownRef = useRef<Shown>(EMPTY_SHOWN);
  /** The rules' state the screen shows now (a ball's flight behind the rules): what Skip cuts short. */
  const shownMachine = useRef<Machine | null>(null);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);
  useEffect(() => {
    strengthRef.current = strength;
  }, [strength]);
  // The handle stays where it was turned, as a cabinet's does between visits: kept on this device, read once the page is up.
  useEffect(() => {
    try {
      const kept = Number(window.localStorage.getItem(STRENGTH_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isInteger(kept) && kept >= 0 && kept < STRENGTHS && window.localStorage.getItem(STRENGTH_KEY) !== null) setStrength(kept);
    } catch {
      // Storage that cannot be read leaves the handle at its start.
    }
  }, []);

  const sound = useMachineSound();
  const { play, tick: chirp } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance) : null;
  const meter = useCountUp(medalsShown, chirp);
  const { pay: payMedals } = meter;

  /** The tray as shown: the balls in it now, less those still on their way to a pocket that pays. */
  const showTray = useCallback(() => setTray(Math.max(0, (session.current?.tray ?? 0) - inFlight.current)), []);

  /** Shows the machine as it stands now, every flight cut short: after a skip, a page given back the card, a reset. */
  const showNow = useCallback(() => {
    flying.current = [];
    due.current = [];
    inFlight.current = 0;
    const m = session.current?.machine;
    const next = m ? shownOf(m, facesRef.current, wonRef.current) : EMPTY_SHOWN;
    shownRef.current = next;
    shownMachine.current = m ?? null;
    setShown(next);
    setCanSkip(m ? skippable(m) : false);
    showTray();
  }, [showTray]);

  // ── Painting the board ──
  const paint = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.width;
      const scale = width / BOARD_W;
      if (!still.current || still.current.width !== width) {
        const layer = document.createElement('canvas');
        layer.width = width;
        layer.height = canvas.height;
        const sctx = layer.getContext('2d');
        if (sctx) drawStill(sctx, scale);
        still.current = { canvas: layer, width };
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(still.current.canvas, 0, 0);
      const s = shownRef.current;
      const balls: Point[] = [];
      const calmNow = live.current.calm;
      for (const ball of flying.current) {
        const k = (now - ball.at) / FLIGHT_MS;
        if (k >= 1 || k < 0) continue;
        if (calmNow && k < 0.8) continue;
        balls.push(ballAt(ball.way, k));
      }
      const dt = Math.min(100, Math.max(0, now - lastPaint.current));
      lastPaint.current = now;
      if (balls.length > 0 && !calmNow) windmill.current += dt * 0.006;
      const tulipOpen = helping(s.mode) && s.bonus === null;
      const look: BoardLook = {
        tulip: tulipOpen ? (now - tulipAt.current < 260 ? 1 : 0.55) : 0,
        attacker: s.bonus?.stage === 'open' ? 1 : 0,
        windmill: windmill.current,
        lamps: calmNow ? 'off' : s.bonus || s.won ? 'hit' : s.spin && s.spin.kind !== 'plain' && s.spin.phase >= 1 ? 'reach' : 'off',
        at: now,
      };
      drawMoving(ctx, scale, look, balls);
    },
    [],
  );

  // ── The slots ──
  /** Whether the machine has slots to run: the handle held with a ball to fire, or a spin, holds or a hit to come. */
  const running = (): boolean => {
    const s = session.current;
    if (!s) return false;
    return (heldRef.current && (s.tray > 0 || attackerOpen(s.machine))) || busy(s.machine);
  };

  /** What a slot did, shown a flight after it. */
  const showDue = useCallback(
    (d: Due) => {
      const words = live.current.t;
      if (d.ball) {
        inFlight.current = Math.max(0, inFlight.current - d.ball.fired.paid);
        const s = POCKET_SOUND[d.ball.fired.pocket];
        if (s) play(s);
        if (d.ball.fired.pocket === 'denchu') tulipAt.current = clock.now();
        if (d.ball.fired.paid > 0) setStats((st) => ({ ...st, paid: st.paid + d.ball!.fired.paid }));
      }
      let won: HitKind | null = wonRef.current;
      for (const tk of d.ticks) {
        if (tk.type === 'start') {
          won = null;
          setStats((st) => ({ ...st, spins: st.spins + 1 }));
        } else if (tk.type === 'phase' && tk.spin.kind !== 'plain' && tk.spin.phase === 1) {
          const hit = tk.spin.hit ? hitKindOf(tk.spin.from, tk.spin.hold.split) : null;
          const [l, , r] = reelFaces(tk.spin.hold.seed, hit, true);
          facesRef.current = [l, facesRef.current[1], r];
          play('reach');
          setAnnouncement(words.sayReach);
        } else if (tk.type === 'stop') {
          facesRef.current = reelFaces(tk.spin.hold.seed, tk.kind, tk.spin.kind !== 'plain');
          if (tk.kind) {
            won = tk.kind;
            const kind = tk.kind;
            play('fanfare');
            setAnnouncement(words.sayHit(kind));
            setStats((st) => ({ ...st, hits: st.hits + 1 }));
            historyId.current += 1;
            const id = historyId.current;
            setHistory((h) => [{ id, kind }, ...h].slice(0, HISTORY_LIMIT));
          } else play('reel');
        } else if (tk.type === 'open') play('bell');
        else if (tk.type === 'end') play('win');
        else if (tk.type === 'mode') setAnnouncement(words.sayMode(tk.mode));
      }
      wonRef.current = won;
      const next = shownOf(d.machine, facesRef.current, won);
      shownRef.current = next;
      shownMachine.current = d.machine;
      setShown(next);
      setCanSkip(skippable(d.machine));
      showTray();
    },
    [clock, play, showTray],
  );

  /** One slot of the machine at machine time `at`: the ball (if the handle is held), then the machine. Written down first. */
  const runSlot = useCallback(
    (at: number) => {
      const tab = table.current;
      const s = session.current;
      if (!tab || !s) return;
      const done = tab.step(heldRef.current ? strengthRef.current : null, s);
      if (!done) return;
      session.current = done.record;
      const ball = done.slot.ball;
      if (ball) {
        ballCount.current += 1;
        flying.current.push({ way: wayOf(ball.strength, ball.fired.pocket, ball.draw.fate, ballCount.current), at });
        inFlight.current += ball.fired.paid;
        if (!live.current.calm) play('pachi');
        setStats((st) => ({ ...st, fired: st.fired + 1 }));
        setCredit(ball.credit);
      }
      due.current.push({ at: at + FLIGHT_MS, machine: done.record.machine, ticks: done.slot.ticks, ball });
      showTray();
    },
    [play, showTray],
  );

  /** The frame loop: slots due, what is due to be shown, and the board painted; it stops once nothing moves. */
  const frame = useCallback(() => {
    frameId.current = null;
    const now = clock.now();
    if (!clock.paused()) {
      let ran = 0;
      while (nextSlot.current !== null && now >= nextSlot.current && ran < 8) {
        runSlot(nextSlot.current);
        ran += 1;
        nextSlot.current = running() ? nextSlot.current + SLOT_MS : null;
      }
      // A page that fell far behind (a slow phone) catches up from now, not slot by slot from long ago.
      if (nextSlot.current !== null && now - nextSlot.current > 4 * SLOT_MS) nextSlot.current = now;
      while (due.current.length > 0 && due.current[0].at <= now) showDue(due.current.shift()!);
      flying.current = flying.current.filter((ball) => now - ball.at < FLIGHT_MS);
    }
    paint(now);
    const moving = nextSlot.current !== null || due.current.length > 0 || flying.current.length > 0 || (shownRef.current.bonus !== null && !live.current.calm) || (shownRef.current.spin !== null && !live.current.calm);
    if (moving && !clock.paused()) frameId.current = window.requestAnimationFrame(() => loop.current());
  }, [clock, paint, runSlot, showDue]);
  useEffect(() => {
    loop.current = frame;
  }, [frame]);

  /** Sets the machine going: its slots from now, and the frame loop. */
  const kick = useCallback(() => {
    if (nextSlot.current === null && running()) nextSlot.current = clock.now();
    if (frameId.current === null && typeof window !== 'undefined') frameId.current = window.requestAnimationFrame(() => loop.current());
  }, [clock]);

  /** The session read again, as a page that has just taken the card finds it: a hit left behind played out, and said. */
  const open = useCallback(() => {
    const tab = table.current;
    if (!tab) return;
    const found = tab.open();
    session.current = found;
    reopen.current = false;
    reread.current = false;
    setKnown(true);
    if (found?.away) {
      setMessage(live.current.t.away(found.away.rounds, found.away.balls));
      tab.told();
      session.current = tab.session();
    }
    showNow();
    kick();
  }, [kick, showNow]);

  /** The session read again as the card comes back from a moment's loan: as it stands, a hit going on where it was. */
  const resume = useCallback(() => {
    const tab = table.current;
    if (!tab) return;
    reread.current = false;
    session.current = tab.session();
    showNow();
    kick();
  }, [kick, showNow]);

  /** Lets go of the handle without a ball more: the page or the tab has gone from under the player's hand. */
  const letGo = useCallback(() => {
    heldRef.current = false;
    keyHeld.current = false;
    pointerHeld.current = null;
    setHeld(false);
  }, []);

  /** Draws the balls to come, in a press, and hands them to the table: a test chooses them by queueing the numbers. */
  const drawAhead = (): ReturnType<typeof drawBall>[] => {
    const need = Math.max(0, QUEUE - (session.current?.queue.length ?? 0));
    return Array.from({ length: need }, () => drawBall(Math.random));
  };

  const canPlay = mine && here && known;

  /** The handle taken hold of: a ball every slot from now, while there is one to fire. */
  const hold = () => {
    const tab = table.current;
    if (!tab || !canPlay || heldRef.current || clock.paused()) return false;
    const s = session.current;
    if (!s || (s.tray <= 0 && !attackerOpen(s.machine))) {
      setMessage(live.current.t.status.noBalls);
      return false;
    }
    tab.topUp(drawAhead());
    session.current = tab.session() ?? session.current;
    heldRef.current = true;
    setHeld(true);
    setMessage('');
    bringIntoView(playAreaRef.current);
    kick();
    return true;
  };
  const release = () => {
    if (!heldRef.current) return;
    letGo();
  };

  const lend = () => {
    const tab = table.current;
    if (!tab || !canPlay) return;
    const draws = drawAhead();
    const outcome = tab.lend(draws);
    const words = live.current.t;
    if (outcome === 'short') setMessage(words.notEnough);
    else if (outcome === 'unsaved') setMessage(words.unsaved);
    if (outcome !== 'lent') return;
    session.current = tab.session();
    play('medal');
    setMessage('');
    setStats((st) => ({ ...st, lent: st.lent + LEND_MEDALS }));
    setAnnouncement(words.sayLent);
    showTray();
    bringIntoView(playAreaRef.current);
    kick();
  };

  const count = () => {
    const tab = table.current;
    if (!tab || !canPlay) return;
    const words = live.current.t;
    if (session.current?.machine.bonus) {
      setMessage(words.noCountInHit);
      return;
    }
    const medals = tab.count();
    if (medals === null) {
      setMessage(words.nothingToCount);
      return;
    }
    session.current = tab.session();
    payMedals();
    play('payout');
    setStats((st) => ({ ...st, counted: st.counted + medals }));
    setMessage(words.counted(medals));
    setAnnouncement(words.sayCounted(medals));
    showTray();
  };

  /** Skip: a reach, the fanfare, or the wait between rounds cut short. It never fires a ball. */
  const skip = () => {
    const tab = table.current;
    const s = session.current;
    if (!tab || !s) return;
    const onScreen = shownMachine.current;
    if (!onScreen || !skippable(onScreen)) return;
    // What Skip cuts short is what the screen shows, a ball's flight behind the rules. Where the rules have already
    // gone past it (the reach shown has stopped, the fanfare shown is over), the screen is brought up to them and
    // nothing more is cut: a hit's fanfare is not cut short by a press on the reach before it.
    if (!sameSkip(onScreen, s.machine)) {
      for (const d of due.current) showDue(d);
      due.current = [];
      return;
    }
    const done = tab.skip(s);
    if (!done) return;
    session.current = done.record;
    // Everything waiting to be shown is shown now, the skip's own end with it.
    for (const d of due.current) showDue(d);
    due.current = [];
    showDue({ at: clock.now(), machine: done.record.machine, ticks: done.ticks, ball: null });
    nextSlot.current = running() ? clock.now() + SLOT_MS : null;
    kick();
  };

  const turn = (by: number) => setTo(strengthRef.current + by);
  /** Turns the handle to strength `to` (kept within the gauge), and keeps it there for the next visit. */
  const setTo = (to: number) => {
    setStrength((s) => {
      const next = Math.min(STRENGTHS - 1, Math.max(0, Number.isInteger(to) ? to : s));
      strengthRef.current = next;
      try {
        window.localStorage.setItem(STRENGTH_KEY, String(next));
      } catch {
        // Kept for this visit only.
      }
      if (next !== s) {
        play('ratchet');
        setAnnouncement(live.current.t.sayStrength(next, next >= FIRST_RIGHT));
      }
      return next;
    });
  };

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback(
    (said: boolean) => {
      letGo();
      table.current?.clear();
      session.current = null;
      nextSlot.current = null;
      facesRef.current = REST_FACES;
      wonRef.current = null;
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      showNow();
      medalBank().restarted(PACHINKO_GAME);
      reopen.current = true;
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [letGo, showNow],
  );

  // The machine's place at the medal center: it asks for the card as it is set up, and plays the player's medals while
  // it holds it. As the card goes with the page (hidden, left or reloaded), a hit's rounds still to come are played out
  // at once, and the page is shown them. A moment's loan of the card (the medal center's front in another window taking
  // the day's bonus, a floor jackpot paid in there, another tab's machine starting) leaves the machine as it is: no slot
  // runs without the card, the hit goes on where it was as the card comes back, or, kept by another tab's machine, the
  // page of this machine that holds the card first plays its rounds out (`open`).
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => roundId(Date.now(), nameRandom),
      random: Math.random,
      draw: drawBall,
    });
    const yielding = (why: 'moment' | 'hidden' | 'left') => {
      const tab = table.current;
      if (!tab) return;
      if (why === 'moment') {
        nextSlot.current = null;
        reread.current = true;
        return;
      }
      heldRef.current = false;
      // A hit's rounds still to come are played out now; the note that says so is shown when the card comes back (`open`),
      // here or on the next page.
      const left = tab.leaving();
      if (left) session.current = left;
      nextSlot.current = null;
      reopen.current = true;
      setHeld(false);
      showNow();
    };
    const placed = purse.sit(PACHINKO_GAME, { granted: () => undefined, yielding });
    seat.current = placed;
    const sync = () => {
      const state = purse.getState();
      const { player: who } = live.current;
      if (!placed.holding() || !state.loaded || !who.settled || state.owner !== who.uid) return;
      if (purse.restartDue(PACHINKO_GAME)) startOver(false);
      if (reopen.current || (session.current && session.current.owner !== state.owner)) open();
      else if (reread.current) resume();
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
  }, [open, resume, showNow, startOver]);

  // Signed in or out: the session is the new player's, read when the card is here for them.
  useEffect(() => {
    reopen.current = true;
  }, [player.uid]);
  useEffect(() => {
    if (mine && here && reopen.current) open();
    else if (mine && here && reread.current) resume();
  }, [mine, here, open, resume]);

  // While the machine is not on show (its Odds tab, or its help, in front of it), its clock stops and the handle is let
  // go; it goes on from the same point when it is shown again.
  useEffect(() => {
    if (active) {
      clock.resume();
      kick();
    } else {
      clock.pause();
      // The handle is let go as the machine is put out of sight: a state of the page's own, not an echo of React's.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      letGo();
    }
  }, [active, clock, kick, letGo]);

  // The canvas is as many pixels as it is shown at, and painted again when what it shows changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round((width * BOARD_H) / BOARD_W));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        still.current = null;
      }
      paint(clock.now());
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(fit);
    watch.observe(canvas);
    return () => watch.disconnect();
  }, [clock, paint]);
  useEffect(() => {
    paint(clock.now());
    if (shown.spin || shown.bonus) kick();
  }, [shown, clock, paint, kick]);

  useEffect(
    () => () => {
      if (frameId.current !== null) window.cancelAnimationFrame(frameId.current);
    },
    [],
  );

  // ── Keys: Space held fires; the arrows turn the handle; L lends; C counts; S skips ──
  useMachineKeys(active, (key) => {
    if (key === ' ') {
      if (hold()) keyHeld.current = true;
    } else if (key === 'ArrowLeft' || key === 'ArrowDown') turn(-1);
    else if (key === 'ArrowRight' || key === 'ArrowUp') turn(1);
    else if (key === 'l') lend();
    else if (key === 'c') count();
    else if (key === 's') skip();
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
  // A handle held as the window loses the keyboard and the pointer (another window brought in front, the address bar
  // clicked) is let go: the key or the button comes up where this page never hears it, and the machine would go on
  // firing the tray with nobody at it, as the medal pusher's rails would stream on (MedalPusher/PlayTab.tsx).
  useEffect(() => {
    window.addEventListener('blur', letGo);
    return () => window.removeEventListener('blur', letGo);
  }, [letGo]);

  // ── The handle's own presses: a finger or the mouse holds it; Space or Enter on it does the same ──
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (!hold()) return;
    pointerHeld.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still lets go over the handle, as a finger does.
    }
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerHeld.current !== event.pointerId) return;
    pointerHeld.current = null;
    release();
  };
  const onHandleCancel = () => {
    if (pointerHeld.current === null) return;
    letGo();
  };
  const onHandleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat && hold()) keyHeld.current = true;
  };
  const onHandleKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!keyHeld.current) return;
    keyHeld.current = false;
    release();
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

  // ── What is on the screen ──
  const odds = PUBLISHED_PACHINKO_ODDS;
  const machineBusy = shown.spin !== null || shown.bonus !== null || shown.h1 + shown.h2 > 0;
  const idleOut = mine && here && known && bankState.balance === 0 && tray === 0 && !machineBusy;
  const refillDue = idleOut && bankState.out.length === 0;
  const shortOf = mine && here && known && bankState.balance > 0 && bankState.balance < LEND_MEDALS && tray === 0 && !machineBusy;
  const right = strength >= FIRST_RIGHT;
  const callsRight = shown.bonus !== null || helping(shown.mode);
  const statusText = (() => {
    const s = t.status;
    const b = shown.bonus;
    if (b) {
      if (b.stage === 'fanfare') return s.fanfare;
      if (b.stage === 'open') return credit && tray === 0 ? s.credit : s.round(b.round, b.rounds, b.count);
      if (b.stage === 'interval') return s.interval;
      return s.ending;
    }
    // A hit's rounds over, its lanterns stay on the screen until the next spin; the line says what comes now (ST or
    // 時短, and 右打ち for it), not the hit again.
    if (shown.spin && shown.spin.kind === 'sp' && shown.spin.phase >= 2) return s.sp;
    if (shown.spin && shown.spin.kind !== 'plain' && shown.spin.phase >= 1) return s.reach;
    if (idleOut) return refillDue ? t.outOfMedals : t.outOfMedals;
    if (shortOf) return t.tooFew(bankState.balance);
    if (tray === 0 && !machineBusy) return s.noBalls;
    if (held && callsRight !== right) return s.wrongSide(callsRight);
    if (shown.mode === 'st') return s.st(shown.left);
    if (shown.mode === 'jitan') return s.jitan(shown.left);
    if (held && shown.h1 >= HOLDS) return s.full;
    if (held) return s.firing(strength);
    if (shown.spin) return s.spinning;
    return s.ready;
  })();
  const lcdCaption = (() => {
    const b = shown.bonus;
    if (b) return b.stage === 'fanfare' ? t.lcd.fanfare : b.stage === 'ending' ? t.lcd.ending : t.lcd.round(b.round, b.rounds);
    if (shown.won) return t.lcd.hit;
    if (shown.spin && shown.spin.kind === 'sp' && shown.spin.phase >= 2) return t.lcd.sp;
    if (shown.spin && shown.spin.kind !== 'plain' && shown.spin.phase >= 1) return t.lcd.reach;
    return '';
  })();
  const modeLine = shown.mode === 'st' ? t.lcd.st(shown.left) : shown.mode === 'jitan' ? t.lcd.jitan(shown.left) : '';
  const spinning = shown.spin !== null;
  const reach = shown.spin !== null && shown.spin.kind !== 'plain' && shown.spin.phase >= 1;
  const reels: { face: number; spinning: boolean }[] = [0, 1, 2].map((i) => ({ face: shown.faces[i], spinning: spinning && (!reach || i === 1) }));
  const where = t.holdLamps(shown.h1, shown.h2) + '. ' + t.modeWords(shown.mode, shown.left) + '.';
  const observed = stats.fired > 0 ? stats.paid / stats.fired : null;

  return (
    <div
      className={styles.machine}
      data-testid="pk-machine"
      data-playable={canPlay ? 'true' : 'false'}
      data-card={bankState.card}
      data-mode={shown.mode}
      data-left={shown.left}
      data-stage={shown.bonus?.stage ?? ''}
      data-round={shown.bonus?.round ?? ''}
      data-h1={shown.h1}
      data-h2={shown.h2}
      data-tray={tray}
      data-strength={strength}
      data-held={held ? 'true' : 'false'}
      data-spin={shown.spin?.kind ?? ''}
      data-phase={shown.spin?.phase ?? ''}
      data-won={shown.won ? `${shown.won.rounds}-${shown.won.after}` : ''}
      data-hits={stats.hits}
      data-rush={shown.rush}
    >
      <div className={styles.cabinet}>
        <div className={styles.sign} aria-hidden="true">
          <span className={styles.signMain}>{t.sign}</span>
          <span className={styles.signSub} lang={language}>
            {t.signSub}
          </span>
        </div>

        <div className={styles.playArea} ref={playAreaRef}>
          <Board
            canvasRef={canvasRef}
            label={t.boardLabel(where)}
            reels={reels}
            caption={lcdCaption}
            modeLine={modeLine}
            spinKind={shown.spin?.kind ?? ''}
            phase={shown.spin?.phase ?? -1}
            won={shown.won !== null}
            stage={shown.bonus?.stage ?? ''}
            count={shown.bonus ? t.lcd.count(shown.bonus.count) : ''}
            h1={shown.h1}
            h2={shown.h2}
            right={callsRight ? t.lcd.right : ''}
            calm={calm}
          />

          <p className={styles.status} data-testid="pk-status">
            <span>
              <Phrases text={statusText} />
            </span>
          </p>

          <div className={styles.controls}>
            <div className={styles.handleBox}>
              <button type="button" className={styles.turnButton} data-testid="pk-softer" aria-label={t.softer} onClick={() => turn(-1)} disabled={strength <= 0}>
                −
              </button>
              <button
                type="button"
                className={styles.handle}
                data-testid="pk-handle"
                data-held={held ? 'true' : 'false'}
                data-right={right ? 'true' : 'false'}
                aria-label={t.handleAria}
                aria-describedby="pk-strength-now"
                onPointerDown={onHandleDown}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleCancel}
                onLostPointerCapture={onHandleCancel}
                onKeyDown={onHandleKeyDown}
                onKeyUp={onHandleKeyUp}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span className={styles.handleDial} style={{ transform: `rotate(${-80 + strength * (160 / (STRENGTHS - 1))}deg)` }} aria-hidden="true">
                  <span className={styles.handleGrip} />
                </span>
                <span className={styles.handleWords}>{t.handle}</span>
              </button>
              <button type="button" className={styles.turnButton} data-testid="pk-harder" aria-label={t.harder} onClick={() => turn(1)} disabled={strength >= STRENGTHS - 1}>
                +
              </button>
            </div>
            <p className={styles.strength} id="pk-strength" data-testid="pk-strength" data-right={right ? 'true' : 'false'}>
              <span className={styles.gauge} aria-hidden="true">
                {Array.from({ length: STRENGTHS }, (_, s) => (
                  <span key={s} className={styles.gaugeStep} data-on={s <= strength ? 'true' : 'false'} data-right={s >= FIRST_RIGHT ? 'true' : 'false'} />
                ))}
              </span>
              <label className={styles.strengthWords}>
                <span>{t.strength}</span>
                <select className={`${styles.strengthSelect} ${selectStyles.select}`} value={strength} onChange={(event) => setTo(Number(event.target.value))} data-testid="pk-strength-select">
                  {Array.from({ length: STRENGTHS }, (_, s) => (
                    <option key={s} value={s}>
                      {t.strengthWords(s, s >= FIRST_RIGHT)}
                    </option>
                  ))}
                </select>
              </label>
              <span id="pk-strength-now" className={styles.srOnly}>
                {t.strength} {t.strengthWords(strength, right)}
              </span>
            </p>
            <div className={styles.buttons}>
              <button type="button" className={styles.lendButton} data-testid="pk-lend" aria-label={t.lendAria} onClick={lend} disabled={!canPlay || bankState.balance < LEND_MEDALS}>
                <span className={styles.lendWords}>{t.lend}</span>
                <span className={styles.lendSmall}>{t.lendWords}</span>
              </button>
              <button type="button" className={styles.countButton} data-testid="pk-count" aria-label={t.countAria} onClick={count} disabled={!canPlay || tray < BALLS_PER_MEDAL || shown.bonus !== null}>
                {t.count}
              </button>
              <button type="button" className={styles.skipButton} data-testid="pk-skip" onClick={skip} disabled={!canSkip} aria-describedby="pk-skip-why" title={canSkip ? undefined : t.skipWhy}>
                {t.skip}
              </button>
              <span id="pk-skip-why" className={styles.srOnly}>
                {t.skipWhy}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="pk-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="pk-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.balls}</span>
            <span className={styles.meterValue} data-testid="pk-balls">
              {fmt(tray)}
            </span>
            <span className={styles.led} aria-hidden="true">
              <SegmentDisplay value={tray} places={BALL_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="pk-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="pk-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {idleOut && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="pk-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="pk-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="pk-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="pk-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="pk-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="pk-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="pk-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="pk-history-title">
          <h2 id="pk-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="pk-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-rounds={entry.kind.rounds} data-after={entry.kind.after} title={t.historyEntryLabel(entry.kind)}>
                  {t.historyEntry(entry.kind)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="pk-session-title">
          <h2 id="pk-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.lent}</dt>
              <dd data-testid="pk-stat-lent">{fmt(stats.lent)}</dd>
            </div>
            <div>
              <dt>{t.countedBack}</dt>
              <dd>{fmt(stats.counted)}</dd>
            </div>
            <div>
              <dt>{t.fired}</dt>
              <dd data-testid="pk-stat-fired">{fmt(stats.fired)}</dd>
            </div>
            <div>
              <dt>{t.paid}</dt>
              <dd>{fmt(stats.paid)}</dd>
            </div>
            <div>
              <dt>{t.spins}</dt>
              <dd>{fmt(stats.spins)}</dd>
            </div>
            <div>
              <dt>{t.hits}</dt>
              <dd data-testid="pk-stat-hits">{fmt(stats.hits)}</dd>
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

      <p className={styles.srOnly} aria-live="polite" data-testid="pk-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
