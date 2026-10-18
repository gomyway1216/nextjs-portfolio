'use client';

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { bank as medalBank, useBank } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { fieldOf, startPlan, type Flight, type Planner } from './ballPath';
import { Board } from './Board';
import { Card } from './Card';
import {
  BALLS_PER_GAME,
  BET_OPTIONS,
  FREE_MOST,
  FULL_CARD_LINES,
  PAY_TABLE,
  POCKETS,
  after,
  drawGame,
  linesOf,
  reachOf,
  stateAfter,
  winOf as cardPays,
  type Bet,
  type GameState,
} from './engine';
import { getStrings } from './i18n';
import { PUBLISHED_ODDS } from './odds';
import { SPEED_KEY, browserStorage, createTable, randomName, tabName, winOf, type Round, type Table } from './medals';
import styles from './BallBingo.module.css';

/** How many digits each LED has: the medals up to 9,999,999 (as the medal center's counter), the bet, the balls, a win (1,500 at most). */
export const MEDAL_PLACES = 7;
export const BALL_PLACES = 2;
export const WIN_PLACES = 4;
/** How long the machine waits for the card before it says the medals are being played in another tab, in seconds. */
export const CARD_WAIT = 1.5;
/**
 * The pause between one ball coming to rest and AUTO shooting the next, how long the plunger is drawn back before it is
 * let go, and how long a ball takes to drop in with less motion, in ms.
 */
export const AUTO_GAP_MS = 260;
export const PULL_MS = 150;
/**
 * How fast the balls fly: as the field's physics has them, or twice as fast (the quick mode of a real machine). Only the
 * showing is quicker: every ball's pocket was drawn at START. The choice is kept on this device.
 */
export const SPEEDS = [1, 2] as const;
export type Speed = (typeof SPEEDS)[number];
const readSpeed = (): Speed => {
  try {
    return window.localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1;
  } catch {
    return 1;
  }
};
const speedListeners = new Set<() => void>();
/** The speed on this page: read from the device once, then as the switch sets it (kept here too, for storage that keeps nothing). */
let speedHere: Speed | null = null;
const speedNow = (): Speed => (speedHere ??= readSpeed());
const subscribeSpeed = (listener: () => void): (() => void) => {
  speedListeners.add(listener);
  return () => {
    speedListeners.delete(listener);
  };
};
const setSpeedHere = (speed: Speed): void => {
  speedHere = speed;
  try {
    window.localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Not kept: the machine plays at this speed until the page is left.
  }
  for (const listener of [...speedListeners]) listener();
};
export const CALM_DROP_MS = 260;
/** How long the next ball's flight is worked on in each frame while a ball is in the air, in ms. */
const PLAN_SLICE_MS = 3;
const RECENT_LIMIT = 8;

/** The exact odds, as published (odds.ts): written out once, never worked out again as the page opens. */
const ODDS = PUBLISHED_ODDS;

/** An LED display, drawn again only when its number changes (a game's meters change a few times a ball). */
const Led = memo(function Led({ value, places, tone }: { value: number | string; places: number; tone?: 'red' | 'amber' }) {
  return <SegmentDisplay value={value} places={places} tone={tone} />;
});

/** Who is playing, as the site says: the medals on the table have to be theirs before a medal is bet. */
export interface BingoPlayer {
  uid: string | null;
  settled: boolean;
}
const GUEST_PLAYER: BingoPlayer = { uid: null, settled: true };
const theirs = (player: BingoPlayer): boolean => !player.settled || medalBank().owner() === player.uid;

/** The game on the machine: its round, whether it was left under way before a reload, and whether its last ball is down. */
interface OnTable {
  round: Round;
  resumed: boolean;
  done: boolean;
}

interface Stats {
  games: number;
  played: number;
  won: number;
  biggest: number;
}
const NO_STATS: Stats = { games: 0, played: 0, won: 0, biggest: 0 };
/** A game of this visit, as the panel lists it. */
interface Recent {
  id: string;
  lines: number;
  win: number;
}

/** A seed for a ball's flight, from its round and its place in the game: the same game shows much the same flights. */
const seedOf = (round: Pick<Round, 'id'>, ball: number): number => {
  let h = 2166136261;
  for (const c of round.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h ^ (ball * 0x9e3779b1)) >>> 0;
};

const MOTION = '(prefers-reduced-motion: reduce)';
const prefersCalm = (): boolean => typeof window !== 'undefined' && window.matchMedia?.(MOTION).matches === true;
const subscribeToMotion = (listener: () => void): (() => void) => {
  const query = window.matchMedia?.(MOTION);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
};

/** The panel beside the cabinet: the pay glass at every bet, and this visit's games. Drawn again only when a game ends or the bet changes. */
const SidePanel = memo(function SidePanel({ language, stats, recent, bet, resultLines }: { language: 'en' | 'ja'; stats: Stats; recent: readonly Recent[]; bet: number; resultLines: number | null }) {
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);
  const pct = (v: number, digits = 2) => `${(v * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  const shownBet = bet;
  const result = resultLines === null ? null : { lines: resultLines };
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  return (
    <div className={styles.sidePanel}>
      <section className={styles.panel} aria-labelledby="bingo-pay-title">
        <h2 id="bingo-pay-title" className={styles.panelTitle}>
          {t.payTitle}
        </h2>
        <table className={styles.payTable} data-testid="bingo-paytable">
          <thead>
            <tr>
              <th scope="col">{t.payColLines}</th>
              {BET_OPTIONS.map((value) => (
                <th key={value} scope="col" className={value === shownBet ? styles.payOn : undefined} aria-current={value === shownBet ? 'true' : undefined}>
                  {t.payColBet(value)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAY_TABLE.map((row) => (
              <tr key={row.lines} className={result && result.lines === row.lines ? styles.payHit : undefined}>
                <th scope="row">{row.lines === FULL_CARD_LINES ? t.fullCard : t.lines(row.lines)}</th>
                {BET_OPTIONS.map((value) => (
                  <td key={value} className={value === shownBet ? styles.payOn : undefined}>
                    {fmt(row.pays * value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.panel} aria-labelledby="bingo-session-title">
        <h2 id="bingo-session-title" className={styles.panelTitle}>
          {t.sessionTitle}
        </h2>
        <dl className={styles.statList}>
          <div>
            <dt>{t.games}</dt>
            <dd data-testid="bingo-games">{fmt(stats.games)}</dd>
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
            <dd className={stats.won - stats.played >= 0 ? styles.ahead : styles.behind}>
              {stats.won - stats.played > 0 ? '+' : ''}
              {fmt(stats.won - stats.played)}
            </dd>
          </div>
          <div>
            <dt>{t.biggest}</dt>
            <dd>{fmt(stats.biggest)}</dd>
          </div>
          <div>
            <dt>{t.seenReturn}</dt>
            <dd>{observed === null ? '—' : pct(observed, 1)}</dd>
          </div>
          <div>
            <dt>{t.exactReturn}</dt>
            <dd>{pct(ODDS.rtp, 3)}</dd>
          </div>
        </dl>
        {recent.length > 0 && (
          <>
            <h3 className={styles.panelSub}>{t.recentTitle}</h3>
            <ol className={styles.recentList} data-testid="bingo-recent">
              {recent.map((entry) => (
                <li key={entry.id} data-win={entry.win > 0}>
                  {t.recentLine(entry.lines, entry.win)}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
});

export interface PlayTabProps {
  player?: BingoPlayer;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

export const PlayTab = ({ player = GUEST_PLAYER, active = true }: PlayTabProps) => {
  const { language } = useGameLanguage();
  const t = getStrings(language);
  const locale = language === 'ja' ? 'ja-JP' : 'en-US';
  const fmt = (n: number) => n.toLocaleString(locale);

  const medals = useBank();
  const calm = useSyncExternalStore(subscribeToMotion, prefersCalm, () => false);
  const [bet, setBet] = useState<Bet>(BET_OPTIONS[0]);
  const [game, setGame] = useState<OnTable | null>(null);
  const [shown, setShown] = useState(0);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [flightKey, setFlightKey] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [flash, setFlash] = useState<{ pocket: number; key: number } | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);
  // The server draws every machine at its own pace; the browser at the speed kept on this device.
  const speed = useSyncExternalStore(subscribeSpeed, speedNow, () => 1 as Speed);
  const [stats, setStats] = useState<Stats>(NO_STATS);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [announcement, setAnnouncement] = useState('');
  // What a game on the field paid before its last ball was down: the card went for a moment (the medal center taking the
  // day's bonus, say), or the page was reloaded mid-game, and the game was paid as the card went. The medals are in; the
  // meters do not show them before the last ball is down.
  const [hiddenWin, setHiddenWin] = useState(0);
  const sound = useMachineSound();
  const { play, tick } = sound;
  const shownMedals = Math.max(0, medals.balance - hiddenWin);
  const medalMeter = useCountUp(medals.loaded ? shownMedals : null, tick);
  const { pay: payMedals } = medalMeter;

  // What the callbacks must read at once (a second press, or AUTO's timer, can come before React renders again).
  const table = useRef<Table | null>(null);
  const gameRef = useRef<OnTable | null>(null);
  const shownRef = useRef(0);
  const flyingRef = useRef(false);
  const betRef = useRef<Bet>(BET_OPTIONS[0]);
  const autoRef = useRef(false);
  const playerRef = useRef(player);
  const live = useRef({ t, calm });
  const resumedIds = useRef(new Set<string>());
  const timers = useRef(new Set<number>());
  const next = useRef<{ round: string; ball: number; planner: Planner } | null>(null);
  const flashKey = useRef(0);
  /** The shot of the next ball, for AUTO's timer (set once `launch` is made, below). */
  const launchRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    playerRef.current = player;
    live.current = { t, calm };
  });

  const later = useCallback((ms: number, what: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      what();
    }, ms);
    timers.current.add(id);
  }, []);
  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  }, []);

  const putOnTable = useCallback((next: OnTable | null, at: number) => {
    gameRef.current = next;
    shownRef.current = at;
    setGame(next);
    setShown(at);
  }, []);

  /** The game's last ball is down: it is paid now (if the card going had not paid it already), and counted. */
  const finishGame = useCallback(() => {
    const on = gameRef.current;
    if (!on || on.done) return;
    const { round } = on;
    const end = stateAfter(round.draws, round.draws.length);
    const lines = linesOf(end.marks);
    const win = cardPays(end.marks, round.bet);
    if (win > 0) payMedals();
    setHiddenWin(0);
    table.current?.finish(round);
    const done = { ...on, done: true };
    gameRef.current = done;
    setGame(done);
    flyingRef.current = false;
    setFlight(null);
    setDropping(false);
    if (win > 0) play(lines >= 4 ? 'big' : 'win');
    setStats((s) => ({ games: s.games + 1, played: s.played + round.bet, won: s.won + win, biggest: Math.max(s.biggest, win) }));
    setRecent((r) => [{ id: round.id, lines, win }, ...r].slice(0, RECENT_LIMIT));
    setAnnouncement(live.current.t.sayEnd(lines, win));
  }, [payMedals, play]);

  /** A ball has come to rest in its pocket (or gone into OUT): the card and the meters take it in. */
  const landed = useCallback(() => {
    const on = gameRef.current;
    if (!on || on.done) return;
    const { round } = on;
    const ball = shownRef.current;
    const pocket = round.draws[ball];
    if (pocket === undefined) return;
    const before = stateAfter(round.draws, ball);
    const now = after(before, pocket);
    shownRef.current = ball + 1;
    setShown(ball + 1);
    flyingRef.current = false;
    setFlight(null);
    setDropping(false);
    flashKey.current += 1;
    setFlash({ pocket, key: flashKey.current });
    const kind = POCKETS[pocket].kind;
    if (kind === 'number') {
      setFresh(POCKETS[pocket].number);
      play('hold');
    }
    table.current?.progress(round, ball + 1);
    const words = live.current.t;
    if (kind === 'free') setAnnouncement(words.sayFree);
    else if (kind === 'chance') setAnnouncement(words.sayChance);
    else setAnnouncement(words.sayPocket(words.pocketName(kind, POCKETS[pocket].number), reachOf(now.marks).length > 0 && now.left > 0));
    if (ball + 1 >= round.draws.length) {
      later(live.current.calm ? 120 : 220, finishGame);
      return;
    }
    if (autoRef.current) later(AUTO_GAP_MS / speedNow(), () => launchRef.current());
  }, [finishGame, later, play]);

  /** Works on the next ball's flight, a slice at a time, while the ball before it is in the air. */
  const prepare = useCallback((round: Round, ball: number) => {
    if (ball >= round.draws.length || live.current.calm) return;
    const state = stateAfter(round.draws, ball);
    next.current = { round: round.id, ball, planner: startPlan(fieldOf(state), round.draws[ball], seedOf(round, ball)) };
    const mine = next.current;
    const work = () => {
      if (next.current !== mine) return;
      if (mine.planner.work(PLAN_SLICE_MS)) return;
      window.requestAnimationFrame(work);
    };
    window.requestAnimationFrame(work);
  }, []);

  /**
   * Shoots the next ball of the game on the field: the plunger is drawn back, and let go a moment later. The ball's
   * flight is worked on while the plunger is drawn (and, for every ball after the first, while the ball before it was
   * in the air), so that letting go never waits on it.
   */
  const launch = useCallback(() => {
    const on = gameRef.current;
    if (!on || on.done || flyingRef.current) return;
    const { round } = on;
    const ball = shownRef.current;
    if (ball >= round.draws.length) return;
    flyingRef.current = true;
    setPulling(true);
    play('lever');
    if (!next.current || next.current.round !== round.id || next.current.ball !== ball) prepare(round, ball);
    later(PULL_MS / speedNow(), () => {
      setPulling(false);
      // The game was put away while the plunger was drawn (SKIP and a reset clear this timer; this is for anything else).
      if (gameRef.current !== on) {
        flyingRef.current = false;
        return;
      }
      if (live.current.calm) {
        // With less motion the ball is not seen to fly: it is in its pocket a moment later.
        setDropping(true);
        later(CALM_DROP_MS, () => {
          play('drop');
          landed();
        });
        return;
      }
      const planned = next.current && next.current.round === round.id && next.current.ball === ball ? next.current.planner.finish() : startPlan(fieldOf(stateAfter(round.draws, ball)), round.draws[ball], seedOf(round, ball)).finish();
      next.current = null;
      play('launch');
      setFlight(planned);
      setFlightKey((k) => k + 1);
      prepare(round, ball + 1);
    });
  }, [landed, later, play, prepare]);
  useEffect(() => {
    launchRef.current = launch;
  });

  /** START: the stake is taken and every ball of the game drawn, at once (medals.ts), and the first ball shot. */
  const start = useCallback(() => {
    const mine = table.current;
    const on = gameRef.current;
    if (!mine || (on && !on.done) || !theirs(playerRef.current)) return;
    // Every ball's pocket, drawn as START is pressed, from the published chances (engine.ts).
    const draws = drawGame(Math.random);
    const placed = mine.bet(betRef.current, draws);
    if (!placed.ok) return;
    clearTimers();
    for (let i = 0; i < placed.round.bet; i++) play('medal', i * 0.09);
    setHiddenWin(0);
    setFresh(null);
    setFlash(null);
    next.current = null;
    putOnTable({ round: placed.round, resumed: false, done: false }, 0);
    setAnnouncement(live.current.t.sayStart(placed.round.bet));
    launch();
  }, [clearTimers, launch, play, putOnTable]);

  /** SKIP: every ball still to come drops into its pocket at once. */
  const skip = useCallback(() => {
    const on = gameRef.current;
    if (!on || on.done) return;
    clearTimers();
    next.current = null;
    flyingRef.current = false;
    setFlight(null);
    setDropping(false);
    setPulling(false);
    const { round } = on;
    shownRef.current = round.draws.length;
    setShown(round.draws.length);
    table.current?.progress(round, round.draws.length);
    const last = round.draws[round.draws.length - 1];
    flashKey.current += 1;
    setFlash({ pocket: last, key: flashKey.current });
    setFresh(null);
    play('drop');
    finishGame();
  }, [clearTimers, finishGame, play]);

  // The machine's place at the medal bank, while the page is open: the card is asked for at once, and a reset at the
  // medal center starts the machine over.
  useEffect(() => {
    const mine = createTable({
      bank: medalBank(),
      storage: browserStorage(),
      tab: tabName(),
      name: randomName,
      events: {
        yielding: (why) => {
          // The game on the field has been paid as the card goes: what it won stays off the meters until its last ball is down.
          const on = gameRef.current;
          const kept = on ? mine.current() : null;
          if (on && !on.done && kept?.id === on.round.id && kept.paid) setHiddenWin(winOf(on.round));
          if (why !== 'moment') {
            autoRef.current = false;
            setAuto(false);
          }
        },
        restart: () => {
          // Every medal of the era before the reset is gone, the game on the field with them.
          clearTimers();
          next.current = null;
          flyingRef.current = false;
          setFlight(null);
          setDropping(false);
          setPulling(false);
          putOnTable(null, 0);
          setHiddenWin(0);
          setStats(NO_STATS);
          setRecent([]);
          setFresh(null);
          setFlash(null);
          setAnnouncement(live.current.t.sayRestart);
        },
      },
    });
    table.current = mine;
    const getUp = mine.sit();
    const unlisten = medalBank().listen((event) => {
      if (event.type === 'refill') setAnnouncement(live.current.t.sayRefill(event.medals));
    });
    const pending = timers.current;
    return () => {
      unlisten();
      getUp();
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      if (table.current === mine) table.current = null;
    };
  }, [clearTimers, putOnTable]);

  // Whenever the card is here and the medals on the table change hands or era: a game still to be paid is paid, and a
  // game this tab left under way before a reload is put back on the field where it stood, once.
  const era = medals.ledger?.era ?? null;
  useEffect(() => {
    const mine = table.current;
    if (!mine || medals.card !== 'here' || !medals.loaded) return;
    mine.payDue();
    const on = gameRef.current;
    if (on && !on.done) return;
    const round = mine.leftover();
    if (!round || resumedIds.current.has(round.id)) return;
    resumedIds.current.add(round.id);
    // Paid already, as the page before this one went: what it won stays off the meters until its last ball is down.
    if (round.paid) setHiddenWin(winOf(round));
    putOnTable({ round, resumed: true, done: false }, round.shown);
    setFresh(null);
    setFlash(null);
    setAnnouncement(live.current.t.resumed);
    if (round.shown >= round.draws.length) finishGame();
  }, [medals.card, medals.loaded, medals.owner, era, putOnTable, finishGame]);

  // While the card is in another tab's machine, the machine says so, a moment after.
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (medals.card !== 'asking') return;
    const timer = window.setTimeout(() => setLongWait(true), CARD_WAIT * 1000);
    return () => {
      window.clearTimeout(timer);
      setLongWait(false);
    };
  }, [medals.card]);
  const cardAway = medals.card === 'away' || (medals.card === 'asking' && longWait);

  const dropSound = useCallback(() => play('drop'), [play]);

  const chooseBet = (value: Bet) => {
    const on = gameRef.current;
    if (on && !on.done) return;
    betRef.current = value;
    setBet(value);
    play('button');
  };
  const toggleSpeed = () => {
    setSpeedHere(speedNow() === 2 ? 1 : 2);
    play('button');
  };
  const toggleAuto = () => {
    const on = !autoRef.current;
    autoRef.current = on;
    setAuto(on);
    play('button');
    // Switched on between balls: the next one goes now.
    if (on && gameRef.current && !gameRef.current.done && !flyingRef.current) launch();
  };

  const inGame = game !== null && !game.done;
  const flying = flight !== null || dropping || pulling;
  const ready = medals.loaded && medals.card === 'here' && (!player.settled || medals.owner === player.uid);
  const canStart = ready && !inGame && medals.balance >= bet;
  const canLaunch = inGame && !flying && shown < (game?.round.draws.length ?? 0);
  const outOfMedals = ready && !inGame && medals.balance === 0;
  const short = ready && !inGame && medals.balance > 0 && medals.balance < bet;

  // On a desktop: Space or Enter starts a game or shoots the next ball, S skips, A switches AUTO, F the speed, 1 2 3 choose the bet.
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (canLaunch) launch();
      else if (canStart) start();
      return true;
    }
    if (key === 's') {
      if (inGame) skip();
      return true;
    }
    if (key === 'a') {
      toggleAuto();
      return true;
    }
    if (key === 'f') {
      toggleSpeed();
      return true;
    }
    const value = BET_OPTIONS.find((b) => String(b) === key);
    if (value === undefined) return false;
    chooseBet(value);
    return true;
  });

  const state: GameState | null = game ? stateAfter(game.round.draws, shown) : null;
  const marks = state?.marks ?? 0;
  const lines = linesOf(marks);
  const shownBet = game ? game.round.bet : bet;
  const winNow = game ? cardPays(marks, game.round.bet) : 0;
  // The ball in the air has left the plunger: it is no longer to come.
  const ballsLeft = state ? (game?.done ? 0 : Math.max(0, state.left - (flying ? 1 : 0))) : BALLS_PER_GAME;
  const freesLeft = state ? FREE_MOST - state.frees : FREE_MOST;
  const reach = inGame && state ? reachOf(marks).length > 0 && state.left > 0 : false;
  const result = game?.done ? { lines, win: winNow } : null;
  const marked = Array.from({ length: 9 }, (_, i) => i + 1).filter((n) => (marks & (1 << (n - 1))) !== 0);

  const resultText = result
    ? result.lines === FULL_CARD_LINES
      ? t.resultFull(result.win)
      : result.lines > 0
        ? t.resultWin(result.lines, result.win)
        : t.resultLose
    : inGame
      ? t.inPlay(ballsLeft)
      : outOfMedals
        ? t.outOfMedals
        : short
          ? t.notEnough(bet)
          : t.ready;

  return (
    <div className={styles.playGrid}>
      <div className={styles.cabinet} data-testid="bingo-cabinet" data-phase={inGame ? (flying ? 'flying' : 'ready') : game ? 'over' : 'idle'} data-card={medals.card} data-ready={ready} data-chance={state?.chance ?? false}>
        <div className={styles.marquee} aria-hidden>
          <span className={styles.bulbs} />
          <span className={styles.marqueeText}>{t.marquee}</span>
          <span className={styles.marqueeSub}>{t.marqueeSub}</span>
          <span className={styles.bulbs} />
        </div>

        <div className={styles.glass}>
          <Card marks={marks} live={inGame && (state?.left ?? 0) > 0} fresh={fresh} label={t.cardSays(marked, lines)} />
          <div className={styles.lamps}>
            <span className={styles.lamp} data-kind="chance" data-on={state?.chance ?? false} data-testid="bingo-lamp-chance">
              {t.chanceTime}
            </span>
            <span className={styles.lamp} data-kind="reach" data-on={reach} data-testid="bingo-lamp-reach">
              {t.reach}
            </span>
            <span className={styles.freeLamps} data-testid="bingo-lamp-free" data-left={freesLeft} title={t.freeLeft(freesLeft)}>
              <span className={styles.freeWord}>{t.free}</span>
              {Array.from({ length: FREE_MOST }, (_, i) => (
                <span key={i} className={styles.freeDot} data-on={i < freesLeft} />
              ))}
              <span className={styles.srOnly}>{t.freeLeft(freesLeft)}</span>
            </span>
          </div>
        </div>

        {/* The pay glass: what the card pays at the bet, as the lines it holds light their row. */}
        <p className={styles.payCaption} aria-hidden>
          {t.stripCaption}
        </p>
        <ol className={styles.payStrip} data-testid="bingo-paystrip" aria-label={t.payTitle}>
          {PAY_TABLE.map((row) => (
            <li key={row.lines} className={styles.payCell} data-on={lines === row.lines}>
              <span className={styles.payLines} aria-hidden>
                {row.lines === FULL_CARD_LINES ? t.stripAll : row.lines}
              </span>
              <span className={styles.srOnly}>{row.lines === FULL_CARD_LINES ? t.fullCard : t.lines(row.lines)}: </span>
              <span className={styles.payMedals}>{fmt(row.pays * shownBet)}</span>
            </li>
          ))}
        </ol>

        <div className={styles.boardWrap}>
          <Board
            marks={marks}
            frees={state?.frees ?? 0}
            chance={state?.chance ?? false}
            waiting={canLaunch || pulling}
            pulling={pulling}
            speed={speed}
            flight={flight}
            flightKey={flightKey}
            onDrop={dropSound}
            onLanded={landed}
            flash={flash}
            label={t.boardLabel(flying ? t.boardFlying : t.boardIdle)}
          />
        </div>

        {/* The medals, the bet, the balls and the win, on LED displays; the numbers are in type beside them, for a screen reader. */}
        <div className={styles.meters}>
          <div className={`${styles.meter} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="bingo-medals" data-loaded={medals.loaded}>
              {medals.loaded ? fmt(shownMedals) : '—'}
            </span>
            <span className={styles.led} data-testid="bingo-medals-led" data-shown={medalMeter.shown ?? ''}>
              <Led value={medalMeter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="bingo-bet">
              {shownBet}
            </span>
            <span className={styles.led}>
              <Led value={shownBet} places={1} tone="amber" />
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>{t.balls}</span>
            <span className={styles.meterValue} data-testid="bingo-balls">
              {ballsLeft}
            </span>
            <span className={styles.led}>
              <Led value={ballsLeft} places={BALL_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meter} ${winNow > 0 ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="bingo-win">
              {winNow}
            </span>
            <span className={styles.led}>
              <Led value={winNow} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        {/* Shown, not said: the announcement below says each ball and how the game ended, once. */}
        <p className={styles.resultLine} data-testid="bingo-result" data-lines={result?.lines ?? ''}>
          {resultText}
        </p>
        <p className={styles.noteLine} data-testid="bingo-resumed" hidden={!game?.resumed}>
          {game?.resumed ? (hiddenWin > 0 ? `${t.resumed} ${t.paidAlready}` : t.resumed) : ' '}
        </p>

        <div className={styles.controls}>
          <div className={styles.betRow} role="radiogroup" aria-label={t.bet}>
            {BET_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={bet === value}
                aria-label={t.betAria(value)}
                className={styles.betMedal}
                data-testid={`bingo-bet-${value}`}
                onClick={() => chooseBet(value)}
                disabled={inGame}
              >
                {value}
              </button>
            ))}
          </div>
          {inGame ? (
            <button type="button" className={styles.mainButton} data-testid="bingo-launch" data-mode="launch" onClick={launch} disabled={!canLaunch}>
              {flying ? t.flying : t.launch}
            </button>
          ) : (
            <button type="button" className={styles.mainButton} data-testid="bingo-start" data-mode="start" onClick={start} disabled={!canStart}>
              {t.start}
            </button>
          )}
          <div className={styles.secondaryRow}>
            <button type="button" className={styles.btn} data-testid="bingo-skip" onClick={skip} disabled={!inGame}>
              {t.skip}
            </button>
            <button type="button" className={styles.btn} data-testid="bingo-auto" aria-pressed={auto} data-on={auto} onClick={toggleAuto}>
              {auto ? t.autoOn : t.auto}
            </button>
            <button type="button" className={styles.btn} data-testid="bingo-speed" aria-pressed={speed === 2} aria-label={t.speedAria} data-on={speed === 2} onClick={toggleSpeed}>
              {t.speed}
            </button>
            <SoundSwitch control={sound} language={language} className={styles.btn} testId="bingo-sound" />
          </div>
        </div>

        {/* The attendant's free cupful, the medal center's own, for a player with no medals left. */}
        {outOfMedals && (
          <button type="button" className={styles.refill} data-testid="bingo-refill" onClick={() => medalBank().refill()}>
            {t.refill(REFILL)}
          </button>
        )}

        <KeysHint text={t.keysHint} className={styles.keysHint} testId="bingo-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="bingo-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.cabinetLink} href={MEDAL_CENTER_PATH} data-testid="bingo-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The member's card is in a machine in another tab: this one waits until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="bingo-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="bingo-play-here" onClick={() => table.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <SidePanel language={language} stats={stats} recent={recent} bet={shownBet} resultLines={result?.lines ?? null} />

      <p className={styles.srOnly} aria-live="polite" data-testid="bingo-announcement">
        {announcement}
      </p>
    </div>
  );
};
