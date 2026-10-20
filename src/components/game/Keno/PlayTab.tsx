'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { lookUp, type Glance } from '../MedalCenter/lookUp';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { Board, type Half } from './Board';
import { BETS, DRAWN, HALF, LAST_BALL_TIMES, SPOTS_MOST, drawBalls, gameOf, halfOf, isBet, payOf, quickPick, sameSpots, sortSpots, valueOf, type Bet } from './engine';
import { getStrings, type Result } from './i18n';
import { KENO_GAME, TICKET_KEY, createTable, gameId, parseTicket, type GameRecord, type Staked, type Table } from './medalTable';
import { PUBLISHED_KENO_ODDS } from './published';
import styles from './Keno.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the bet (10) and a win (100,000). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 2;
export const WIN_PLACES = 6;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** How long each ball takes to come out, in ms; the first after the press, and the pause before the last. */
export const BALL_MS = 240;
export const FIRST_MS = 420;
export const LAST_PAUSE_MS = 1_100;
/** How long the last ball is shown before the game's win is, in ms. */
export const END_BEAT_MS = 450;
/** A win this many times the bet or more gets the big fanfare. */
export const BIG_TIMES = 50;
/** How many spots a quick pick marks when none are marked and no game has been played. */
export const QUICK_PICK_SPOTS = 5;
const HISTORY_LIMIT = 16;
/** The rows of a paytable: the most any ticket pays on (ten spots pay on 5 to 10 caught). */
const PAY_ROWS = 6;

/** This device's storage for the machine: the game on record, and the ticket marked. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a game's name, from the browser's crypto: Math.random is the draw's alone. */
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

/** A game on this page: its stake, while its balls come out. */
type InFlight = Staked;

/** A game that has ended, as the machine shows it. */
interface Ended extends Result {
  id: string;
  ticket: number[];
  balls: number[];
  bet: number;
  /** The last game from before this page opened, shown again. */
  earlier: boolean;
}

const endedOf = (record: GameRecord, earlier: boolean): Ended => {
  const game = gameOf(record.spots, record.balls);
  return { id: record.id, ticket: record.spots, balls: record.balls, bet: record.bet, spots: record.spots.length, caught: game.caught.length, won: record.won, lastBall: game.times > 1, earlier };
};

interface SessionStats {
  games: number;
  played: number;
  won: number;
  lastBalls: number;
  biggest: number;
}
const EMPTY_STATS: SessionStats = { games: 0, played: 0, won: 0, lastBalls: 0, biggest: 0 };

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

/** The ticket kept on this device, read back: none where storage cannot be read. */
const keptTicket = () => {
  try {
    return parseTicket(window.localStorage.getItem(TICKET_KEY));
  } catch {
    return null;
  }
};

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work, and its balls come out, only then. */
  active?: boolean;
}

/**
 * The machine: the screen with its board, the balls drawn and the paytable, the counters, and the buttons. What
 * happens to the medals is the table's (medalTable.ts); this draws each game's twenty balls the moment DRAW is pressed,
 * shows them coming out one by one, and shows how the game ended.
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

  // The ticket: the spots marked and the bet chosen, kept on this device so that a reload finds them marked.
  const [marks, setMarksState] = useState<number[]>([]);
  const marksRef = useRef<number[]>([]);
  const [bet, setBetState] = useState<Bet>(1);
  const betRef = useRef<Bet>(1);
  const [half, setHalfState] = useState<Half>('top');
  const halfRef = useRef<Half>('top');
  const [focus, setFocus] = useState(1);
  /**
   * Shows a half of the board, where a phone shows one at a time, with the board's one stop of the Tab key on a number
   * of it (`at`, or its first, unless the stop is on that half already): a stop on the half not shown could not be
   * reached.
   */
  const setHalf = useCallback((next: Half, at?: number) => {
    halfRef.current = next;
    setHalfState(next);
    setFocus((stop) => (halfOf(stop) === next ? stop : (at ?? (next === 'top' ? 1 : HALF + 1))));
  }, []);
  // The last game's spots: Same spots plays them again.
  const [lastSpots, setLastSpots] = useState<number[]>([]);
  const lastSpotsRef = useRef<number[]>([]);

  const [running, setRunning] = useState<InFlight | null>(null);
  const runningRef = useRef<InFlight | null>(null);
  // How many balls the draw has stepped out so far; with less motion, or skipped, all of them are out (`shown`).
  const [stepped, setStepped] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const shown = running ? (calm || skipped ? DRAWN : stepped) : 0;
  const [outcome, setOutcome] = useState<Ended | null>(null);
  // Whether the last game's balls have been cleared off the board: the player has changed the ticket since.
  const [cleared, setCleared] = useState(false);
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [resumed, setResumed] = useState(false);
  // What a game still being drawn paid before its last ball came out on the screen: the card went for a moment (the
  // medal center taking the day's bonus, say), or the page was reloaded under it, and the game was settled as the card
  // went. The medals are in; the counters do not show them before the last ball is out.
  const [hiddenWin, setHiddenWin] = useState(0);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const glance = useRef<Glance | null>(null);
  // While DRAW writes its game down and takes the bet: the medals moving then are this press's own, not a game to take up.
  const staking = useRef(false);
  const heard = useRef(0);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance - hiddenWin) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const winShown = outcome && !running ? outcome.won : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;

  const canPlay = mine && here && running === null;
  const canPlayRef = useRef(canPlay);
  useEffect(() => {
    canPlayRef.current = canPlay;
  }, [canPlay]);

  // ── The ticket ──

  const keep = useCallback((spots: readonly number[], chosen: Bet) => {
    try {
      window.localStorage.setItem(TICKET_KEY, JSON.stringify({ spots, bet: chosen }));
    } catch {
      // Not kept: the marks are this page's alone.
    }
  }, []);
  const setMarks = useCallback(
    (next: number[]) => {
      marksRef.current = next;
      setMarksState(next);
      keep(next, betRef.current);
    },
    [keep],
  );
  const setBet = useCallback(
    (next: Bet) => {
      betRef.current = next;
      setBetState(next);
      keep(marksRef.current, next);
    },
    [keep],
  );
  const rememberSpots = useCallback((spots: readonly number[]) => {
    lastSpotsRef.current = [...spots];
    setLastSpots([...spots]);
  }, []);

  // The ticket marked on this device before: marked again.
  useEffect(() => {
    const kept = keptTicket();
    if (!kept) return;
    marksRef.current = kept.spots;
    betRef.current = kept.bet;
    // Storage is read only in the browser, after the first drawing matches the server's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarksState(kept.spots);
    setBetState(kept.bet);
    if (kept.spots.length > 0) setHalf(halfOf(kept.spots[0]), kept.spots[0]);
  }, [setHalf]);

  /** The ticket changed: the last game's balls come off the board. */
  const changed = (next: number[]) => {
    setMarks(next);
    setCleared(true);
    setResumed(false);
    setMessage('');
  };

  const toggle = (n: number) => {
    if (runningRef.current || !canPlayRef.current) return;
    const now = marksRef.current;
    if (now.includes(n)) {
      changed(now.filter((m) => m !== n));
      play('button');
      return;
    }
    if (now.length >= SPOTS_MOST) {
      setMessage(live.current.t.tooMany);
      return;
    }
    changed(sortSpots([...now, n]));
    play('button');
  };

  const erase = () => {
    if (runningRef.current || !canPlayRef.current || marksRef.current.length === 0) return;
    changed([]);
    play('button');
  };

  /** Quick pick: as many spots as are marked (or as the last game had, or five), drawn at random in the press. */
  const quick = () => {
    if (runningRef.current || !canPlayRef.current) return;
    const count = marksRef.current.length || lastSpotsRef.current.length || QUICK_PICK_SPOTS;
    const picked = quickPick(count, Math.random);
    changed(picked);
    setHalf(halfOf(picked[0]), picked[0]);
    play('chip');
    setAnnouncement(live.current.t.sayQuickPick(picked));
  };

  // ── A game ──

  /** Puts a game on the screen: one taken now, or one this device left unfinished. */
  const begin = useCallback(
    (staked: Staked, again: boolean, from: HTMLElement | null) => {
      const { record } = staked;
      runningRef.current = staked;
      setRunning(staked);
      setStepped(0);
      heard.current = 0;
      setSkipped(false);
      setOutcome(null);
      setCleared(false);
      setResumed(again);
      setMarks(record.spots);
      rememberSpots(record.spots);
      // A phone shows one half of the board: the draw is shown on a half with the player's spots on it, the half shown
      // if it has any (a half with none of them would show the whole draw without one of their numbers).
      if (record.spots.length > 0 && !record.spots.some((n) => halfOf(n) === halfRef.current)) setHalf(halfOf(record.spots[0]), record.spots[0]);
      glance.current?.drop();
      glance.current = again ? null : lookUp(screenRef.current, from);
    },
    [rememberSpots, setHalf, setMarks],
  );

  /** DRAW: the twenty balls are drawn here, in the press, the game written down and the bet taken. */
  const draw = (from: HTMLElement | null, ticket: readonly number[] = marksRef.current) => {
    if (runningRef.current || !canPlayRef.current) return;
    const words = live.current.t;
    if (ticket.length === 0) {
      setMessage(words.noSpots);
      return;
    }
    if (medalBank().balance() < betRef.current) {
      setMessage(words.notEnough);
      return;
    }
    const balls = drawBalls(Math.random);
    staking.current = true;
    let staked: ReturnType<Table['stake']>;
    try {
      staked = table.current?.stake(ticket, betRef.current, balls) ?? { kind: 'away' };
    } finally {
      staking.current = false;
    }
    if (staked.kind !== 'staked') {
      if (staked.kind === 'short') setMessage(words.notEnough);
      else if (staked.kind === 'unsaved') setMessage(words.unsaved);
      else if (staked.kind === 'unfinished') {
        setMessage(words.unfinished);
        syncNow.current?.();
      }
      return;
    }
    setMessage('');
    play('medal');
    play('lever', 0.08);
    setAnnouncement(words.sayDraw(ticket.length, betRef.current));
    begin(staked.staked, false, from);
  };

  /** Same spots: the last game's numbers marked again, and drawn, in one press. */
  const replay = (from: HTMLElement | null) => {
    const last = lastSpotsRef.current;
    if (runningRef.current || !canPlayRef.current || last.length === 0) return;
    if (!sameSpots(marksRef.current, last)) changed([...last]);
    draw(from, last);
  };

  const skip = () => {
    if (!runningRef.current) return;
    setSkipped(true);
  };

  // The last ball is out on the screen: the game is settled, if it was not already, and shown.
  const finished = useCallback(() => {
    const flight = runningRef.current;
    if (!flight) return;
    runningRef.current = null;
    const { record } = flight;
    // Known as shown before it is settled: the medals moving as it is paid wake the machine's look at the table, which
    // would otherwise take it for a game from before this page.
    shownLast.current = record.id;
    if (!flight.void) {
      if (record.won > 0) {
        payMedals();
        payWin();
      }
      setHiddenWin(0);
      if (!flight.paid) table.current?.settle(flight);
      const ended = endedOf(record, false);
      if (record.won > 0) play(record.won >= BIG_TIMES * record.bet ? 'big' : 'win', 0.05);
      setOutcome(ended);
      setHistory((before) => [ended, ...before.filter((entry) => entry.id !== ended.id)].slice(0, HISTORY_LIMIT));
      setStats((s) => ({ games: s.games + 1, played: s.played + record.bet, won: s.won + record.won, lastBalls: s.lastBalls + (ended.lastBall ? 1 : 0), biggest: Math.max(s.biggest, record.won) }));
      setAnnouncement(live.current.t.result(ended).say);
    }
    setRunning(null);
    setSkipped(false);
  }, [payMedals, payWin, play]);

  // The balls come out one by one while the machine is on show; with less motion, all at once.
  useEffect(() => {
    if (!running || !active) return;
    if (shown >= DRAWN) {
      const timer = window.setTimeout(finished, calm || skipped ? 0 : END_BEAT_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setStepped((s) => Math.min(DRAWN, s + 1)), shown === 0 ? FIRST_MS : shown === DRAWN - 1 ? LAST_PAUSE_MS : BALL_MS);
    return () => window.clearTimeout(timer);
  }, [running, shown, active, calm, skipped, finished]);

  // Each ball as it comes out: its blip, and a ring for a spot caught. Balls skipped over are not heard one by one.
  useEffect(() => {
    if (!running || shown <= heard.current) return;
    const from = heard.current;
    heard.current = shown;
    if (skipped || shown - from > 1) return;
    const ball = running.record.balls[shown - 1];
    play('ball');
    if (running.record.spots.includes(ball)) play('catch', 0.04);
  }, [running, shown, skipped, play]);

  /** The medals have been reset at the medal center: the machine starts over. */
  const startOver = useCallback(
    (said: boolean) => {
      const flight = runningRef.current;
      if (flight) flight.void = true;
      setHiddenWin(0);
      table.current?.clear();
      shownLast.current = null;
      setOutcome(null);
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      setResumed(false);
      rememberSpots([]);
      medalBank().restarted(KENO_GAME);
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [rememberSpots],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a game still being drawn is settled at once (its balls are drawn already), so that
  // its win is in before anyone else plays the medals or the page is gone.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => gameId(Date.now(), nameRandom),
    });
    const settleNow = () => {
      const flight = runningRef.current;
      if (!flight || flight.void || !table.current) return;
      const settled = flight.paid ? 'already' : table.current.settle(flight);
      // Paid now, before the last ball is out on the screen: what it won stays off the counters until it is.
      if (settled === 'paid' && flight.record.won > 0) setHiddenWin(flight.record.won);
    };
    const placed = purse.sit(KENO_GAME, { granted: () => undefined, yielding: settleNow });
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
          if (purse.restartDue(KENO_GAME)) startOver(false);
          if (runningRef.current || staking.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            begin({ record: left, stored: true, paid: false, void: false }, true, null);
            break;
          }
          const last = tab.last();
          if (last && shownLast.current !== last.id) {
            shownLast.current = last.id;
            rememberSpots(last.spots);
            const ended = endedOf(last, true);
            setOutcome(ended);
            setCleared(!sameSpots(marksRef.current, last.spots));
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
  }, [begin, startOver, rememberSpots]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // A game that has ended: whatever the medals heard of while its balls came out (another tab, a reset) is looked at now.
  useEffect(() => {
    if (!running && mine && here) syncNow.current?.();
  }, [running, mine, here]);

  // A game that has ended no longer needs the view held up at the screen.
  useEffect(() => {
    if (!running) glance.current?.drop();
  }, [running]);

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
  const outOfMedals = mine && here && !running && bankState.balance === 0;
  const refillDue = outOfMedals && bankState.out.length === 0;

  // On a desktop: Space or Enter draws (or skips the draw under way), S skips, Q quick pick, R same spots, C erases, B
  // changes the bet (machineKeys.ts).
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (runningRef.current) skip();
      else draw(null);
    } else if (key === 's') skip();
    else if (key === 'q') quick();
    else if (key === 'r') replay(null);
    else if (key === 'c') erase();
    else if (key === 'b') {
      if (runningRef.current) return true;
      setBet(BETS[(BETS.indexOf(betRef.current) + 1) % BETS.length]);
      play('button');
    } else return false;
    return true;
  });

  // ── What is on the screen ──
  const odds = PUBLISHED_KENO_ODDS;
  const ticket = running ? running.record.spots : marks;
  const ticketSet = useMemo(() => new Set(ticket), [ticket]);
  const balls = useMemo(() => (running ? running.record.balls.slice(0, shown) : outcome && !cleared ? outcome.balls : []), [running, shown, outcome, cleared]);
  const drawn = useMemo(() => new Map(balls.map((n, i) => [n, i])), [balls]);
  const latest = running && shown > 0 ? balls[shown - 1] : null;
  const caught = balls.filter((n) => ticketSet.has(n)).length;
  const lastCaught = balls.length === DRAWN && ticketSet.has(balls[DRAWN - 1]);
  const lastCalled = running !== null && shown === DRAWN - 1;
  const n = ticket.length;
  const shownBet = running ? running.record.bet : bet;
  const payNow = payOf(n, caught);
  const timesNow = lastCaught && payNow > 0 ? LAST_BALL_TIMES : 1;
  const lit = balls.length > 0 && payNow > 0 ? caught : null;
  const rows = n > 0 ? Array.from({ length: n + 1 }, (_, c) => n - c).filter((c) => payOf(n, c) > 0) : [];
  const ticketBack = n > 0 ? valueOf(odds.tickets[n - 1].back) : null;

  const statusText = (() => {
    if (running) {
      if (shown === 0) return t.status.drawing(0, 0);
      if (lastCalled && !skipped) return t.status.lastBall;
      return t.status.drawing(shown, caught);
    }
    if (outcome && !cleared) return t.result(outcome).status;
    if (outOfMedals) return t.outOfMedals;
    if (n === 0) return t.status.empty;
    return mine && bankState.balance < bet ? t.status.short(bet) : t.status.ready(n, bet);
  })();
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const won = !running && outcome !== null && !outcome.earlier && outcome.won > 0 && !cleared;
  const drawDisabled = !canPlay || n === 0 || bankState.balance < bet;
  const sameDisabled = !canPlay || lastSpots.length === 0 || bankState.balance < bet;

  return (
    <div
      className={styles.machine}
      data-testid="kn-machine"
      data-playable={canPlay ? 'true' : 'false'}
      data-card={bankState.card}
      data-phase={running ? 'draw' : outcome && !cleared ? 'done' : 'idle'}
      data-shown={running ? shown : balls.length}
      data-round={running?.record.id ?? outcome?.id ?? ''}
      data-won={outcome?.won ?? ''}
      data-caught={balls.length > 0 ? caught : ''}
      data-last-ball={lastCaught ? 'true' : 'false'}
    >
      <div className={styles.cabinet}>
        <div className={styles.marquee} aria-hidden="true" data-chase={running ? 'true' : 'false'}>
          <span className={styles.marqueeMain}>{t.sign}</span>
          <span className={styles.marqueeSub} lang="ja">
            {t.signSub}
          </span>
        </div>

        <div className={styles.screen} ref={screenRef} data-testid="kn-screen">
          {/* The ball just out, how many are out, and the spots caught; the last ball's lamp. */}
          <div className={styles.readout}>
            <span className={styles.ballBig} data-testid="kn-ball" data-ball={latest ?? ''} data-caught={latest !== null && ticketSet.has(latest) ? 'true' : 'false'} key={latest ?? 'none'} aria-hidden="true">
              {latest ?? ''}
            </span>
            <span className={styles.readoutCell}>
              <span className={styles.readoutLabel}>{t.ballLabel}</span>
              <span className={styles.readoutValue} data-testid="kn-ball-count">
                {t.ballOf(running ? shown : balls.length)}
              </span>
            </span>
            <span className={styles.readoutCell}>
              <span className={styles.readoutLabel}>{t.caughtLabel}</span>
              <span className={styles.readoutValue} data-testid="kn-caught">
                {balls.length > 0 ? `${caught}/${n}` : n > 0 ? `–/${n}` : '–'}
              </span>
            </span>
            <span className={styles.lastLamp} data-testid="kn-last-lamp" data-lit={lastCaught && payNow > 0 ? 'true' : 'false'} data-wait={lastCalled && !skipped ? 'true' : 'false'} title={t.lastBallAria}>
              {t.lastBall}
            </span>
          </div>

          <Board
            t={t}
            spots={ticketSet}
            drawn={drawn}
            latest={latest}
            half={half}
            onHalf={setHalf}
            open={canPlay}
            onToggle={toggle}
            focus={focus}
            onFocus={setFocus}
          />

          {/* The twenty balls in the order they came out: every one is here, whichever half the board shows. */}
          <ol className={styles.tray} aria-label={t.trayLabel(balls.length)} data-testid="kn-tray">
            {Array.from({ length: DRAWN }, (_, i) => {
              const ball = balls[i];
              const out = ball !== undefined;
              return (
                <li key={i} className={styles.trayBall} data-out={out ? 'true' : 'false'} data-caught={out && ticketSet.has(ball) ? 'true' : 'false'} data-last={i === DRAWN - 1 ? 'true' : 'false'}>
                  {out ? ball : ''}
                </li>
              );
            })}
          </ol>

          {/* The paytable for the ticket on the board: what each catch pays on the bet chosen. The catch made lights up. */}
          <section className={styles.paytable} aria-labelledby="kn-pay-title" data-testid="kn-paytable" data-spots={n}>
            <h2 id="kn-pay-title" className={styles.payTitle}>
              {t.payTitle(n)}
            </h2>
            {n === 0 ? (
              <p className={styles.payNone}>
                <span>
                  <Phrases text={t.payNone} />
                </span>
              </p>
            ) : (
              <table className={styles.payTable}>
                <thead>
                  <tr>
                    <th scope="col">{t.payCatch}</th>
                    <th scope="col" className={styles.num}>
                      {t.payWin(shownBet)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: PAY_ROWS }, (_, i) => {
                    const c = rows[i];
                    if (c === undefined) {
                      return (
                        <tr key={`empty-${i}`} className={styles.payEmpty} aria-hidden="true">
                          <td colSpan={2}>&nbsp;</td>
                        </tr>
                      );
                    }
                    const isLit = lit === c;
                    const amount = payOf(n, c) * shownBet;
                    return (
                      <tr key={c} data-caught={c} data-lit={isLit ? 'true' : 'false'}>
                        <th scope="row">{t.payRow(c, n)}</th>
                        <td className={styles.num}>
                          {fmt(amount)}
                          {isLit && timesNow > 1 && <span className={styles.payTimes}>{` ×${LAST_BALL_TIMES} = ${fmt(amount * LAST_BALL_TIMES)}`}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className={styles.payFoot}>
              <Phrases text={t.payLastBall} />
            </p>
          </section>

          {(resumed || (outcome?.earlier && !running && !cleared)) && (
            <span className={styles.resumedBadge} data-testid="kn-resumed">
              {resumed ? t.resumed : t.lastGame}
            </span>
          )}
        </div>

        <p className={styles.status} data-testid="kn-status">
          <span>
            <Phrases text={statusText} />
          </span>
        </p>

        {/* The medals, the bet and the win, on LED counters as a medal machine shows them. The numbers are in type beside
            them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="kn-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="kn-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="kn-bet">
              {shownBet}
            </span>
            <span className={styles.led}>
              <SegmentDisplay value={shownBet} places={BET_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="kn-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="kn-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        {/* The buttons: always in the same place, so that nothing moves as a game goes on. */}
        <div className={styles.controls}>
          <div className={styles.bets} role="radiogroup" aria-label={t.betGroup}>
            <span className={styles.betsLabel} aria-hidden="true">
              {t.betGroup}
            </span>
            {BETS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={bet === value}
                aria-label={t.betAria(value)}
                className={styles.betButton}
                data-testid={`kn-bet-${value}`}
                disabled={running !== null}
                onClick={() => {
                  if (!isBet(value) || runningRef.current) return;
                  setBet(value);
                  play('button');
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <div className={styles.ticketButtons}>
            <button type="button" className={styles.btn} data-testid="kn-quick" aria-label={t.quickPickAria(marks.length || lastSpots.length || QUICK_PICK_SPOTS)} onClick={quick} disabled={!canPlay}>
              {t.quickPick}
            </button>
            <button type="button" className={styles.btn} data-testid="kn-erase" onClick={erase} disabled={!canPlay || marks.length === 0}>
              {t.erase}
            </button>
            <button type="button" className={styles.btn} data-testid="kn-same" aria-label={lastSpots.length > 0 ? t.sameAria(lastSpots.length) : undefined} onClick={(event) => replay(event.currentTarget)} disabled={sameDisabled}>
              {t.same}
            </button>
          </div>
          <div className={styles.mainButtons}>
            <button type="button" className={styles.drawButton} data-testid="kn-draw" aria-label={t.drawAria(n, bet)} onClick={(event) => draw(event.currentTarget)} disabled={drawDisabled}>
              {t.draw}
            </button>
            <button type="button" className={styles.skipButton} data-testid="kn-skip" onClick={skip} disabled={!running || skipped}>
              {t.skip}
            </button>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="kn-message">
          <Phrases text={message} />
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="kn-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="kn-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="kn-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="kn-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="kn-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="kn-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="kn-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="kn-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="kn-history-title">
          <h2 id="kn-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="kn-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.won > 0 ? 'true' : 'false'} data-last-ball={entry.lastBall ? 'true' : 'false'}>
                  {t.historyEntry(entry)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="kn-session-title">
          <h2 id="kn-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>
                <Phrases text={t.games} />
              </dt>
              <dd data-testid="kn-stat-games">{fmt(stats.games)}</dd>
            </div>
            <div>
              <dt>
                <Phrases text={t.played} />
              </dt>
              <dd>{fmt(stats.played)}</dd>
            </div>
            <div>
              <dt>
                <Phrases text={t.won} />
              </dt>
              <dd>{fmt(stats.won)}</dd>
            </div>
            <div>
              <dt>
                <Phrases text={t.net} />
              </dt>
              <dd className={net >= 0 ? styles.pos : styles.neg}>
                {net > 0 ? '+' : ''}
                {fmt(net)}
              </dd>
            </div>
            <div>
              <dt>
                <Phrases text={t.lastBalls} />
              </dt>
              <dd>{fmt(stats.lastBalls)}</dd>
            </div>
            <div>
              <dt>
                <Phrases text={t.biggest} />
              </dt>
              <dd>{fmt(stats.biggest)}</dd>
            </div>
            <div>
              <dt>
                <Phrases text={t.cameBack} />
              </dt>
              <dd>{observed === null ? '—' : pct(observed)}</dd>
            </div>
            <div>
              <dt>
                <Phrases text={n > 0 ? t.ticketBack(n) : t.ticketBack(odds.bestSpots)} />
              </dt>
              <dd data-testid="kn-ticket-back">{pct(ticketBack ?? valueOf(odds.best), 2)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="kn-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
