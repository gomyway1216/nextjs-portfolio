'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { bank as medalBank, useBank, type Seat } from '../MedalCenter/bank';
import { useCountUp } from '../MedalCenter/countUp';
import { KeysHint, RefillWords } from '../MedalCenter/KeysHint';
import { REFILL } from '../MedalCenter/ledger';
import { useMachineKeys } from '../MedalCenter/machineKeys';
import { useMachineSound } from '../MedalCenter/machineSounds';
import { MedalsOut } from '../MedalCenter/MedalsOut';
import { MEDAL_CENTER_PATH } from '../MedalCenter/paths';
import { SoundSwitch } from '../MedalCenter/SoundSwitch';
import { GUEST, type Player } from '../MedalPusher/account';
import { SegmentDisplay } from '../MedalPusher/SegmentDisplay';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { LAMPS, SEGMENTS_OF, SPOTS, WHEEL, drawSpin, hashText, resultOf, seeded, type Bets, type Multiplier, type Spot } from './engine';
import { getStrings } from './i18n';
import { BET_STEPS, BIG_WHEEL_GAME, SPOT_MAX, betsOf, createTable, spinId, tapAmount, type PlacedBet, type SpinRecord, type Staked, type Table } from './medalTable';
import { angleFor, segmentAt, showOf, type Phase, type Show } from './physics';
import { Wheel, lookOf, type WheelRun } from './Wheel';
import styles from './BigWheel.module.css';

/** How many digits each LED counter has: the medals up to 9,999,999 (the medal center's own), the medals on the board (693 at most) and a win (39,600). */
export const MEDAL_PLACES = 7;
export const BET_PLACES = 3;
export const WIN_PLACES = 5;
/** How long the machine waits for the card before it says the medals are in another tab, in ms. */
export const CARD_WAIT = 1_500;
/** A win this big or bigger gets the big fanfare. */
export const BIG_WIN = 200;
/** How long the machine stands unplayed before its lights run their attract pattern, in ms. */
export const ATTRACT_AFTER = 12_000;
/** The shortest gap between two of the flapper's clacks heard, in ms: at full speed the pegs go by faster than that. */
const FLAP_GAP = 34;
const HISTORY_LIMIT = 16;

/** This device's storage for the machine: a spin on record, under the player's name. Every call may throw. */
const browserStorage = {
  read: (key: string) => window.localStorage.getItem(key),
  write: (key: string, text: string) => window.localStorage.setItem(key, text),
  remove: (key: string) => window.localStorage.removeItem(key),
};

/** Random numbers for a spin's name, from the browser's crypto: Math.random is the draw's alone. */
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

/** A spin on the wheel on this page: its stake, and its show. */
type InFlight = Staked & { show: Show };

/** What the machine shows of a spin that has ended. */
interface Outcome {
  id: string;
  spot: Spot;
  multiplier: 1 | Multiplier;
  bonus: boolean;
  /** The segment the wheel ended on. */
  segment: number;
  won: number;
  wagered: number;
  /** The last spin from before this page opened. */
  earlier: boolean;
}

const outcomeOf = (record: SpinRecord, earlier: boolean): Outcome => {
  const result = resultOf(record.spin);
  return { id: record.id, spot: result.spot, multiplier: result.multiplier, bonus: result.bonus, segment: result.bonus ? record.spin.second! : record.spin.stop, won: record.won, wagered: record.wagered, earlier };
};

interface SessionStats {
  spins: number;
  played: number;
  won: number;
  bonuses: number;
  biggest: number;
}
const EMPTY_STATS: SessionStats = { spins: 0, played: 0, won: 0, bonuses: 0, biggest: 0 };

const sumOf = (bets: Bets): number => SPOTS.reduce((sum, spot) => sum + (bets[spot] ?? 0), 0);
const placedOf = (bets: Bets): PlacedBet[] => SPOTS.filter((spot) => (bets[spot] ?? 0) > 0).map((spot) => ({ spot, amount: bets[spot]! }));

/** Brings the wheel on screen as a spin starts (on a phone the board is under it), unless most of it is there already. */
function revealWheel(element: HTMLElement | null): void {
  if (!element || typeof window === 'undefined') return;
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const visible = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
  if (visible >= rect.height * 0.6) return;
  element.scrollIntoView({ behavior: prefersCalm() ? 'auto' : 'smooth', block: 'center' });
}

export interface PlayTabProps {
  /** Who is playing: whose medals the machine plays with. A guest when not given. */
  player?: Player;
  /** Whether the machine's tab is the one shown: its keys work only then. */
  active?: boolean;
}

/**
 * The machine: the wheel, its counters, the betting board and the buttons.
 * What happens to the medals is the table's (medalTable.ts); this draws each
 * spin the moment SPIN is pressed, has the wheel show it (Wheel.tsx) and
 * shows how it ended.
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

  const [step, setStep] = useState<number>(BET_STEPS[0]);
  const [bets, setBets] = useState<Bets>({});
  const betsRef = useRef<Bets>({});
  const undoStack = useRef<PlacedBet[]>([]);
  const [running, setRunning] = useState<InFlight | null>(null);
  const runningRef = useRef<InFlight | null>(null);
  const [wheelRun, setWheelRun] = useState<WheelRun | null>(null);
  const [phase, setPhase] = useState<Phase | 'idle'>('idle');
  const [skipped, setSkipped] = useState(false);
  // Where the wheel stands, and the lamp left lit: the next spin starts from there.
  const [rest, setRest] = useState(0);
  const restRef = useRef(0);
  const [restLamp, setRestLamp] = useState<number | null>(null);
  const lampRef = useRef(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Outcome[]>([]);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [message, setMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [lastBets, setLastBets] = useState<PlacedBet[]>([]);
  const lastBetsRef = useRef<PlacedBet[]>([]);
  // What a spin still on the wheel paid before the wheel stopped: the card went for a moment as it turned (the medal
  // center taking the day's bonus, say), or the page was reloaded under it, and the spin was paid as the card went. The
  // medals are in; the counters do not show them before the wheel stops on the screen.
  const [hiddenWin, setHiddenWin] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [attract, setAttract] = useState(false);
  const [touched, setTouched] = useState(0);
  const seat = useRef<Seat | null>(null);
  const table = useRef<Table | null>(null);
  const shownLast = useRef<string | null>(null);
  const syncNow = useRef<(() => void) | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const live = useRef({ t, player, calm });
  useEffect(() => {
    live.current = { t, player, calm };
  }, [t, player, calm]);

  const canBet = mine && here && running === null;
  const canBetRef = useRef(canBet);
  useEffect(() => {
    canBetRef.current = canBet;
  }, [canBet]);
  const totalBet = useMemo(() => sumOf(bets), [bets]);

  // The medals not on the board: while the wheel turns, the board's medals are out of them already.
  const medalsShown = mine ? Math.max(0, bankState.balance - hiddenWin - (running ? 0 : totalBet)) : null;
  const sound = useMachineSound();
  const { play, tick } = sound;
  const meter = useCountUp(medalsShown, tick);
  const { pay: payMedals } = meter;
  const winShown = outcome && !running ? outcome.won : 0;
  const winMeter = useCountUp(winShown);
  const { pay: payWin } = winMeter;

  const lastFlap = useRef(-Infinity);
  const flap = useCallback(() => {
    const now = performance.now();
    if (now - lastFlap.current < FLAP_GAP) return;
    lastFlap.current = now;
    play('flap');
  }, [play]);

  const setBoard = useCallback((next: Bets) => {
    betsRef.current = next;
    setBets(next);
  }, []);
  const clearBoard = useCallback(() => {
    undoStack.current = [];
    setBoard({});
  }, [setBoard]);

  const addBet = (spot: Spot) => {
    if (runningRef.current || !canBetRef.current) return;
    const onSpot = betsRef.current[spot] ?? 0;
    const free = medalBank().balance() - sumOf(betsRef.current);
    const add = tapAmount(step, onSpot, free);
    setAttract(false);
    if (add <= 0) {
      setMessage(onSpot >= SPOT_MAX ? t.spotFull(SPOT_MAX) : t.noneLeft);
      return;
    }
    setMessage('');
    play('chip');
    setBoard({ ...betsRef.current, [spot]: onSpot + add });
    undoStack.current.push({ spot, amount: add });
    setPhase('idle');
  };

  const undo = () => {
    if (runningRef.current || !canBetRef.current || undoStack.current.length === 0) return;
    const last = undoStack.current.pop()!;
    const remaining = (betsRef.current[last.spot] ?? 0) - last.amount;
    const next = { ...betsRef.current };
    if (remaining <= 0) delete next[last.spot];
    else next[last.spot] = remaining;
    setMessage('');
    setBoard(next);
  };

  const clear = () => {
    if (runningRef.current || !canBetRef.current) return;
    setMessage('');
    clearBoard();
  };

  /** The last spin's bets back on an empty board, all of them or none. */
  const rebet = () => {
    const last = lastBetsRef.current;
    if (runningRef.current || !canBetRef.current || last.length === 0 || sumOf(betsRef.current) > 0) return;
    const total = last.reduce((sum, bet) => sum + bet.amount, 0);
    if (total > medalBank().balance()) {
      setMessage(t.rebetShort(total));
      return;
    }
    setMessage('');
    play('chip');
    setBoard(betsOf(last));
    undoStack.current = last.map((bet) => ({ ...bet }));
    setPhase('idle');
  };

  const rememberBets = useCallback((placed: readonly PlacedBet[]) => {
    const copy = placed.map(({ spot, amount }) => ({ spot, amount }));
    lastBetsRef.current = copy;
    setLastBets(copy);
  }, []);

  /** Puts a spin on the wheel: one taken now, or one this device left unfinished. */
  const begin = useCallback(
    (staked: Staked, again: boolean) => {
      const { record } = staked;
      // The look of the spin comes from its own name, so that a spin shown again after a reload looks the same.
      const show = showOf(record.spin, restRef.current, lampRef.current, seeded(hashText(record.id)), live.current.calm);
      const flight: InFlight = Object.assign(staked, { show });
      runningRef.current = flight;
      setRunning(flight);
      setSkipped(false);
      setOutcome(null);
      setResumed(again);
      setAttract(false);
      setPhase('spin');
      setWheelRun({ id: record.id, show });
      setBoard(betsOf(record.bets));
      undoStack.current = [];
      if (!again) revealWheel(wheelRef.current);
    },
    [setBoard],
  );

  /** SPIN: where the wheel stops is drawn here, in the press, and the medals on the board are taken. */
  const spin = () => {
    if (runningRef.current || !canBetRef.current || sumOf(betsRef.current) === 0) return;
    const drawn = drawSpin(Math.random);
    const staked = table.current?.stake(placedOf(betsRef.current), drawn) ?? null;
    if (!staked) {
      setMessage(live.current.t.notEnough);
      return;
    }
    setMessage('');
    rememberBets(staked.record.bets);
    const { wagered } = staked.record;
    for (let i = 0; i < Math.min(wagered, 8); i++) play('medal', i * 0.06);
    play('lever', Math.min(wagered, 8) * 0.06);
    setAnnouncement(live.current.t.saySpin(wagered));
    begin(staked, false);
  };

  const skip = () => {
    if (runningRef.current) setSkipped(true);
  };

  /** Each step of the show as it begins: its sound and its words. */
  const onPhase = useCallback(
    (next: Phase) => {
      const flight = runningRef.current;
      if (!flight || next === 'done') return;
      setPhase(next);
      const words = live.current.t;
      if (next === 'bonus') {
        play('bonus');
        setAnnouncement(words.sayBonus);
      } else if (next === 'second') {
        play('launch');
        setAnnouncement(words.saySecond(resultOf(flight.record.spin).multiplier));
      }
    },
    [play],
  );

  // The wheel has stopped on the screen: the spin is settled, if it was not already, and shown.
  const finished = useCallback(() => {
    const flight = runningRef.current;
    if (!flight) return;
    runningRef.current = null;
    const { record, show } = flight;
    // Known as shown before it is settled: the medals moving as it is paid wake the machine's look at the table, which
    // would otherwise take it for a spin from before this page.
    shownLast.current = record.id;
    const result = resultOf(record.spin);
    restRef.current = show.rest;
    setRest(show.rest);
    if (result.bonus) {
      lampRef.current = show.lamp;
      setRestLamp(show.lamp);
    } else setRestLamp(null);
    if (!flight.void) {
      if (record.won > 0) {
        payMedals();
        payWin();
      }
      setHiddenWin(0);
      if (!flight.paid) table.current?.settle(flight);
      if (record.won > 0) play(record.won >= BIG_WIN || result.multiplier === 10 ? 'big' : 'win', 0.05);
      const shown = outcomeOf(record, false);
      setOutcome(shown);
      setHistory((before) => [shown, ...before].slice(0, HISTORY_LIMIT));
      setStats((s) => ({
        spins: s.spins + 1,
        played: s.played + record.wagered,
        won: s.won + record.won,
        bonuses: s.bonuses + (result.bonus ? 1 : 0),
        biggest: Math.max(s.biggest, record.won),
      }));
      const words = live.current.t;
      setAnnouncement(record.won > 0 ? words.resultWin(result.spot, result.multiplier, record.won) : words.resultLose(result.spot, result.multiplier));
    }
    setRunning(null);
    setPhase('done');
    clearBoard();
  }, [clearBoard, payMedals, payWin, play]);

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
      rememberBets([]);
      clearBoard();
      medalBank().restarted(BIG_WHEEL_GAME);
      if (said) setAnnouncement(live.current.t.sayRestart);
    },
    [clearBoard, rememberBets],
  );

  // The machine's place at the medal center: it asks for the card as it is set up and plays the player's medals while
  // it holds it. As the card goes, a spin still on the wheel is settled at once (where it stops is drawn already), so
  // that its winnings are in before anyone else plays the medals or the page is gone.
  useEffect(() => {
    const purse = medalBank();
    table.current = createTable({
      bank: purse,
      storage: browserStorage,
      holding: () => seat.current?.holding() ?? false,
      newId: () => spinId(Date.now(), nameRandom),
    });
    const settleNow = () => {
      const flight = runningRef.current;
      if (!flight || flight.void || !table.current) return;
      const settled = flight.paid ? 'already' : table.current.settle(flight);
      // Paid now, before the wheel has stopped on the screen: what it won stays off the counters until it has.
      if (settled === 'paid' && flight.record.won > 0) setHiddenWin(flight.record.won);
    };
    const placed = purse.sit(BIG_WHEEL_GAME, { granted: () => undefined, yielding: settleNow });
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
          if (purse.restartDue(BIG_WHEEL_GAME)) startOver(false);
          if (runningRef.current) break;
          const left = tab.leftover();
          if (left) {
            setAnnouncement(live.current.t.sayResumed);
            rememberBets(left.bets);
            begin({ record: left, stored: true, paid: false, void: false }, true);
            break;
          }
          const last = tab.last();
          if (last && shownLast.current !== last.id) {
            shownLast.current = last.id;
            rememberBets(last.bets);
            const shown = outcomeOf(last, true);
            // The wheel stands where that spin stopped, its lamp lit if it had one.
            const angle = angleFor(shown.segment);
            restRef.current = angle;
            setRest(angle);
            if (shown.bonus && last.spin.lamp !== null) {
              lampRef.current = last.spin.lamp;
              setRestLamp(last.spin.lamp);
            }
            setOutcome(shown);
            setHistory((before) => (before.some((entry) => entry.id === shown.id) ? before : [shown, ...before].slice(0, HISTORY_LIMIT)));
            setPhase('done');
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
  }, [begin, startOver, rememberBets]);

  useEffect(() => {
    if (mine && here) syncNow.current?.();
  }, [mine, here]);

  // The attract lights: a machine left standing unplayed runs them, as cabinets on a real floor do, until the next press.
  const spinning = running !== null;
  useEffect(() => {
    if (spinning || !active) return;
    const timer = window.setTimeout(() => setAttract(true), ATTRACT_AFTER);
    return () => window.clearTimeout(timer);
  }, [spinning, active, totalBet, touched, outcome]);

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
  const outOfMedals = mine && here && !running && bankState.balance === 0 && totalBet === 0;
  const refillDue = outOfMedals && bankState.out.length === 0;

  // On a desktop: 1 to 7 put medals on a number, Space or Enter spins (or skips a spin under way), S skips, R the same
  // bets, U undoes, C clears (machineKeys.ts).
  useMachineKeys(active, (key) => {
    if (key === ' ' || key === 'Enter') {
      if (runningRef.current) skip();
      else spin();
    } else if (key === 's') skip();
    else if (key === 'r') rebet();
    else if (key === 'u') undo();
    else if (key === 'c') clear();
    else if (/^[1-7]$/.test(key)) addBet(SPOTS[Number(key) - 1]);
    else return false;
    return true;
  });

  const multiplier = running ? resultOf(running.record.spin).multiplier : (outcome?.multiplier ?? 1);
  const statusText = (() => {
    if (running) {
      if (phase === 'bonus') return t.status.bonus;
      if (phase === 'chance') return t.status.chance;
      if (phase === 'second') return t.status.second(multiplier);
      return t.status.spin;
    }
    if (totalBet > 0) return t.status.ready(totalBet);
    if (outcome) return outcome.won > 0 ? t.resultWin(outcome.spot, outcome.multiplier, outcome.won) : t.resultLose(outcome.spot, outcome.multiplier);
    if (outOfMedals) return t.outOfMedals;
    return t.status.idle;
  })();
  const banner = (() => {
    if (!running) return outcome && outcome.won > 0 && phase === 'done' && !outcome.earlier ? `+${fmt(outcome.won)}` : null;
    if (phase === 'bonus') return t.bonusBanner;
    if (phase === 'chance') return t.chanceBanner;
    if (phase === 'second') return t.secondBanner(multiplier);
    return null;
  })();
  const hub = running ? (phase === 'second' ? `×${multiplier}` : phase === 'chance' ? '×?' : '★') : outcome?.bonus && phase === 'done' ? `×${outcome.multiplier}` : '★';
  const won = !running && phase === 'done' && outcome !== null && outcome.won > 0;
  const wheelState = running ? t.wheelTurning : outcome ? t.wheelAt(t.segmentName(WHEEL[segmentAt(rest)])) : t.wheelIdle;
  const shownBet = running ? running.record.wagered : totalBet;
  const lastTotal = lastBets.reduce((sum, bet) => sum + bet.amount, 0);
  const observed = stats.played > 0 ? stats.won / stats.played : null;
  const net = stats.won - stats.played;

  return (
    <div
      className={styles.machine}
      data-testid="bw-machine"
      data-phase={phase}
      data-playable={canBet ? 'true' : 'false'}
      data-card={bankState.card}
      data-attract={attract && !running ? 'true' : 'false'}
      data-result-spot={outcome?.spot ?? ''}
      data-result-multiplier={outcome?.multiplier ?? ''}
      data-won={outcome?.won ?? ''}
      data-rest={segmentAt(rest)}
      onPointerDown={() => {
        setAttract(false);
        setTouched((n) => n + 1);
      }}
    >
      <div className={styles.cabinet}>
        <div className={styles.marquee} aria-hidden="true" data-chase={running || attract ? 'true' : 'false'}>
          <span className={styles.marqueeBulbs} />
          <span className={styles.marqueeText}>
            <span className={styles.marqueeSub} lang="ja">
              {t.signSub}
            </span>
            <span className={styles.marqueeMain}>{t.sign}</span>
          </span>
          <span className={styles.marqueeBulbs} />
        </div>

        <div className={styles.wheelBox} ref={wheelRef}>
          <Wheel
            run={wheelRun}
            skipped={skipped}
            rest={rest}
            restLamp={restLamp}
            phase={running ? phase : attract ? 'idle' : phase === 'done' ? 'done' : 'idle'}
            win={won}
            hub={hub}
            calm={calm}
            label={t.wheelLabel(wheelState)}
            onPhase={onPhase}
            onFlap={flap}
            onLamp={() => play('hold')}
            onDone={finished}
          />
          {/* Words over the wheel, always there and only shown when they have something to say: nothing moves when they do. */}
          <span className={styles.banner} data-testid="bw-banner" data-show={banner ? 'true' : 'false'} data-kind={phase} aria-hidden="true">
            {banner ?? ''}
          </span>
          {(resumed || (outcome?.earlier && !running)) && (
            <span className={styles.resumedBadge} data-testid="bw-resumed">
              {t.resumed}
            </span>
          )}
        </div>

        <p className={styles.status} data-testid="bw-status">
          {statusText}
        </p>

        {/* The medals, the board's medals and the win, on LED counters as a medal machine shows them. The numbers are in
            type beside them, for a screen reader and for anything else that reads the page. */}
        <div className={styles.meters}>
          <div className={`${styles.meterCell} ${styles.meterMedals}`}>
            <span className={styles.meterLabel}>{t.medals}</span>
            <span className={styles.meterValue} data-testid="bw-medals" data-loaded={medalsShown !== null}>
              {medalsShown === null ? '—' : fmt(medalsShown)}
            </span>
            <span className={styles.led} data-testid="bw-medals-led" data-shown={meter.shown ?? ''}>
              <SegmentDisplay value={meter.shown ?? ''} places={MEDAL_PLACES} />
            </span>
          </div>
          <div className={styles.meterCell}>
            <span className={styles.meterLabel}>{t.bet}</span>
            <span className={styles.meterValue} data-testid="bw-bet">
              {shownBet}
            </span>
            <span className={styles.led}>
              <SegmentDisplay value={shownBet} places={BET_PLACES} tone="amber" />
            </span>
          </div>
          <div className={`${styles.meterCell} ${won ? styles.meterWin : ''}`}>
            <span className={styles.meterLabel}>{t.win}</span>
            <span className={styles.meterValue} data-testid="bw-win">
              {winShown}
            </span>
            <span className={styles.led} data-testid="bw-win-led" data-shown={winMeter.shown ?? 0}>
              <SegmentDisplay value={winMeter.shown ?? 0} places={WIN_PLACES} tone="amber" />
            </span>
          </div>
        </div>

        {/* The betting board: the seven numbers, each in its colour on the wheel, with how many segments it has. */}
        <section className={styles.board} aria-labelledby="bw-board-title" data-testid="bw-board">
          <h2 id="bw-board-title" className={styles.boardTitle}>
            {t.boardTitle}
          </h2>
          <div className={styles.spots}>
            {SPOTS.map((spot, i) => {
              const look = lookOf(spot);
              const onIt = bets[spot] ?? 0;
              const hit = !running && outcome !== null && outcome.spot === spot && phase === 'done';
              return (
                <button
                  key={spot}
                  type="button"
                  className={styles.spot}
                  style={{ '--fill': look.fill, '--edge': look.edge, '--ink': look.ink } as CSSProperties}
                  data-testid={`bw-spot-${spot}`}
                  data-amount={onIt}
                  data-hit={hit ? 'true' : 'false'}
                  data-key={i + 1}
                  aria-label={t.spotAria(spot, onIt, SEGMENTS_OF[spot])}
                  disabled={!canBet}
                  onClick={() => addBet(spot)}
                >
                  <span className={styles.spotPays} aria-hidden="true">
                    ×{spot}
                  </span>
                  <span className={styles.spotSegments} aria-hidden="true">
                    {t.segmentsOf(SEGMENTS_OF[spot])}
                  </span>
                  <span className={styles.spotMedals} data-on={onIt > 0 ? 'true' : 'false'} aria-hidden="true">
                    {onIt > 0 ? onIt : ''}
                  </span>
                </button>
              );
            })}
            {/* The eighth cell of the board: what a BONUS stop brings, to read, not to bet on. */}
            <div className={styles.spotBonus} aria-hidden="true">
              <span className={styles.spotPays}>★</span>
              <span className={styles.spotSegments}>{t.segmentsOf(4)}</span>
              <span className={styles.spotBonusText}>{t.bonusBanner}</span>
            </div>
          </div>
        </section>

        <div className={styles.controls}>
          <div className={styles.steps} role="radiogroup" aria-label={t.stepGroup}>
            <span className={styles.stepsLabel} aria-hidden="true">
              {t.stepGroup}
            </span>
            {BET_STEPS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={step === value}
                aria-label={t.stepAria(value)}
                className={styles.stepButton}
                data-testid={`bw-step-${value}`}
                disabled={spinning}
                onClick={() => {
                  setStep(value);
                  play('button');
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <div className={styles.boardButtons}>
            <button type="button" className={styles.btn} data-testid="bw-undo" onClick={undo} disabled={!canBet || totalBet === 0}>
              {t.undo}
            </button>
            <button type="button" className={styles.btn} data-testid="bw-clear" onClick={clear} disabled={!canBet || totalBet === 0}>
              {t.clear}
            </button>
            <button type="button" className={styles.btn} data-testid="bw-rebet" onClick={rebet} disabled={!canBet || lastBets.length === 0 || totalBet > 0}>
              {t.rebet}
              {lastTotal > 0 && <span className={styles.rebetCount}> {lastTotal}</span>}
            </button>
          </div>
          <div className={styles.mainButtons}>
            <button type="button" className={styles.spinButton} data-testid="bw-spin" onClick={spin} disabled={!canBet || totalBet === 0}>
              {t.spin}
            </button>
            <button type="button" className={styles.skipButton} data-testid="bw-skip" onClick={skip} disabled={!spinning || skipped}>
              {t.skip}
            </button>
          </div>
        </div>

        <p className={styles.message} role="status" data-testid="bw-message">
          {message}
        </p>

        <div className={styles.outRow}>
          {refillDue && (
            <button type="button" className={styles.refill} data-testid="bw-refill" onClick={() => medalBank().refill()}>
              <RefillWords text={t.refill(REFILL)} />
            </button>
          )}
          {outOfMedals && !refillDue && <MedalsOut games={bankState.out} language={language} className={styles.outNote} testId="bw-out" />}
        </div>

        <div className={styles.secondaryRow}>
          <SoundSwitch control={sound} language={language} className={styles.btn} testId="bw-sound" />
        </div>
        <KeysHint text={t.keysHint} className={styles.keysHint} testId="bw-keys" />

        <div className={styles.medalNotes}>
          <p data-testid="bw-not-money">{t.notMoney}</p>
          <p>
            {t.centerNote}{' '}
            <a className={styles.link} href={MEDAL_CENTER_PATH} data-testid="bw-center-note-link">
              {t.centerNoteLink}
            </a>
          </p>
        </div>

        {/* The player's medals are in another tab's game: the machine stands still until it is played here again. */}
        {cardAway && (
          <div className={styles.cardAway} role="status" data-testid="bw-card-away">
            <p>{t.cardAway}</p>
            <button type="button" className={styles.cardAwayButton} data-testid="bw-play-here" onClick={() => seat.current?.play()}>
              {t.playHere}
            </button>
          </div>
        )}
      </div>

      <div className={styles.side}>
        <section className={styles.panel} aria-labelledby="bw-history-title">
          <h2 id="bw-history-title" className={styles.panelTitle}>
            {t.historyTitle}
          </h2>
          {history.length === 0 ? (
            <p className={styles.muted}>{t.historyEmpty}</p>
          ) : (
            <ol className={styles.historyList} data-testid="bw-history">
              {history.map((entry) => {
                const look = lookOf(entry.spot);
                return (
                  <li
                    key={entry.id}
                    className={styles.historyChip}
                    style={{ '--fill': look.fill, '--ink': look.ink } as CSSProperties}
                    data-bonus={entry.bonus ? 'true' : 'false'}
                    data-won={entry.won > 0 ? 'true' : 'false'}
                    title={entry.bonus ? t.historyBonus(entry.multiplier) : undefined}
                  >
                    {entry.bonus && <span className={styles.historyStar}>★×{entry.multiplier}</span>}
                    <span>{entry.spot}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="bw-session-title">
          <h2 id="bw-session-title" className={styles.panelTitle}>
            {t.sessionTitle}
          </h2>
          <dl className={styles.statList}>
            <div>
              <dt>{t.spins}</dt>
              <dd data-testid="bw-stat-spins">{fmt(stats.spins)}</dd>
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
              <dt>{t.bonuses}</dt>
              <dd>{fmt(stats.bonuses)}</dd>
            </div>
            <div>
              <dt>{t.biggest}</dt>
              <dd>{fmt(stats.biggest)}</dd>
            </div>
            <div>
              <dt>{t.cameBack}</dt>
              <dd>{observed === null ? '—' : pct(observed)}</dd>
            </div>
            <div>
              <dt>{t.machineReturn}</dt>
              <dd>{pct(0.9, 0)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.srOnly} aria-live="polite" data-testid="bw-announcement">
        {announcement}
      </p>
    </div>
  );
};

/** The numbers of the board, in the order of the keys 1 to 7. */
export const KEY_SPOTS: readonly Spot[] = SPOTS;
/** The lamps, for the Odds tab and the tests. */
export const HUB_LAMPS: readonly Multiplier[] = LAMPS;

export default PlayTab;
