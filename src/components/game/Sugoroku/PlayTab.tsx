'use client';

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { BETS, BOARD, START, analyzeBoard, drawPlay, medalsFor, valueOf, type Bet, type Play } from './engine';
import { getStrings } from './i18n';
import { IslandBoard, SquareIcon } from './IslandBoard';
import { SUGOROKU_GAME, createTable, playOfRecord, rollId, standingOf, type BoardRecord, type Staked, type Table } from './medalTable';
import { beatsOf, finalScene, restingScene, showLength, type Beat, type Scene } from './scene';
import styles from './Sugoroku.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the bet (10) and a win (1,020). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 2;
export const WIN_PLACES = 4;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** How long the machine stands unplayed before its squares run their attract pattern, in ms. */
export const ATTRACT_AFTER = 12_000;
/** A win this big or bigger gets the big fanfare. */
export const BIG_WIN = 100;
const HISTORY_LIMIT = 16;

/** This device's storage for the machine: the board, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a roll's name, from the browser's crypto: Math.random is the draw's alone. */
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

/** A roll on the board on this page: its stake, how it plays out, and the beats of its show. */
type InFlight = Staked & { play: Play; beats: Beat[] };

/** A roll that has ended, as the machine shows it. */
interface Ended {
  id: string;
  play: Play;
  bet: number;
  won: number;
  /** The last roll from before this page opened. */
  earlier: boolean;
}

interface SessionStats {
  rolls: number;
  played: number;
  won: number;
  rides: number;
  jackpots: number;
}
const EMPTY_STATS: SessionStats = { rolls: 0, played: 0, won: 0, rides: 0, jackpots: 0 };

/**
 * A line of words kept whole between its phrases: in Japanese, which a browser may break between any two characters,
 * it breaks only after 「、」「。」「：」「！」「・」「→」 (「ジャックポッ｜ト！」 is never left), and in English at its spaces.
 */
export function phrasesOf(text: string): string[] {
  const parts: string[] = [];
  let part = '';
  for (const character of text) {
    part += character;
    if ('、。：！？・→ '.includes(character)) {
      parts.push(part);
      part = '';
    }
  }
  if (part) parts.push(part);
  return parts;
}
const Phrases = ({ text }: { text: string }) => {
  const parts = phrasesOf(text);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          <span className={styles.phrase}>{part}</span>
        </Fragment>
      ))}
    </>
  );
};

const sameBoat = (a: Scene, b: Scene): boolean =>
  a.boat.on === b.boat.on && (a.boat.on === 'board' ? a.boat.square === (b.boat as { square: number }).square : a.boat.step === (b.boat as { step: number }).step);

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the board, its counters, the bet and ROLL. What happens to the medals and the board is the table's
 * (medalTable.ts); this draws each roll the moment ROLL is pressed, plays its show (scene.ts) and shows how it ended.
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

  const [bet, setBetState] = useState<Bet>(BETS[0]);
  const betRef = useRef<Bet>(BETS[0]);
  const setBet = useCallback((next: Bet) => {
    betRef.current = next;
    setBetState(next);
  }, []);
  const [running, setRunning] = useState<InFlight | null>(null);
  const runningRef = useRef<InFlight | null>(null);
  const [scene, setSceneState] = useState<Scene>(() => restingScene(START));
  const sceneRef = useRef<Scene>(scene);
  const [hop, setHop] = useState(0);
  const setScene = useCallback((next: Scene) => {
    if (!sameBoat(sceneRef.current, next)) setHop((n) => n + 1);
    sceneRef.current = next;
    setSceneState(next);
  }, []);
  // Whether a board has been read for the player yet: until then the boat waits at START and nothing is said of it.
  const [known, setKnown] = useState(false);
  const [outcome, setOutcome] = useState<Ended | null>(null);
  const [history, setHistory] = useState<Ended[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  // What a roll still on the board paid before its show ended: the card went for a moment (the medal center taking the
  // day's bonus, say), or the page was reloaded under it, and the roll was settled as the card went. The medals are in;
  // the counters do not show them before the boat has stopped on the screen.
  const [hiddenWin, setHiddenWin] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [attract, setAttract] = useState(false);
  const [touched, setTouched] = useState(0);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const glance = useRef<Glance | null>(null);
  const timers = useRef<number[]>([]);
  // While ROLL writes its roll down and takes the bet: the medals moving then are this press's own, not a roll to take up.
  const staking = useRef(false);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  const sound = useMachineSound();
  const { play, tick } = sound;
  const medalsShown = mine ? Math.max(0, bankState.balance - hiddenWin) : null;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const shownBet = running ? running.record.roll.bet : bet;
  const winShown = running ? medalsFor(running.record.roll.bet, scene.paid) : (outcome?.won ?? 0);
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const canRoll = mine && here && running === null;
  const canRollRef = useRef(canRoll);
  useEffect(() => {
    canRollRef.current = canRoll;
  }, [canRoll]);

  /** The boat has stopped on the screen: the roll is settled, if it was not already, and shown. */
  const finished = useCallback(() => {
    const flight = runningRef.current;
    if (!flight) return;
    runningRef.current = null;
    clearTimers();
    const { record, play: played } = flight;
    // Known as shown before it is settled: the medals moving as it is paid wake the machine's look at the board, which
    // would otherwise take it for a roll from before this page.
    shownLast.current = record.roll.id;
    setScene(finalScene(played));
    if (!flight.void) {
      const won = record.roll.won;
      if (won > 0) payMedals();
      setHiddenWin(0);
      if (!flight.paid) table.current?.settle(flight);
      const ended: Ended = { id: record.roll.id, play: played, bet: record.roll.bet, won, earlier: false };
      setOutcome(ended);
      setHistory((before) => [ended, ...before.filter((entry) => entry.id !== ended.id)].slice(0, HISTORY_LIMIT));
      setStats((s) => ({ rolls: s.rolls + 1, played: s.played + record.roll.bet, won: s.won + won, rides: s.rides + (played.ride ? 1 : 0), jackpots: s.jackpots + (played.jackpot ? 1 : 0) }));
      setAnnouncement(live.current.t.outcome(played, record.roll.bet).say);
    }
    setRunning(null);
  }, [payMedals, setScene]);

  /** Puts a roll on the board: one taken now, or one this device left unfinished. */
  const begin = useCallback(
    (staked: Staked, again: boolean, from?: HTMLElement | null) => {
      const played = playOfRecord(staked.record);
      const beats = beatsOf(played, live.current.calm);
      const flight: InFlight = Object.assign(staked, { play: played, beats });
      runningRef.current = flight;
      setRunning(flight);
      setResumed(again);
      setAttract(false);
      setOutcome(null);
      setBet(staked.record.roll.bet);
      clearTimers();
      // Put down where the roll starts at once (a roll found unfinished after a reload starts where it was rolled from),
      // the die already tumbling if the show starts with it: the status line says the face only once it has landed, never
      // for the moment before the first beat.
      setScene({ ...restingScene(played.from, sceneRef.current.face), phase: 'roll', rolling: beats[0]?.scene.rolling ?? false, warp: true });
      if (!again) {
        glance.current?.drop();
        glance.current = lookUp(boardRef.current, from ?? null);
      }
      let paid = 0;
      for (const beat of beats) {
        timers.current.push(
          window.setTimeout(() => {
            if (runningRef.current !== flight) return;
            if (beat.scene.paid > paid) {
              paid = beat.scene.paid;
              payWin();
            }
            setScene(beat.scene);
            if (beat.sound) play(beat.sound === 'win' && medalsFor(staked.record.roll.bet, beat.scene.paid) >= BIG_WIN ? 'big' : beat.sound);
          }, beat.at),
        );
      }
      timers.current.push(window.setTimeout(finished, showLength(beats)));
    },
    [finished, payWin, play, setBet, setScene],
  );

  /** ROLL: the roll is drawn here, in the press, written down with the board, and the bet taken. */
  const roll = (from?: HTMLElement | null) => {
    if (runningRef.current || !canRollRef.current) return;
    const drawn = drawPlay(Math.random);
    staking.current = true;
    let outcomeOfStake: ReturnType<Table['stake']>;
    try {
      outcomeOfStake = table.current?.stake(betRef.current, drawn) ?? { kind: 'away' };
    } finally {
      staking.current = false;
    }
    if (outcomeOfStake.kind !== 'staked') {
      const words = live.current.t;
      if (outcomeOfStake.kind === 'short') setMessage(words.notEnough);
      else if (outcomeOfStake.kind === 'unsaved') setMessage(words.unsaved);
      else if (outcomeOfStake.kind === 'unfinished') {
        setMessage(words.unfinished);
        syncNow.current?.();
      }
      return;
    }
    setMessage('');
    const amount = outcomeOfStake.staked.record.roll.bet;
    for (let i = 0; i < Math.min(amount / 2, 5); i++) play('medal', i * 0.06);
    setAnnouncement(live.current.t.sayRoll(amount));
    begin(outcomeOfStake.staked, false, from);
  };

  /** Skip: the roll's show goes straight to its end. */
  const skip = () => {
    if (runningRef.current) finished();
  };

  /** The medals have been reset at the medal center: the board starts over at START. */
  const startOver = useCallback(
    (said: boolean) => {
      const flight = runningRef.current;
      if (flight) flight.void = true;
      runningRef.current = null;
      clearTimers();
      setRunning(null);
      setHiddenWin(0);
      table.current?.clear();
      shownLast.current = null;
      setOutcome(null);
      setHistory([]);
      setStats(EMPTY_STATS);
      setMessage('');
      setResumed(false);
      setScene({ ...restingScene(START), warp: true });
      medalBank().restarted(SUGOROKU_GAME);
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [setScene],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a roll still on the board is settled at once (where the boat stops was drawn
  // already), so that its winnings are in before anyone else plays the medals or the page is gone.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => rollId(Date.now(), nameRandom),
    });
    const settleNow = () => {
      const flight = runningRef.current;
      if (!flight || flight.void || !table.current) return;
      const settled = flight.paid ? 'already' : table.current.settle(flight);
      // Paid now, before the boat has stopped on the screen: what it won stays off the counters until it has.
      if (settled === 'paid' && flight.record.roll.won > 0) setHiddenWin(flight.record.roll.won);
    };
    const placed = purse.sit(SUGOROKU_GAME, { granted: () => undefined, yielding: settleNow });
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
          if (purse.restartDue(SUGOROKU_GAME)) startOver(false);
          if (runningRef.current || staking.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            begin({ record: left, stored: true, paid: false, void: false }, true);
            break;
          }
          const record: BoardRecord | null = tab.board();
          setKnown(true);
          if (record?.roll && record.roll.paid && shownLast.current !== record.roll.id) {
            shownLast.current = record.roll.id;
            const played = playOfRecord(record as BoardRecord & { roll: NonNullable<BoardRecord['roll']> });
            const ended: Ended = { id: record.roll.id, play: played, bet: record.roll.bet, won: record.roll.won, earlier: true };
            setOutcome(ended);
            setBet(record.roll.bet);
            setHistory((before) => (before.some((entry) => entry.id === ended.id) ? before : [ended, ...before].slice(0, HISTORY_LIMIT)));
            setScene({ ...finalScene(played), banner: { kind: 'none' }, phase: 'idle', lit: [], laneLit: [], warp: true });
          } else {
            const at = standingOf(record);
            const now = sceneRef.current;
            // The roll this page has just shown stays up (its total, its path lit) until the next; anything else is put at rest.
            if (now.boat.on !== 'board' || now.boat.square !== at || (now.phase !== 'idle' && now.phase !== 'done')) setScene({ ...restingScene(at, now.face), lamps: now.lamps, warp: true });
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
  }, [begin, setBet, setScene, startOver]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // A roll that has ended: whatever the medals heard of while the boat sailed (another tab, a reset) is looked at now.
  useEffect(() => {
    if (!running && mine && here) syncNow.current?.();
  }, [running, mine, here]);

  // A roll that has ended no longer needs the view held up at the board.
  useEffect(() => {
    if (!running) glance.current?.drop();
  }, [running]);

  // The attract lights: a machine left standing unplayed runs them, as cabinets on a real floor do, until the next press.
  const rolling = running !== null;
  useEffect(() => {
    if (rolling || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [rolling, active, touched, outcome]);

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

  const cycleBet = () => {
    if (runningRef.current) return;
    const at = BETS.indexOf(betRef.current);
    setBet(BETS[(at + 1) % BETS.length]);
    play('button');
  };

  // On a desktop: Space or Enter rolls (or skips a roll under way), S skips, B changes the bet (machineKeys.ts).
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (runningRef.current) skip();
      else roll(null);
    } else if (key === 's') skip();
    else if (key === 'b') cycleBet();
    else return false;
    return true;
  });

  // ── What is on the screen ──
  const odds = analyzeBoard();
  const standingSquare = scene.boat.on === 'board' ? scene.boat.square : null;
  const statusText = (() => {
    if (running) {
      const played = running.play;
      switch (scene.phase) {
        case 'roll':
          return scene.rolling ? t.status.rolling : t.status.sailing(played.draw.roll);
        case 'sail':
          return t.status.sailing(played.draw.roll);
        case 'arrow':
          return played.sent ? t.status.arrow(t.squareName(played.sent.kind)) : t.status.sailing(played.draw.roll);
        case 'lamp':
          return t.status.lamp;
        case 'jp':
          return t.status.jp;
        case 'final':
          return t.status.final;
        case 'ride':
          return t.status.ride;
        default:
          return t.outcome(played, running.record.roll.bet).status;
      }
    }
    if (outcome && !outcome.earlier) return t.outcome(outcome.play, outcome.bet).status;
    if (outOfMedals) return t.outOfMedals;
    if (!known || standingSquare === null || (standingSquare === START && !outcome)) return t.status.first;
    return t.status.idle(t.squareName(BOARD[standingSquare].kind));
  })();
  const where = scene.boat.on === 'board' ? t.boatOn(scene.boat.square, t.squareName(BOARD[scene.boat.square].kind)) : t.boatRiding;
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;
  const won = !running && outcome !== null && !outcome.earlier && outcome.won > 0;

  return (
    <div
      className={styles.machine}
      data-testid="sg-machine"
      data-playable={canRoll ? 'true' : 'false'}
      data-card={bankState.card}
      data-phase={running ? scene.phase : 'idle'}
      data-at={standingSquare ?? ''}
      data-won={outcome?.won ?? ''}
      data-round={running?.record.roll.id ?? outcome?.id ?? ''}
      onPointerDown={() => {
        setAttract(false);
        setTouched((n) => n + 1);
      }}
    >
      <div className={styles.cabinet}>
        <div className={styles.marquee} aria-hidden="true" data-chase={running || attract ? 'true' : 'false'}>
          <span className={styles.marqueeWave} />
          <span className={styles.marqueeText}>
            <span className={styles.marqueeMain}>{t.sign}</span>
            <span className={styles.marqueeSub} lang={language}>
              {t.signSub}
            </span>
          </span>
          <span className={styles.marqueeWave} />
        </div>

        <div className={styles.boardBox} ref={boardRef}>
          <IslandBoard scene={scene} bet={shownBet} t={t} attract={attract && !running} calm={calm} hop={hop} warp={scene.warp} label={t.boardLabel(where)} onTap={skip} />
          {(resumed || (outcome?.earlier && !running)) && (
            <span className={styles.resumedBadge} data-testid="sg-resumed">
              {t.resumed}
            </span>
          )}
        </div>

        <p className={styles.status} data-testid="sg-status">
          <span>
            <Phrases text={statusText} />
          </span>
        </p>

        {/* The medals, the bet and the win, on LED counters as a medal machine shows them. The numbers are in type beside
            them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="sg-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="sg-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="sg-bet">
              {shownBet}
            </span>
            <span className={styles.led}>
              <SegmentDisplay value={shownBet} places={BET_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="sg-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="sg-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        {/* The bet and ROLL, with SKIP beside it: always in the same place, so nothing moves as a roll plays. */}
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
                aria-checked={shownBet === value}
                aria-label={t.betAria(value)}
                className={styles.betButton}
                data-testid={`sg-bet-${value}`}
                disabled={rolling}
                onClick={() => {
                  setBet(value);
                  play('button');
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <div className={styles.mainButtons}>
            <button type="button" className={styles.rollButton} data-testid="sg-roll" onClick={(event) => roll(event.currentTarget)} disabled={!canRoll || bankState.balance < bet}>
              {t.roll}
            </button>
            <button type="button" className={styles.skipButton} data-testid="sg-skip" onClick={skip} disabled={!rolling}>
              {t.skip}
            </button>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="sg-message">
          {message}
        </p>

        {/* What each square does, by its picture: the board prints only what a square pays or how far it moves, large
            enough to read on a phone, and the names are here. */}
        <section className={styles.legend} aria-labelledby="sg-legend-title" data-testid="sg-legend">
          <h2 id="sg-legend-title" className={styles.legendTitle}>
            {t.legendTitle}
          </h2>
          <ul className={styles.legendList}>
            {t.legend.map(([kind, name, does]) => (
              <li key={kind} className={styles.legendItem} data-kind={kind}>
                <span className={styles.legendIcon} aria-hidden="true">
                  <SquareIcon kind={kind} />
                </span>
                <span>
                  <strong>{name}</strong>
                  {language === 'ja' ? '：' : ': '}
                  {does}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="sg-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="sg-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="sg-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="sg-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="sg-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="sg-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="sg-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="sg-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="sg-history-title">
          <h2 id="sg-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="sg-history">
              {history.map((entry) => (
                <li key={entry.id} className={styles.historyChip} data-won={entry.won > 0 ? 'true' : 'false'} data-jackpot={entry.play.jackpot ? 'true' : 'false'}>
                  {entry.play.jackpot && <span className={styles.historyStar}>{t.historyJackpot}</span>}
                  {t.historyEntry(entry.play.draw.roll, entry.won)}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="sg-session-title">
          <h2 id="sg-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.rolls}</dt>
              <dd data-testid="sg-stat-rolls">{fmt(stats.rolls)}</dd>
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
              <dt>{t.rides}</dt>
              <dd>{fmt(stats.rides)}</dd>
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
              <dt>{t.longRun}</dt>
              <dd>{pct(valueOf(odds.longRun), 2)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="sg-announcement">
        {announcement}
      </p>
    </div>
  );
};

export default PlayTab;
